import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parseSession } from '../lib/parser/parseSession.js';
import { buildSteps } from '../lib/parser/buildSteps.js';
import { loadSessionsCache } from '../lib/sessionsStore.ts';
import { getSavedSessionsDirectory } from '../lib/fsAccess.ts';
import { loadSubAgentSession } from '../lib/progressiveSessionReader.ts';
import { ReplayShell } from './ReplayPage.jsx';

export default function AgentReplayPage() {
  const { sessionId, agentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [steps, setSteps] = useState([]);
  const [meta, setMeta] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [parentSession, setParentSession] = useState(null);

  useEffect(() => {
    setLoading(true);

    loadSessionsCache()
      .then(async cache => {
        if (!cache) {
          throw new Error('No sessions cache found. Please reconnect your .claude folder.');
        }

        // Find the parent session to get projectId and check for cached sub-agent lines
        let parentSession = null;
        let pid = null;
        for (const project of cache.projects) {
          parentSession = project.sessions.find(s => s.id === sessionId);
          if (parentSession) {
            pid = project.id;
            break;
          }
        }

        if (!parentSession) {
          throw new Error('Parent session not found in cache. Try refreshing on the picker page.');
        }

        setParentSession(parentSession);

        // Check Firefox in-memory cache first (populated by WebkitDirectoryFallback)
        let lines = parentSession.subAgentLines?.[agentId] || null;

        if (!lines || lines.length === 0) {
          const handle = await getSavedSessionsDirectory();
          if (!handle) {
            throw new Error('Agent session not available. In Firefox, re-import your .claude folder from the picker to load sub-agent sessions.');
          }
          lines = await loadSubAgentSession(handle, pid, sessionId, agentId);
        }

        if (!lines || lines.length === 0) {
          throw new Error('Agent session file is empty or unreadable.');
        }

        const events = parseSession(lines);
        const builtSteps = buildSteps(events);

        // Derive a title from the agent step in the parent session if possible
        const agentTitle = `Agent · ${agentId.slice(0, 10)}…`;

        setSteps(builtSteps);
        setMeta({ title: agentTitle, sessionId: agentId });
        setProjectId(pid);
        setLoading(false);
      })
      .catch(e => {
        console.error('Failed to load agent session:', e);
        setError(e.message);
        setLoading(false);
      });
  }, [sessionId, agentId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
      Loading agent session…
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--red)' }}>
      <div>Failed to load agent session: {error}</div>
      <button onClick={() => navigate(`/replay/${sessionId}`)} style={{ padding: '6px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer' }}>
        ← Parent session
      </button>
    </div>
  );

  return (
    <ReplayShell
      steps={steps}
      meta={meta}
      projectId={projectId}
      sessionId={agentId}
      session={parentSession}
      backTo={`/replay/${sessionId}`}
      backLabel="Parent session"
    />
  );
}
