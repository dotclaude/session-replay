import React, { useState } from 'react';
import { summariseSession } from '../../lib/claudeReader/summariseSession.ts';
import { labelFromCwd } from '../../lib/claudeReader/extractCwd.ts';

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readJsonLines(text) {
  const lines = text.split('\n').filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Skip invalid lines
    }
  }
  return parsed;
}

export default function WebkitDirectoryFallback({ onCache }) {
  const [loading, setLoading] = useState(false);
  const [fileCount, setFileCount] = useState(0);

  async function onChange(event) {
    setLoading(true);
    setFileCount(0);

    const files = Array.from(event.currentTarget.files ?? []);

    // Group files by project
    const projectMap = new Map();

    for (const file of files) {
      setFileCount(prev => prev + 1);

      const path = file.webkitRelativePath || file.name;

      // Extract project ID from path: .claude/projects/<project-id>/...
      const match = path.match(/\.claude\/projects\/([^/]+)\//);
      if (!match) continue;

      const projectId = match[1];
      const fileName = file.name.toLowerCase();

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, { id: projectId, sessionFiles: [], indexFile: null });
      }

      const project = projectMap.get(projectId);

      // Handle sessions-index.json
      if (fileName === 'sessions-index.json') {
        const text = await file.text();
        project.indexFile = safeJsonParse(text);
        continue;
      }

      // Handle JSONL session files
      if (fileName.endsWith('.jsonl')) {
        const text = await file.text();
        const lines = readJsonLines(text);

        if (lines.length > 0) {
          const sessionId = fileName.replace('.jsonl', '');
          project.sessionFiles.push({
            id: sessionId,
            path,
            lines,
          });
        }
      }
    }

    // Build project structure
    const projects = [];

    for (const [projectId, projectData] of projectMap) {
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
          lines: sessionFile.lines, // Include full content for replay
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
          <>Processing {fileCount} files...</>
        ) : (
          <>Select your <code style={{ padding: '2px 6px', background: 'var(--bg-2)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>.claude</code> folder. You'll need to re-import after page refresh or when sessions change.</>
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
