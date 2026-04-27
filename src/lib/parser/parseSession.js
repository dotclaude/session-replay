/**
 * parseSession
 *
 * Converts raw JSONL lines (as parsed JSON objects) into an ordered list of
 * typed events. Handles the uuid/parentUuid tree, groups tool_use + tool_result
 * pairs, and strips genuinely noisy entries.
 *
 * Returns: Event[]
 */

import { parseLocalCommand, parseLocalCommandOutput } from './parseLocalCommands.js';

const NOISE_TYPES = new Set([
  'file-history-snapshot',
  'attachment',
  'permission-mode',
  'last-prompt',
]);

function extractXmlField(xml, tag) {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

// Detect user entries that are actually system/tool injections, not human text.
// These appear as `user` type in the JSONL but are injected by the CLI harness.
function isSystemInjectedText(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trimStart();
  return (
    t.startsWith('<local-command-caveat>') ||
    t.startsWith('<command-name>') ||
    t.startsWith('<local-command-stdout>') ||
    t.startsWith('<system-reminder>') ||
    t.startsWith('<task-notification>') ||
    t.startsWith('[Request interrupted by user') ||  // Also catches "[Request interrupted by user for tool use]"
    t.startsWith('Tool loaded.') ||  // Tool loaded notifications
    // Skill blobs — large markdown injections starting with "Base directory for this skill:"
    t.startsWith('Base directory for this skill:') ||
    // Tool error injections
    (t.startsWith('Error:') && text.length < 80 && !text.includes('\n'))
  );
}

export function parseSession(lines) {
  // Index all entries by uuid for result-pairing
  const byUuid = {};
  for (const obj of lines) {
    if (obj.uuid) byUuid[obj.uuid] = obj;
  }

  // Build tool_use_id → tool_result map from user messages
  const toolResults = {};
  for (const obj of lines) {
    if (obj.type !== 'user') continue;
    const content = obj.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_result') {
        const text = Array.isArray(block.content)
          ? block.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
          : typeof block.content === 'string'
          ? block.content
          : '';
        toolResults[block.tool_use_id] = {
          text,
          isError: block.is_error || false,
          uuid: obj.uuid,
          timestamp: obj.timestamp,
        };
      }
    }
  }

  // Build uuid → local-command-output map (outputs follow commands by parentUuid)
  const localCommandOutputs = {};
  for (const obj of lines) {
    if (obj.type !== 'user') continue;
    const content = obj.message?.content;
    if (typeof content === 'string') {
      const output = parseLocalCommandOutput(content);
      if (output && obj.parentUuid) {
        localCommandOutputs[obj.parentUuid] = {
          text: output.text,
          uuid: obj.uuid,
          timestamp: obj.timestamp,
        };
      }
    }
  }

  // Build sourceToolUseID → skill documentation map (for Skill tool invocations)
  const skillDocs = {};
  for (const obj of lines) {
    if (obj.type !== 'user' || !obj.isMeta || !obj.sourceToolUseID) continue;
    const content = obj.message?.content;
    if (Array.isArray(content)) {
      const textBlocks = content.filter(b => b.type === 'text');
      if (textBlocks.length > 0) {
        skillDocs[obj.sourceToolUseID] = textBlocks.map(b => b.text).join('\n');
      }
    }
  }

  // Build tool_use_id → agentId map from agent_progress entries
  const agentIdByToolUseId = {};
  for (const obj of lines) {
    if (obj.type !== 'progress') continue;
    const data = obj.data || {};
    if (data.type !== 'agent_progress' || !data.agentId || !obj.parentToolUseID) continue;
    if (!agentIdByToolUseId[obj.parentToolUseID]) {
      agentIdByToolUseId[obj.parentToolUseID] = data.agentId;
    }
  }

  const events = [];
  const seenToolUseIds = new Set();

  // Track turn numbers (user→assistant pairs)
  let currentTurn = 0;
  let lastWasUser = false;

  for (const obj of lines) {
    const { type, timestamp, uuid, parentUuid, isSidechain } = obj;

    // Increment turn number on user messages (start of new turn)
    if (type === 'user' && !obj.isMeta && !obj.sourceToolUseID) {
      const content = obj.message?.content;
      // Only count as a turn if it's actual user input (not tool results)
      const isActualUserInput = (typeof content === 'string' && !isSystemInjectedText(content)) ||
        (Array.isArray(content) && content.some(b => b.type === 'text') && !content.some(b => b.type === 'tool_result'));

      if (isActualUserInput) {
        currentTurn++;
        lastWasUser = true;
      }
    }

    if (NOISE_TYPES.has(type)) continue;

    // -------------------------------------------------------------------------
    // progress entries — three subtypes
    // -------------------------------------------------------------------------
    if (type === 'progress') {
      const data = obj.data || {};

      if (data.type === 'hook_progress') {
        events.push({
          kind: 'hook-event',
          timestamp,
          uuid,
          parentUuid,
          isSidechain,
          turnNumber: currentTurn,
          hookEvent: data.hookEvent,
          hookName: data.hookName,
          command: data.command,
          parentToolUseID: obj.parentToolUseID,
        });
      } else if (data.type === 'agent_progress') {
        events.push({
          kind: 'agent-progress',
          timestamp,
          uuid,
          parentUuid,
          isSidechain,
          turnNumber: currentTurn,
          agentId: data.agentId,
          prompt: data.prompt,
          innerMessage: data.message,
        });
      }
      // task_progress and others are low-value noise — skip
      continue;
    }

    // -------------------------------------------------------------------------
    // queue-operation entries
    // -------------------------------------------------------------------------
    if (type === 'queue-operation') {
      events.push({
        kind: 'queue-op',
        timestamp,
        uuid,
        parentUuid,
        turnNumber: currentTurn,
        operation: obj.operation,
        taskId: extractXmlField(obj.content, 'task-id'),
        summary: extractXmlField(obj.content, 'summary'),
        totalTokens: parseInt(extractXmlField(obj.content, 'total_tokens') || '0', 10),
        toolUses: parseInt(extractXmlField(obj.content, 'tool_uses') || '0', 10),
        durationMs: parseInt(extractXmlField(obj.content, 'duration_ms') || '0', 10),
      });
      continue;
    }

    // -------------------------------------------------------------------------
    // Human turns
    // -------------------------------------------------------------------------
    if (type === 'user') {
      // Skip metadata messages (skill docs, tool-loaded notifications, etc.)
      if (obj.isMeta || obj.sourceToolUseID) {
        continue;
      }
      const content = obj.message?.content;
      if (typeof content === 'string') {
        const text = content;

        // Check for local command (CLI commands like /model, /dispatch)
        const localCmd = parseLocalCommand(text);
        if (localCmd) {
          const output = localCommandOutputs[uuid];
          events.push({
            kind: 'local-command',
            timestamp,
            uuid,
            parentUuid,
            isSidechain,
            turnNumber: currentTurn,
            commandName: localCmd.commandName,
            commandMessage: localCmd.commandMessage,
            commandArgs: localCmd.commandArgs,
            output,  // Attached output if available
          });
          continue;
        }

        // Check for local command output - skip if already attached to command
        const localOutput = parseLocalCommandOutput(text);
        if (localOutput) {
          // Skip - outputs are now attached to their parent commands
          continue;
        }

        if (!isSystemInjectedText(text)) {
          events.push({ kind: 'human', timestamp, uuid, parentUuid, isSidechain, turnNumber: currentTurn, text });
        }
        continue;
      }
      if (Array.isArray(content)) {
        const textBlocks = content.filter(b => b.type === 'text');
        const toolResultBlocks = content.filter(b => b.type === 'tool_result');
        // Only show as human input if there are text blocks AND no tool results
        // (tool results are handled separately and should not appear as user messages)
        if (textBlocks.length > 0 && toolResultBlocks.length === 0) {
          const text = textBlocks.map(b => b.text).join('\n');
          if (!isSystemInjectedText(text)) {
            events.push({ kind: 'human', timestamp, uuid, parentUuid, isSidechain, turnNumber: currentTurn, text });
          }
        }
        // Skip user messages that contain ONLY tool results - they're not human input
      }
      continue;
    }

    // -------------------------------------------------------------------------
    // Assistant messages
    // -------------------------------------------------------------------------
    if (type === 'assistant') {
      const content = obj.message?.content || [];
      const usage = obj.message?.usage || {};
      const model = obj.message?.model || null;
      const stopReason = obj.message?.stop_reason || null;
      const messageId = obj.message?.id || null;
      const isApiError = obj.isApiErrorMessage || false;
      const error = obj.error || null;
      const version = obj.version || null;

      // Emit error event if this is an API error
      if (isApiError && error) {
        events.push({
          kind: 'error-event',
          timestamp,
          uuid,
          parentUuid,
          isSidechain,
          turnNumber: currentTurn,
          error,
          messageId,
          model,
        });
        continue;
      }

      for (const block of content) {
        if (block.type === 'text' && block.text?.trim()) {
          events.push({
            kind: 'assistant-text',
            timestamp,
            uuid,
            parentUuid,
            isSidechain,
            turnNumber: currentTurn,
            text: block.text,
            usage,
            model,
            stopReason,
            messageId,
            version,
          });
        }

        if (block.type === 'tool_use') {
          if (seenToolUseIds.has(block.id)) continue;
          seenToolUseIds.add(block.id);

          const result = toolResults[block.id] || null;
          const skillDoc = block.name === 'Skill' ? skillDocs[block.id] : null;
          events.push({
            kind: 'tool-call',
            timestamp,
            uuid,
            parentUuid,
            isSidechain,
            turnNumber: currentTurn,
            toolName: block.name,
            toolInput: block.input || {},
            toolUseId: block.id,
            result,
            skillDoc,  // Attach skill documentation if this is a Skill tool
            subAgentId: block.name === 'Agent' ? (agentIdByToolUseId[block.id] || null) : null,
            usage,
            model,
            stopReason,
            messageId,
            version,
          });
        }
      }
      continue;
    }

    // -------------------------------------------------------------------------
    // System entries
    // -------------------------------------------------------------------------
    if (type === 'system') {
      if (obj.subtype === 'away_summary') {
        events.push({ kind: 'turn-summary', timestamp, uuid, parentUuid, turnNumber: currentTurn, text: obj.content });
      } else if (obj.subtype === 'turn_duration') {
        events.push({
          kind: 'turn-duration',
          timestamp,
          uuid,
          parentUuid,
          turnNumber: currentTurn,
          durationMs: obj.durationMs,
          messageCount: obj.messageCount,
        });
      } else if (obj.subtype === 'compact_boundary') {
        events.push({
          kind: 'compaction-event',
          timestamp,
          uuid,
          parentUuid,
          turnNumber: currentTurn,
          preTokens: obj.compactMetadata?.preTokens || null,
          preCompactDiscoveredTools: obj.compactMetadata?.preCompactDiscoveredTools || [],
          trigger: obj.compactMetadata?.trigger || null,
        });
      }
      continue;
    }

    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------
    if (type === 'pr-link') {
      events.push({
        kind: 'pr-link',
        timestamp,
        uuid,
        turnNumber: currentTurn,
        prNumber: obj.prNumber,
        prUrl: obj.prUrl,
        prRepository: obj.prRepository,
      });
      continue;
    }

    if (type === 'custom-title' || type === 'agent-name') {
      events.push({
        kind: 'session-meta',
        timestamp,
        uuid,
        turnNumber: currentTurn,
        metaType: type,
        value: obj.customTitle || obj.agentName,
      });
      continue;
    }
  }

  events.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  return events;
}
