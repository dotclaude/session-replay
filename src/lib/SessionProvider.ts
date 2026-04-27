import {
  loadFullSession,
  loadSubAgentSession as fsLoadSubAgentSession,
  listSubAgentIds as fsListSubAgentIds,
} from './progressiveSessionReader';

function stableSort(entries: { agentId: string; firstTs: string }[]): string[] {
  return entries
    .sort((a, b) => {
      const tsCmp = a.firstTs.localeCompare(b.firstTs);
      return tsCmp !== 0 ? tsCmp : a.agentId.localeCompare(b.agentId);
    })
    .map(e => e.agentId);
}

export class SessionProvider {
  private handle: FileSystemDirectoryHandle | null;

  constructor(handle: FileSystemDirectoryHandle | null) {
    this.handle = handle;
  }

  get canAccessFilesystem(): boolean {
    return this.handle !== null;
  }

  async loadSession(
    projectId: string,
    sessionId: string,
    cachedLines?: unknown[]
  ): Promise<unknown[]> {
    if (cachedLines && cachedLines.length > 0) return cachedLines;
    if (!this.handle) {
      throw new Error('NO_HANDLE');
    }
    return loadFullSession(this.handle, projectId, sessionId);
  }

  async loadSubAgentSession(
    projectId: string,
    parentSessionId: string,
    agentId: string,
    subAgentCache?: Record<string, unknown[]>
  ): Promise<unknown[]> {
    const cached = subAgentCache?.[agentId];
    if (cached && cached.length > 0) return cached;
    if (!this.handle) {
      throw new Error('NO_HANDLE');
    }
    return fsLoadSubAgentSession(this.handle, projectId, parentSessionId, agentId);
  }

  async listSubAgentIds(
    projectId: string,
    parentSessionId: string,
    subAgentCache?: Record<string, unknown[]>
  ): Promise<string[]> {
    // Firefox path: derive order from cached lines' first timestamps
    if (subAgentCache) {
      const entries = Object.entries(subAgentCache).map(([agentId, lines]) => ({
        agentId,
        firstTs: (lines[0] as any)?.timestamp || '',
      }));
      return stableSort(entries);
    }
    if (!this.handle) return [];
    return fsListSubAgentIds(this.handle, projectId, parentSessionId);
  }
}
