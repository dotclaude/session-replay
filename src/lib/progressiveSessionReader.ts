// Progressive session reader - only loads metadata, not full JSONL content

import { readJsonLines, readJson, isUuidDir } from './claudeReader/fileUtils';
import { summariseSession } from './claudeReader/summariseSession';
import type { SessionMetadata, ProjectCache } from './sessionsStore';

interface LightweightSessionMetadata extends Omit<SessionMetadata, 'lines'> {
  lines?: never; // Explicitly omit lines in lightweight mode
}

/**
 * Scan directory structure and read only session metadata (no full JSONL content)
 * This is MUCH faster for large directories with thousands of sessions
 */
export interface ScanProgress {
  projectsScanned: number;
  sessionsFound: number;
  currentProject: string | null;
}

export async function scanProjectsMetadata(
  claudeHandle: FileSystemDirectoryHandle,
  onProgress?: (progress: ScanProgress) => void
): Promise<ProjectCache[]> {
  const projects: ProjectCache[] = [];
  let projectsScanned = 0;
  let sessionsFound = 0;

  const projectsHandle = await claudeHandle.getDirectoryHandle("projects", { create: false });

  for await (const [projectDirName, projectHandle] of projectsHandle.entries()) {
    if (projectHandle.kind !== "directory") continue;

    onProgress?.({ projectsScanned, sessionsFound, currentProject: projectDirName });

    try {
      const sessions = await scanProjectSessions(projectHandle as FileSystemDirectoryHandle);

      if (sessions.length === 0) continue;

      // Extract cwd from first session or sessions-index.json
      let cwd: string | null = null;
      try {
        const indexHandle = await projectHandle.getFileHandle("sessions-index.json", { create: false });
        const index = await readJson(indexHandle as FileSystemFileHandle);
        cwd = index?.originalPath || index?.entries?.[0]?.projectPath || null;
      } catch {
        // Try first session
        cwd = sessions.find(s => s.cwd)?.cwd || null;
      }

      const label = cwd ? cwd.split('/').pop() || cwd : projectDirName.replace(/^-/, '').replace(/-/g, '/');

      // Find most recent timestamp
      let firstTs: string | null = null;
      for (const s of sessions) {
        if (s.firstTs && (!firstTs || s.firstTs > firstTs)) {
          firstTs = s.firstTs;
        }
      }

      const sessionCount = sessions.filter(s => !s.isSubAgent).length;
      const subAgentCount = sessions.filter(s => s.isSubAgent).length;

      if (sessionCount === 0 && subAgentCount === 0) continue;

      projectsScanned++;
      sessionsFound += sessionCount;

      projects.push({
        id: projectDirName,
        label,
        cwd,
        sessionCount,
        subAgentCount,
        firstTs,
        sessions: sessions as any,
      });

      onProgress?.({ projectsScanned, sessionsFound, currentProject: projectDirName });
    } catch (err) {
      console.warn(`Skipping project ${projectDirName}:`, err);
      continue;
    }
  }

  projects.sort((a, b) => (b.firstTs || "").localeCompare(a.firstTs || ""));

  return projects;
}

/**
 * Scan a single project's sessions - only read first/last lines for metadata
 */
async function scanProjectSessions(
  projDirHandle: FileSystemDirectoryHandle
): Promise<LightweightSessionMetadata[]> {
  const sessions: LightweightSessionMetadata[] = [];
  const entries: [string, FileSystemHandle][] = [];

  for await (const entry of projDirHandle.entries()) {
    entries.push(entry);
  }

  // Scan direct .jsonl files (Format A - main sessions)
  for (const [name, handle] of entries) {
    if (handle.kind !== "file") continue;
    if (!name.endsWith('.jsonl')) continue;

    const id = name.replace('.jsonl', '');
    if (!isUuidDir(id)) continue;

    const fileHandle = handle as FileSystemFileHandle;

    // Read only first/last 50 lines for metadata (much faster than full file)
    const meta = await extractLightweightMetadata(fileHandle);

    sessions.push({
      id,
      projectId: projDirHandle.name,
      isSubAgent: false,
      ...meta,
    });
  }

  // Scan subdirectories for sub-agents (Format C)
  // Skip this for progressive loading - sub-agents are loaded on-demand with parent session
  // Just count them for the subAgentCount field
  let subAgentCount = 0;
  for (const [dirName, handle] of entries) {
    if (handle.kind !== "directory") continue;
    if (!isUuidDir(dirName)) continue;

    try {
      const sessionDir = handle as FileSystemDirectoryHandle;
      const subagentsDir = await sessionDir.getDirectoryHandle("subagents", { create: false });

      // Count agent files
      for await (const [fileName] of subagentsDir.entries()) {
        if (fileName.endsWith('.jsonl') && !fileName.includes('.meta.')) {
          subAgentCount++;
        }
      }
    } catch {
      // No subagents directory - that's fine
    }
  }

  sessions.sort((a, b) => (b.firstTs || "").localeCompare(a.firstTs || ""));

  return sessions;
}

// Lines longer than this are tool results / file contents — strip their payload
// before JSON parsing so we get metadata fields without the memory cost.
const LINE_TRUNCATE_BYTES = 4_000;

/**
 * Extract metadata by reading every line of the file but truncating
 * oversized lines before JSON parsing. This gives accurate tool counts,
 * turn counts, and token totals across the whole session while keeping
 * memory use proportional to the number of lines, not their total size.
 */
