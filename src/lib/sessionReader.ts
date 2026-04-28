// Recursive session directory reader

import type { SessionsCache, ProjectCache } from "./sessionsStore";
import { discoverSessions } from "./claudeReader/discoverSessions";
import { extractCwdFromProject, labelFromCwd } from "./claudeReader/extractCwd";

export interface ReadSessionsOptions {
  maxDepth?: number;
  maxFileBytes?: number;
  includeExtensions?: string[];
  previewChars?: number;
}

export async function readSessionsDirectory(
  claudeHandle: FileSystemDirectoryHandle
): Promise<SessionsCache> {
  const projects: ProjectCache[] = [];

  // Get projects directory
  const projectsHandle = await claudeHandle.getDirectoryHandle("projects", { create: false });

  // Iterate through all project directories
  for await (const [projectDirName, projectHandle] of projectsHandle.entries()) {
    if (projectHandle.kind !== "directory") continue;

    try {
      const sessions = await discoverSessions(projectHandle);

      if (sessions.length === 0) continue;

      const cwd = await extractCwdFromProject(projectHandle, sessions);
      const label = labelFromCwd(cwd, projectDirName);

      // Find most recent session timestamp
      let firstTs: string | null = null;
      for (const s of sessions) {
        if (s.firstTs && (!firstTs || s.firstTs > firstTs)) {
          firstTs = s.firstTs;
        }
      }

      const sessionCount = sessions.filter(s => !s.isSubAgent && (s.lines || s.isOrphaned)).length;
      const subAgentCount = sessions.filter(s => s.isSubAgent && s.lines).length;

      // Skip projects with nothing replayable
      if (sessionCount === 0 && subAgentCount === 0) continue;

      projects.push({
        id: projectDirName,
        label,
        cwd,
        sessionCount,
        subAgentCount,
        firstTs,
        sessions,
      });
    } catch (err) {
      console.warn(`Skipping project ${projectDirName}:`, err);
      continue;
    }
  }

  // Sort projects by most recent
  projects.sort((a, b) => (b.firstTs || "").localeCompare(a.firstTs || ""));

  return {
    generatedAt: new Date().toISOString(),
    projects,
  };
}
