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
export async function scanProjectsMetadata(
  claudeHandle: FileSystemDirectoryHandle
): Promise<ProjectCache[]> {
  const projects: ProjectCache[] = [];

  const projectsHandle = await claudeHandle.getDirectoryHandle("projects", { create: false });

  for await (const [projectDirName, projectHandle] of projectsHandle.entries()) {
    if (projectHandle.kind !== "directory") continue;

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

      projects.push({
        id: projectDirName,
        label,
        cwd,
        sessionCount,
        subAgentCount,
        firstTs,
        sessions: sessions as any, // Will be lightweight
      });
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

  // Quick scan: Only process direct .jsonl files
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

  sessions.sort((a, b) => (b.firstTs || "").localeCompare(a.firstTs || ""));

  return sessions;
}

/**
 * Extract metadata by reading only the beginning and end of a JSONL file
 * Avoids loading massive sessions (some can be 10MB+)
 */
async function extractLightweightMetadata(
  fileHandle: FileSystemFileHandle
): Promise<Omit<SessionMetadata, 'id' | 'projectId' | 'isSubAgent' | 'lines'>> {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();

    // For small files (<100KB), just parse everything
    if (file.size < 100_000) {
      const lines = readJsonLines(fileHandle);
      return summariseSession(await lines);
    }

    // For large files, read first 20KB and last 10KB
    const firstChunk = text.slice(0, 20_000);
    const lastChunk = text.slice(-10_000);

    const firstLines = firstChunk.split('\n').filter(Boolean).slice(0, 50);
    const lastLines = lastChunk.split('\n').filter(Boolean).slice(-20);

    const sampledLines = [...firstLines, ...lastLines].map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return summariseSession(sampledLines);
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