async function extractLightweightMetadata(
  fileHandle: FileSystemFileHandle
): Promise<Omit<SessionMetadata, 'id' | 'projectId' | 'isSubAgent' | 'lines'>> {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();

    const parsed = text.split('\n').filter(Boolean).map(line => {
      try {
        // For short lines parse directly — fast path
        if (line.length <= LINE_TRUNCATE_BYTES) return JSON.parse(line);
        // For long lines strip the large content arrays/strings before parsing
        // so we still get type, timestamp, usage, tool names, etc.
        return parseLineStrippingContent(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return summariseSession(parsed);
  } catch (err) {
    console.warn('Failed to extract metadata:', err);
    return {
      title: null,
      summary: null,
      firstTs: null,
      lastTs: null,
      cwd: null,
      gitBranch: null,
      prLinks: [],
      turnCount: 0,
      humanTurns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      toolCounts: {},
      lineCount: 0,
    };
  }
}

/**
 * Parse a long JSONL line by replacing large string values and content arrays
 * with stubs so JSON.parse succeeds cheaply. Preserves all metadata fields
 * (type, timestamp, usage, tool_use name/id, subtype, etc.).
 */
function parseLineStrippingContent(line: string): unknown | null {
  try {
    // Replace "content": "<long string>" with empty string
    let stripped = line.replace(/"content"\s*:\s*"(?:[^"\\]|\\.){200,}"/g, '"content":""');
    // Replace "text": "<long string>" with empty string
    stripped = stripped.replace(/"text"\s*:\s*"(?:[^"\\]|\\.){200,}"/g, '"text":""');
    // Replace "input": { ... large object ... } — keep key but stub value
    // Only strip if the input object is very large (heuristic: >500 chars)
    stripped = stripped.replace(/"input"\s*:\s*(\{[^{}]{500,}\})/g, '"input":{}');
    return JSON.parse(stripped);
  } catch {
    // If stripping mangled the JSON, give up on this line
    return null;
  }
}

/**
 * Load a sub-agent session JSONL from <projectId>/<parentSessionId>/subagents/agent-<agentId>.jsonl
 */
export async function loadSubAgentSession(
  claudeHandle: FileSystemDirectoryHandle,
  projectId: string,
  parentSessionId: string,
  agentId: string
): Promise<unknown[]> {
  const projectsHandle = await claudeHandle.getDirectoryHandle("projects", { create: false });
  const projectHandle = await projectsHandle.getDirectoryHandle(projectId, { create: false });
  const parentHandle = await projectHandle.getDirectoryHandle(parentSessionId, { create: false });
  const subagentsHandle = await parentHandle.getDirectoryHandle("subagents", { create: false });
  const fileHandle = await subagentsHandle.getFileHandle(`agent-${agentId}.jsonl`, { create: false });
  return await readJsonLines(fileHandle as FileSystemFileHandle);
}

/**
 * List all sub-agent IDs for a session, sorted by first-line timestamp (creation order).
 * Returns agent IDs (without the "agent-" prefix), e.g. ["a412f30f...", "a59613f6..."]
 */
export async function listSubAgentIds(
  claudeHandle: FileSystemDirectoryHandle,
  projectId: string,
  parentSessionId: string
): Promise<string[]> {
  try {
    const projectsHandle = await claudeHandle.getDirectoryHandle("projects", { create: false });
    const projectHandle = await projectsHandle.getDirectoryHandle(projectId, { create: false });
    const parentHandle = await projectHandle.getDirectoryHandle(parentSessionId, { create: false });
    const subagentsHandle = await parentHandle.getDirectoryHandle("subagents", { create: false });

    const entries: { agentId: string; firstTs: string }[] = [];
    for await (const [name, handle] of subagentsHandle.entries()) {
      if (handle.kind !== 'file') continue;
      if (!name.endsWith('.jsonl') || name.includes('.meta.')) continue;
      const agentId = name.replace(/^agent-/, '').replace(/\.jsonl$/, '');

      // Read only first line for timestamp
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const chunk = await file.slice(0, 200).text();
        const firstLine = chunk.split('\n')[0];
        const parsed = JSON.parse(firstLine);
        entries.push({ agentId, firstTs: parsed.timestamp || '' });
      } catch {
        entries.push({ agentId, firstTs: '' });
      }
    }

    // Sort by first timestamp ascending; tiebreak by agentId for stable ordering
    entries.sort((a, b) => {
      const tsCmp = a.firstTs.localeCompare(b.firstTs);
      return tsCmp !== 0 ? tsCmp : a.agentId.localeCompare(b.agentId);
    });
    return entries.map(e => e.agentId);
  } catch {
    return [];
  }
}

/**
 * Check if a sub-agent JSONL file exists without reading it
 */
export async function checkSubAgentExists(
  claudeHandle: FileSystemDirectoryHandle,
  projectId: string,
  parentSessionId: string,
  agentId: string
): Promise<boolean> {
  try {
    const projectsHandle = await claudeHandle.getDirectoryHandle("projects", { create: false });
    const projectHandle = await projectsHandle.getDirectoryHandle(projectId, { create: false });
    const parentHandle = await projectHandle.getDirectoryHandle(parentSessionId, { create: false });
    const subagentsHandle = await parentHandle.getDirectoryHandle("subagents", { create: false });
    await subagentsHandle.getFileHandle(`agent-${agentId}.jsonl`, { create: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load full session content only when needed (for replay)
 */
export async function loadFullSession(
  claudeHandle: FileSystemDirectoryHandle,
  projectId: string,
  sessionId: string
): Promise<unknown[]> {
  const projectsHandle = await claudeHandle.getDirectoryHandle("projects", { create: false });
  const projectHandle = await projectsHandle.getDirectoryHandle(projectId, { create: false });
  const sessionHandle = await projectHandle.getFileHandle(`${sessionId}.jsonl`, { create: false });

  return await readJsonLines(sessionHandle as FileSystemFileHandle);
}
