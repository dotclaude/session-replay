// Session discovery logic (ported from bridge server.js L62-178)

import type { SessionMetadata } from "../sessionsStore";
import { readJsonLines, readJson, isUuidDir } from "./fileUtils";
import { summariseSession } from "./summariseSession";

interface SessionDiscoveryResult {
  id: string;
  fileHandle?: FileSystemFileHandle;
  indexEntry?: any;
  isSubAgent?: boolean;
  parentSessionId?: string;
  agentId?: string;
  agentType?: string | null;
  agentDescription?: string | null;
  isOrphaned?: boolean;
  subAgentCount?: number;
  syntheticSummary?: string | null;
  syntheticTs?: string | null;
}

export async function discoverSessions(
  projDirHandle: FileSystemDirectoryHandle
): Promise<SessionMetadata[]> {
  const results: SessionDiscoveryResult[] = [];
  const seenMain = new Set<string>();
  const seenAgent = new Set<string>();

  const entries: [string, FileSystemHandle][] = [];
  for await (const entry of projDirHandle.entries()) {
    entries.push(entry);
  }

  // Format A: direct *.jsonl files in project root
  for (const [name, handle] of entries) {
    if (handle.kind !== "file") continue;
    if (!name.endsWith('.jsonl')) continue;
    const id = name.replace('.jsonl', '');
    if (!isUuidDir(id)) continue;

    results.push({ id, fileHandle: handle as FileSystemFileHandle, indexEntry: null });
    seenMain.add(id);
  }

  // Format B: sessions-index.json
  try {
    const indexHandle = await projDirHandle.getFileHandle("sessions-index.json", { create: false });
    const index = await readJson(indexHandle as FileSystemFileHandle);

    for (const entry of index?.entries || []) {
      if (seenMain.has(entry.sessionId)) {
        // Already have the file — just supplement with index metadata
        const existing = results.find(r => r.id === entry.sessionId);
        if (existing) existing.indexEntry = entry;
        continue;
      }

      // Try to find the file referenced by index
      let fileHandle: FileSystemFileHandle | undefined;
      try {
        fileHandle = await projDirHandle.getFileHandle(`${entry.sessionId}.jsonl`, { create: false });
      } catch {
        // File doesn't exist
      }

      results.push({
        id: entry.sessionId,
        fileHandle,
        indexEntry: entry,
      });
      seenMain.add(entry.sessionId);
    }
  } catch {
    // No sessions-index.json
  }

  // Format C: UUID subdirs containing subagents/agent-*.jsonl
  for (const [dirName, handle] of entries) {
    if (handle.kind !== "directory") continue;
    if (!isUuidDir(dirName)) continue;

    const sessionDirHandle = handle as FileSystemDirectoryHandle;

    // Check for subagents directory
    let subagentsHandle: FileSystemDirectoryHandle | undefined;
    try {
      subagentsHandle = await sessionDirHandle.getDirectoryHandle("subagents", { create: false });
    } catch {
      continue;
    }

    const parentHasMainJsonl = seenMain.has(dirName);

    // Collect sub-agent files
    const agentFiles: [string, FileSystemFileHandle][] = [];
    for await (const [name, agentHandle] of subagentsHandle.entries()) {
      if (agentHandle.kind !== "file") continue;
      if (!name.endsWith('.jsonl')) continue;
      if (name.includes('.meta.')) continue;
      agentFiles.push([name, agentHandle as FileSystemFileHandle]);
    }

    // If parent JSONL is missing, synthesize a virtual session entry
    if (!parentHasMainJsonl && agentFiles.length > 0) {
      let syntheticSummary: string | null = null;
      let syntheticTs: string | null = null;

      // Use first sub-agent's first prompt as synthetic summary
      const [, firstAgentHandle] = agentFiles[0];
      const lines = await readJsonLines(firstAgentHandle);
      for (const obj of lines) {
        if (!syntheticTs && obj.timestamp) syntheticTs = obj.timestamp;
        if (obj.type === 'user') {
          const c = obj.message?.content;
          const text = typeof c === 'string' ? c
            : Array.isArray(c) ? (c.find((b: any) => b.type === 'text')?.text || '') : '';
          if (text && text.length > 10) {
            syntheticSummary = text.slice(0, 160);
            break;
          }
        }
      }

      results.push({
        id: dirName,
        isOrphaned: true,
        subAgentCount: agentFiles.length,
        syntheticSummary,
        syntheticTs,
      });
      seenMain.add(dirName);
    }

    // Add individual sub-agent sessions
    for (const [agentFileName, agentHandle] of agentFiles) {
      const agentId = agentFileName.replace('.jsonl', '');
      const compositeId = `${dirName}__${agentId}`;
      if (seenAgent.has(compositeId)) continue;

      // Read .meta.json if available
      let agentMeta: any = null;
      try {
        const metaHandle = await subagentsHandle.getFileHandle(`${agentId}.meta.json`, { create: false });
        agentMeta = await readJson(metaHandle as FileSystemFileHandle);
      } catch {
        // No meta file
      }

      results.push({
        id: compositeId,
        fileHandle: agentHandle,
        isSubAgent: true,
        parentSessionId: dirName,
        agentId,
        agentType: agentMeta?.agentType || null,
        agentDescription: agentMeta?.description || null,
      });
      seenAgent.add(compositeId);
    }
  }

  // Convert discovery results to SessionMetadata
  const sessions: SessionMetadata[] = [];

  for (const s of results) {
    // Orphaned session: parent JSONL gone but sub-agents exist
    if (s.isOrphaned) {
      sessions.push({
        id: s.id,
        projectId: projDirHandle.name,
        isSubAgent: false,
        isOrphaned: true,
        title: null,
        summary: s.syntheticSummary || null,
        firstTs: s.syntheticTs || null,
        lastTs: s.syntheticTs || null,
        cwd: null,
        gitBranch: null,
        prLinks: [],
        turnCount: 0,
        humanTurns: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCounts: {},
        lineCount: 0,
        subAgentCount: s.subAgentCount,
      });
      continue;
    }

    // Skip sessions with no file handle and not orphaned
    if (!s.fileHandle) continue;

    // Read JSONL lines
    const lines = await readJsonLines(s.fileHandle);
    if (lines.length === 0 && !s.isSubAgent) continue;

    const meta = summariseSession(lines);

    // Supplement with index entry metadata where JSONL lacks it
    if (s.indexEntry) {
      if (!meta.summary && s.indexEntry.firstPrompt !== 'No prompt') {
        meta.summary = s.indexEntry.firstPrompt?.slice(0, 160);
      }
      if (!meta.title && s.indexEntry.summary) {
        meta.title = s.indexEntry.summary;
      }
    }

    sessions.push({
      id: s.id,
      projectId: projDirHandle.name,
      isSubAgent: s.isSubAgent || false,
      parentSessionId: s.parentSessionId || null,
      agentId: s.agentId || null,
      ...meta,
      lines, // Include full JSONL for replay
    });
  }

  // Sort by most recent
  sessions.sort((a, b) => (b.firstTs || "").localeCompare(a.firstTs || ""));

  return sessions;
}
