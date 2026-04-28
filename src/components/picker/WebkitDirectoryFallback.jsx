import { useState } from 'react';
import { summariseSession } from '../../lib/claudeReader/summariseSession.ts';
import { labelFromCwd } from '../../lib/claudeReader/extractCwd.ts';

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const LINE_TRUNCATE_BYTES = 4_000;

function stripLargeLine(line) {
  try {
    let s = line.replace(/"content"\s*:\s*"(?:[^"\\]|\\.){200,}"/g, '"content":""');
    s = s.replace(/"text"\s*:\s*"(?:[^"\\]|\\.){200,}"/g, '"text":""');
    s = s.replace(/"input"\s*:\s*(\{[^{}]{500,}\})/g, '"input":{}');
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function readJsonLines(text) {
  const rawLines = text.split('\n').filter(Boolean);
  const parsed = [];
  for (const line of rawLines) {
    try {
      const obj = line.length <= LINE_TRUNCATE_BYTES
        ? JSON.parse(line)
        : stripLargeLine(line);
      if (obj) parsed.push(obj);
    } catch {
      // skip
    }
  }
  return parsed;
}

function yieldToMain() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export default function WebkitDirectoryFallback({ onCache }) {
  const [loading, setLoading] = useState(false);
  const [readProgress, setReadProgress] = useState({ done: 0, total: 0 });

  async function onChange(event) {
    setLoading(true);
    setReadProgress({ done: 0, total: 0 });
    const t0 = performance.now();

    const files = Array.from(event.currentTarget.files ?? []);
    const CONCURRENCY = 8;

    // Classify files without reading them — pure path/name inspection
    const toRead = [];
    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      const match = path.match(/\.claude\/projects\/([^/]+)\//);
      if (!match) continue;

      const projectId = match[1];
      const fileName = file.name.toLowerCase();

      if (fileName === 'sessions-index.json') {
        toRead.push({ file, path, projectId, kind: 'index' });
        continue;
      }

      if (fileName.endsWith('.jsonl')) {
        const isInSubagentsDir = path.includes('/subagents/') || path.includes('\\subagents\\');
        if (isInSubagentsDir) {
          const subagentMatch = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[\\/]subagents[\\/]agent-([^/\\]+)\.jsonl$/i);
          if (subagentMatch) {
            toRead.push({ file, path, projectId, kind: 'subagent', parentSessionId: subagentMatch[1], agentId: subagentMatch[2] });
          }
          continue;
        }

        const sessionId = file.name.replace('.jsonl', '');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId);
        if (isUuid) {
          toRead.push({ file, path, projectId, kind: 'session', sessionId });
        }
      }
    }

    setReadProgress({ done: 0, total: toRead.length });
    console.log(`[import] ${toRead.length} files to read (${files.length} total in selection)`);

    // Group files by project
    const projectMap = new Map();
    const ensureProject = (projectId) => {
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, { id: projectId, sessionFiles: [], subAgentFiles: [], indexFile: null });
      }
      return projectMap.get(projectId);
    };

    // Read and parse files in batches — parsing happens inside each batch
    // so the main thread yields between batches instead of one giant sync block
    let doneCount = 0;
    for (let i = 0; i < toRead.length; i += CONCURRENCY) {
      const batch = toRead.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (entry) => {
        const text = await entry.file.text();
        return { ...entry, text };
      }));

      for (const { text, projectId, kind, path, sessionId, parentSessionId, agentId } of batchResults) {
        const project = ensureProject(projectId);
        if (kind === 'index') {
          project.indexFile = safeJsonParse(text);
        } else if (kind === 'subagent') {
          const lines = readJsonLines(text);
          if (lines.length > 0) project.subAgentFiles.push({ parentSessionId, agentId, lines });
        } else if (kind === 'session') {
          const lines = readJsonLines(text);
          if (lines.length > 0) project.sessionFiles.push({ id: sessionId, path, lines });
        }
      }

      doneCount += batchResults.length;
      setReadProgress({ done: doneCount, total: toRead.length });
      await yieldToMain();
    }

    // Build project structure — yield between projects so the UI stays responsive
    const projects = [];

    for (const [projectId, projectData] of projectMap) {
      await yieldToMain();
      // Build a map of parentSessionId -> { agentId -> lines } for sub-agents
      const subAgentLinesBySession = {};
      for (const { parentSessionId, agentId, lines } of projectData.subAgentFiles) {
        if (!subAgentLinesBySession[parentSessionId]) {
          subAgentLinesBySession[parentSessionId] = {};
        }
        subAgentLinesBySession[parentSessionId][agentId] = lines;
      }

      const sessions = projectData.sessionFiles.map(sessionFile => {
        const meta = summariseSession(sessionFile.lines);

        // Extract first prompt for summary if not present
        if (!meta.summary && sessionFile.lines.length > 0) {
          for (const line of sessionFile.lines) {
            if (line.type === 'user') {
              const content = line.message?.content;
              const text = typeof content === 'string' ? content
                : Array.isArray(content) ? (content.find(b => b.type === 'text')?.text || '') : '';
              if (text && text.length > 10) {
                meta.summary = text.slice(0, 160);
                break;
              }
            }
          }
        }

        return {
          id: sessionFile.id,
          projectId,
          isSubAgent: false,
          ...meta,
          lines: sessionFile.lines,
          // Store sub-agent lines for Firefox drill-down support (no FS handle available)
          subAgentLines: subAgentLinesBySession[sessionFile.id] || null,
        };
      });

      if (sessions.length === 0) continue;

      // Get label from first session's cwd or decode project ID
      const cwd = sessions.find(s => s.cwd)?.cwd || null;
      const label = labelFromCwd(cwd, projectId);

      // Find most recent timestamp
      let firstTs = null;
      for (const s of sessions) {
        if (s.firstTs && (!firstTs || s.firstTs > firstTs)) {
          firstTs = s.firstTs;
        }
      }

      sessions.sort((a, b) => (b.firstTs || '').localeCompare(a.firstTs || ''));

      projects.push({
        id: projectId,
        label,
        cwd,
        sessionCount: sessions.length,
        subAgentCount: 0,
        firstTs,
        sessions,
      });
    }

    // Sort by most recent
    projects.sort((a, b) => (b.firstTs || '').localeCompare(a.firstTs || ''));

    console.log(`[import] done in ${((performance.now() - t0) / 1000).toFixed(2)}s — ${projects.length} projects, ${projects.reduce((n, p) => n + p.sessionCount, 0)} sessions`);
    setLoading(false);

    onCache({
      generatedAt: new Date().toISOString(),
      projects,
    });
  }

  return (
    <div style={{
      padding: '24px',
      margin: '16px',
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      maxWidth: '600px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
        Firefox / Safari
      </div>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
        Import .claude folder
      </h3>

      <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        {loading ? (
          <>Reading {readProgress.done} / {readProgress.total} files…</>
        ) : (
          <>Select your <code style={{ padding: '2px 6px', background: 'var(--bg-2)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>.claude</code> folder. You&apos;ll need to re-import after page refresh or when sessions change.</>
        )}
      </p>

      <input
        type="file"
        webkitdirectory=""
        multiple
        onChange={onChange}
        disabled={loading}
        style={{
          fontSize: '13px',
          padding: '8px',
          background: loading ? 'var(--bg-3)' : 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          color: 'var(--text-primary)',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      />
    </div>
  );
}
