// IndexedDB persistence for FileSystemDirectoryHandle and sessions cache

import { del, get, set } from "idb-keyval";

const SESSIONS_DIRECTORY_HANDLE_KEY = "sessions-directory-handle:v1";
const SESSIONS_CACHE_KEY = "sessions-cache:v1";

export interface CachedSessionFile {
  path: string;
  name: string;
  size: number;
  lastModified: number;
  mimeType: string;
  textPreview?: string;
  parsed?: unknown;
}

export interface SessionMetadata {
  id: string;
  projectId: string;
  isSubAgent: boolean;
  parentSessionId?: string;
  agentId?: string;
  title: string | null;
  summary: string | null;
  firstTs: string | null;
  lastTs: string | null;
  cwd: string | null;
  gitBranch: string | null;
  prLinks: Array<{ url: string; number: number; repo: string }>;
  turnCount: number;
  humanTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCounts: Record<string, number>;
  lineCount: number;
  isOrphaned?: boolean;
  subAgentCount?: number;
  lines?: unknown[]; // Full JSONL content for quick access
  subAgentLines?: Record<string, unknown[]>; // agentId -> lines, for Firefox fallback
}

export interface ProjectCache {
  id: string;
  label: string;
  cwd: string | null;
  sessionCount: number;
  subAgentCount: number;
  firstTs: string | null;
  sessions: SessionMetadata[];
}

export interface SessionsCache {
  generatedAt: string;
  projects: ProjectCache[];
}

export async function saveSessionsDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  await set(SESSIONS_DIRECTORY_HANDLE_KEY, handle);
}

export async function loadSessionsDirectoryHandle(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  return await get<FileSystemDirectoryHandle>(SESSIONS_DIRECTORY_HANDLE_KEY);
}

export async function clearSessionsDirectoryHandle(): Promise<void> {
  await del(SESSIONS_DIRECTORY_HANDLE_KEY);
}

export async function saveSessionsCache(cache: SessionsCache): Promise<void> {
  await set(SESSIONS_CACHE_KEY, cache);
}

export async function loadSessionsCache(): Promise<SessionsCache | undefined> {
  return await get<SessionsCache>(SESSIONS_CACHE_KEY);
}

export async function clearSessionsCache(): Promise<void> {
  await del(SESSIONS_CACHE_KEY);
}
