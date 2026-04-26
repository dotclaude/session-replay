// Project label extraction (ported from bridge server.js L246-269)

import type { SessionMetadata } from "../sessionsStore";
import { readJsonLines, readJson } from "./fileUtils";

export async function extractCwdFromProject(
  projDirHandle: FileSystemDirectoryHandle,
  sessionFiles: SessionMetadata[]
): Promise<string | null> {
  // Try sessions-index.json first (cheap)
  try {
    const indexHandle = await projDirHandle.getFileHandle("sessions-index.json", { create: false });
    const index = await readJson(indexHandle);
    if (index?.originalPath) return index.originalPath;
    if (index?.entries?.[0]?.projectPath) return index.entries[0].projectPath;
  } catch {
    // No index file or error reading it
  }

  // Fall back to reading first available JSONL
  for (const s of sessionFiles) {
    if (s.cwd) return s.cwd;
  }

  // Last resort: return null (caller will decode dir name)
  return null;
}

export function labelFromCwd(cwd: string | null, dirName: string): string {
  if (cwd) return cwd.split('/').pop() || cwd;
  return dirName.replace(/^-/, '').replace(/-/g, '/');
}
