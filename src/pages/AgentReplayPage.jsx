import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parseSession } from '../lib/parser/parseSession.js';
import { buildSteps } from '../lib/parser/buildSteps.js';
import { loadSessionsCache } from '../lib/sessionsStore.ts';
import { getSavedSessionsDirectory, supportsFileSystemAccess } from '../lib/fsAccess.ts';
import { loadSubAgentSession } from '../lib/progressiveSessionReader.ts';
import { useSessionProvider } from '../lib/SessionProviderContext.jsx';
import { ReplayShell } from './ReplayPage.jsx';

export default function AgentReplayPage() {
  const { sessionId, agentId } = useParams();
  const navigate = useNavigate();
  const { reinitialise } = useSessionProvider();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [steps, setSteps] = useState([]);
  const [meta, setMeta] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [parentSession, setParentSession] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsPermission(false);

    try {
      const cache = await loadSessionsCache();
      if (!cache) throw new Error('No sessions cache found. Please reconnect your .claude folder.');

      let found = null;
      let pid = null;
      for (const project of cache.projects) {
        found = project.sessions.find(s => s.id === sessionId);
        if (found) { pid = project.id; break; }
      }
      if (!found) throw new Error('Parent session not found in cache. Try refreshing on the picker page.');

      // Firefox: use cached lines stored during import
      if (found.subAgentLines?.[agentId]) {
        const lines = found.subAgentLines[agentId];
        const builtSteps = buildSteps(parseSession(lines));
        setSteps(builtSteps);
        setMeta({ title: `Agent · ${agentId.slice(0, 10)}…`, sessionId: agentId });
        setProjectId(pid);
        setParentSession(found);
        setLoading(false);
        return;
      }

      // Chrome: get FS handle — may need a user gesture to grant permission
      const handle = await getSavedSessionsDirectory();
      if (!handle) {
        setNeedsPermission(true);
        setLoading(false);
        return;
      }

      const lines = await loadSubAgentSession(handle, pid, sessionId, agentId);
      if (!lines || lines.length === 0) throw new Error('Agent session file is empty or unreadable.');

      const builtSteps = buildSteps(parseSession(lines));
      setSteps(builtSteps);
      setMeta({ title: `Agent · ${agentId.slice(0, 10)}…`, sessionId: agentId });
      setProjectId(pid);
      setParentSession(found);
      setLoading(false);
    } catch (e) {
      console.error('Failed to load agent session:', e);
      setError(e.message);
      setLoading(false);
    }
  }, [sessionId, agentId]);

  useEffect(() => { load(); }, [load]);

  const handleGrantAccess = useCallback(async () => {
    // requestPermission requires a user gesture — this button click provides it
    await reinitialise();
    load();
  }, [reinitialise, load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
      Loading agent session…
    </div>
  );

  if (needsPermission) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>Permission required to access session files</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 360, textAlign: 'center' }}>
        {supportsFileSystemAccess()
          ? 'Click below to grant access to your .claude folder.'
          : 'Re-import your .claude folder from the picker to load sub-agent sessions.'}
      </div>
      {supportsFileSystemAccess() ? (
        <button onClick={handleGrantAccess} style={{ padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'var(--bg-0)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          Grant access
        </button>
      ) : null}
      <button onClick={() => navigate(`/replay/${sessionId}`)} style={{ padding: '6px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
        ← Parent session
      </button>
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
