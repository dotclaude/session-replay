/**
 * buildSteps
 *
 * Converts a parsed EventList (from parseSession) into an AnimationStep[].
 */

function toolDescription(event) {
  const { toolName, toolInput } = event;
  switch (toolName) {
    case 'Bash':      return `$ ${(toolInput.command || '').slice(0, 60)}`;
    case 'Write':     return `Write ${toolInput.file_path || ''}`;
    case 'Edit':      return `Edit ${toolInput.file_path || ''}`;
    case 'Read':      return `Read ${toolInput.file_path || ''}`;
    case 'Agent':     return `Agent: ${(toolInput.description || toolInput.prompt || '').slice(0, 50)}`;
    case 'Skill':     return `Skill: ${toolInput.skill || ''}`;
    case 'WebFetch':  return `Fetch ${(toolInput.url || '').slice(0, 60)}`;
    case 'WebSearch': return `Search: ${(toolInput.query || '').slice(0, 50)}`;
    case 'TaskCreate': return `Task: ${toolInput.subject || ''}`;
    case 'TaskUpdate': return `Task #${toolInput.taskId} → ${toolInput.status || ''}`;
    default:          return toolName;
  }
}

function toolKind(toolName) {
  switch (toolName) {
    case 'Bash':        return 'tool-bash';
    case 'Write':       return 'tool-write';
    case 'Edit':        return 'tool-edit';
    case 'Read':        return 'tool-read';
    case 'Agent':       return 'tool-agent';
    case 'Skill':       return 'tool-skill';
    case 'WebFetch':
    case 'WebSearch':   return 'tool-web';
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet':     return 'tool-task';
    default:            return 'tool-generic';
  }
}

export function buildSteps(events) {
  const steps = [];

  const metaEvents = events.filter(e => e.kind === 'session-meta');
  const titleEvent = metaEvents.find(e => e.metaType === 'custom-title');

  steps.push({
    action: 'session-header',
    kind: 'session-header',
    description: 'Session start',
    timestamp: events[0]?.timestamp || null,
    event: { title: titleEvent?.value || null, allMeta: metaEvents },
    index: 0,
  });

  for (const event of events) {
    const { kind, timestamp } = event;

    if (kind === 'session-meta' || kind === 'turn-duration') continue;

    let step = null;

    switch (kind) {
      case 'human':
        step = {
          action: 'show-human',
          kind: 'human',
          description: `You: ${event.text.slice(0, 60)}${event.text.length > 60 ? '…' : ''}`,
          timestamp,
          event,
        };
        break;

      case 'assistant-text':
        step = {
          action: 'show-assistant-text',
          kind: 'assistant-text',
          description: `Claude: ${event.text.slice(0, 55)}${event.text.length > 55 ? '…' : ''}`,
          timestamp,
          event,
        };
        break;

      case 'tool-call': {
        const desc = toolDescription(event);
        step = {
          action: 'show-tool-call',
          kind: toolKind(event.toolName),
          description: desc,
          timestamp,
          event,
        };
        break;
      }

      case 'turn-summary':
        step = {
          action: 'show-turn-summary',
          kind: 'turn-summary',
          description: `Summary: ${event.text.slice(0, 60)}…`,
          timestamp,
          event,
        };
        break;

      case 'pr-link':
        step = {
          action: 'show-pr-link',
          kind: 'pr-link',
          description: `PR #${event.prNumber}: ${event.prRepository}`,
          timestamp,
          event,
        };
        break;

      case 'hook-event':
        step = {
          action: 'show-hook-event',
          kind: 'hook-event',
          description: `Hook: ${event.hookName} (${event.hookEvent})`,
          timestamp,
          event,
        };
        break;

      case 'agent-progress': {
        const innerText = event.innerMessage?.message?.content;
        const preview = Array.isArray(innerText)
          ? innerText.find(b => b.type === 'text')?.text?.slice(0, 50) || ''
          : typeof innerText === 'string' ? innerText.slice(0, 50) : '';
        step = {
          action: 'show-agent-progress',
          kind: 'agent-progress',
          description: `Agent ${(event.agentId || '').slice(0, 8)}: ${preview}`,
          timestamp,
          event,
        };
        break;
      }

      case 'compaction-event':
        step = {
          action: 'show-compaction',
          kind: 'compaction-event',
          description: `Compact: ${event.preTokens ? event.preTokens.toLocaleString() : '?'} tokens → boundary`,
          timestamp,
          event,
        };
        break;

      case 'queue-op':
        step = {
          action: 'show-queue-op',
          kind: 'queue-op',
          description: `${event.operation}: ${(event.summary || event.taskId || '').slice(0, 50)}`,
          timestamp,
          event,
        };
        break;

      case 'error-event':
        step = {
          action: 'show-error',
          kind: 'error-event',
          description: `Error: ${(event.error || '').slice(0, 60)}`,
          timestamp,
          event,
        };
        break;

      case 'local-command':
        step = {
          action: 'show-local-command',
          kind: 'local-command',
          description: `${event.commandName}${event.commandArgs ? ': ' + event.commandArgs.slice(0, 50) : ''}`,
          timestamp,
          event,
        };
        break;

      case 'local-command-output':
        step = {
          action: 'show-local-command-output',
          kind: 'local-command-output',
          description: `Output: ${event.text.slice(0, 60)}`,
          timestamp,
          event,
        };
        break;

      default:
        break;
    }

    if (step) {
      step.index = steps.length;
      steps.push(step);
    }
  }

  // Post-processing: annotate steps with turn-duration data
  const durationByUuid = new Map();
  for (const e of events) {
    if (e.kind === 'turn-duration' && e.parentUuid) {
      durationByUuid.set(e.parentUuid, e.durationMs);
    }
  }
  for (const step of steps) {
    const uuid = step.event?.uuid;
    if (uuid && durationByUuid.has(uuid)) {
      step.event.turnDurationMs = durationByUuid.get(uuid);
    }
  }

  return steps;
}
