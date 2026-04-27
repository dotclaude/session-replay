import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionProvider } from '../lib/SessionProviderContext.jsx';
import SessionCard from '../components/picker/SessionCard.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ConnectSessionsModal from '../components/picker/ConnectSessionsModal.jsx';
import WebkitDirectoryFallback from '../components/picker/WebkitDirectoryFallback.jsx';
import {
  getSavedSessionsDirectory,
  pickAndSaveSessionsDirectory,
  supportsFileSystemAccess,
} from '../lib/fsAccess.ts';
import {
  loadSessionsCache,
  saveSessionsCache,
  clearSessionsDirectoryHandle,
  clearSessionsCache,
} from '../lib/sessionsStore.ts';
import { scanProjectsMetadata } from '../lib/progressiveSessionReader.ts';
import { friendlyPickerError } from '../lib/errors.ts';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts);
  const m = Math.floor(diff / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function ProjectRow({ project, selected, onClick }) {
  const [hovered, setHovered] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Project ${project.label}, ${project.sessionCount} sessions`}
      aria-pressed={selected}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 14px',
        cursor: 'pointer',
        background: selected ? 'var(--bg-2)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: selected ? 600 : 400,
          color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.label}
        </div>
        {project.firstTs && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            {timeAgo(project.firstTs)}
          </div>
        )}
      </div>
      <span style={{
        fontSize: 10, padding: '1px 6px', borderRadius: 8, flexShrink: 0, marginLeft: 8,
        background: selected ? 'rgba(88,166,255,0.2)' : 'var(--bg-3)',
        color: selected ? 'var(--accent)' : 'var(--text-muted)',
      }}>
        {project.sessionCount}
      </span>
    </div>
  );
}

export default function PickerPage() {
  const navigate = useNavigate();
  const { reinitialise } = useSessionProvider();
  const [cache, setCache] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('booting'); // booting | needs-connect | connected | refreshing | error
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [showSubAgents, setShowSubAgents] = useState(false);

  const firstSessionRef = useRef(null);

  async function refreshFromHandle(handle) {
    setStatus('refreshing');
    setError(null);

    try {
      // Use progressive loading - only scan metadata, not full JSONL content
      const projects = await scanProjectsMetadata(handle);

      const nextCache = {
        generatedAt: new Date().toISOString(),
        projects,
      };

      await saveSessionsCache(nextCache);
      await reinitialise(); // update provider with current FS handle

      setCache(nextCache);
      setProjects(projects);
      setStatus('connected');
    } catch (err) {
      console.error('Failed to refresh sessions:', err);
      setError(friendlyPickerError(err));
      setStatus('error');
    }
  }

  async function boot() {
    try {
      const existingCache = await loadSessionsCache();
      if (existingCache && existingCache.projects && existingCache.projects.length > 0) {
        // We have cached data - show it immediately
        setCache(existingCache);
        setProjects(existingCache.projects);
        setStatus('connected');

        // Try to get handle for future refreshes, but don't fail if unavailable
        try {
          await getSavedSessionsDirectory();
        } catch {
          // Permission revoked or handle unavailable - that's ok, cache works
        }
        return;
      }

      // No cache - need to connect
      const handle = await getSavedSessionsDirectory();

      if (!handle) {
        setStatus('needs-connect');
        return;
      }

      await refreshFromHandle(handle);
    } catch (err) {
      console.error('Boot failed:', err);
      setError(friendlyPickerError(err));
      setStatus('needs-connect');
    }
  }

  async function connect() {
    try {
      setError(null);
      setStatus('refreshing');

      // Check if browser supports File System Access API
      if (supportsFileSystemAccess()) {
        const handle = await pickAndSaveSessionsDirectory();
        await refreshFromHandle(handle);
      } else {
        // For Firefox/Safari: Show file input with webkitdirectory
        // This will be handled by triggering the WebkitDirectoryFallback component
        setStatus('needs-connect');
        setError('Use the "Import folder" option below for your browser.');
      }
    } catch (err) {
      console.error('Connect failed:', err);
      setError(friendlyPickerError(err));
      setStatus('needs-connect');
    }
  }

  async function handleFallbackCache(fallbackCache) {
    await saveSessionsCache(fallbackCache);
    setCache(fallbackCache);
    setProjects(fallbackCache.projects || []);
    setStatus('connected');
    await reinitialise(); // update provider (handle stays null for Firefox, but keeps state consistent)
  }

  async function refresh() {
    try {
      setError(null);

      // Check if browser supports persistent handles
      if (!supportsFileSystemAccess()) {
        // Firefox/Safari: No persistent handle, show friendly message
        setStatus('needs-connect');
        setError('Your browser requires re-importing the folder. This is a browser limitation - Firefox/Safari cannot save directory access persistently.');
        return;
      }

      // Chrome/Edge/Brave: Try to use saved handle
      console.log('Attempting to get saved directory handle...');
      const handle = await getSavedSessionsDirectory();

      if (!handle) {
        console.error('No handle found or permission denied');
        setStatus('needs-connect');
        setError('Permission expired or handle lost. Please reconnect your .claude folder.');
        return;
      }

      console.log('Handle found, refreshing...');
      await refreshFromHandle(handle);
    } catch (err) {
      console.error('Refresh failed:', err);
      setError(friendlyPickerError(err));
      setStatus('error');
    }
  }

  async function disconnect() {
    await clearSessionsDirectoryHandle();
    await clearSessionsCache();

    setCache(null);
    setProjects([]);
    setSessions([]);
    setSelectedProject(null);
    setError(null);
    setStatus('needs-connect');
  }

  useEffect(() => {
    boot();
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setSessions([]);
      return;
    }

    const project = cache?.projects.find(p => p.id === selectedProject.id);
    if (project) {
      setSessions(project.sessions);
      setTimeout(() => {
        if (firstSessionRef.current) {
          firstSessionRef.current.focus();
        }
      }, 100);
    }
  }, [selectedProject, cache]);

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.label.toLowerCase().includes(q) || p.cwd?.toLowerCase().includes(q)
      );
    }
    if (sortBy === 'recent')   return [...list].sort((a, b) => (b.firstTs || '').localeCompare(a.firstTs || ''));
    if (sortBy === 'name')     return [...list].sort((a, b) => a.label.localeCompare(b.label));
    if (sortBy === 'sessions') return [...list].sort((a, b) => (b.sessionCount || 0) - (a.sessionCount || 0));
    return list;
  }, [projects, search, sortBy]);

  const filteredSessions = useMemo(() => {
    let list = showSubAgents ? sessions : sessions.filter(s => !s.isSubAgent);
    if (sessionSearch) {
      const q = sessionSearch.toLowerCase();
      list = list.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.summary?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.gitBranch?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.firstTs || '').localeCompare(a.firstTs || ''));
  }, [sessions, showSubAgents, sessionSearch]);

  const subAgentCount = sessions.filter(s => s.isSubAgent).length;
  const busy = status === 'booting' || status === 'refreshing';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-0)' }}>

      <ConnectSessionsModal
        open={status === 'needs-connect' && supportsFileSystemAccess()}
        busy={busy}
        error={error}
        onConnect={connect}
      />

      {/* Fallback import for Firefox/Safari */}
      {status === 'needs-connect' && !supportsFileSystemAccess() && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          padding: '1rem',
          background: 'rgba(10, 15, 25, 0.75)',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }}>
          <WebkitDirectoryFallback onCache={handleFallbackCache} />
        </div>
      )}

      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⏱</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Session Replay
          </span>
          {status === 'connected' && cache && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>
              Last updated: {timeAgo(cache.generatedAt)}
            </span>
          )}
          {status === 'connected' && supportsFileSystemAccess() && (
            <button
              onClick={refresh}
              disabled={busy}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                cursor: busy ? 'not-allowed' : 'pointer',
                borderRadius: '6px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                marginLeft: 8,
              }}
              title="Re-scan .claude directory for new sessions"
            >
              {busy ? 'Refreshing...' : '↻ Refresh'}
            </button>
          )}
          {status === 'connected' && !supportsFileSystemAccess() && (
            <button
              onClick={() => setStatus('needs-connect')}
              disabled={busy}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                cursor: busy ? 'not-allowed' : 'pointer',
                borderRadius: '6px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                marginLeft: 8,
              }}
              title="Re-import folder (browser limitation: Firefox/Safari cannot persist directory access)"
            >
              ↻ Re-import
            </button>
          )}
          {status === 'connected' && (
            <button
              onClick={disconnect}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              Disconnect
            </button>
          )}
        </div>
        <ThemeToggle />
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar */}
        <div style={{
        width: 260, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-1)',
      }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Projects
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {filteredProjects.length}/{projects.length}
            </span>
          </div>
          <input
            placeholder="Filter projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '5px 9px',
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: 12, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
            {[['recent', 'Recent'], ['name', 'A–Z'], ['sessions', 'Most']].map(([val, label]) => (
              <button key={val} onClick={() => setSortBy(val)}
                style={{
                  flex: 1, padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                  background: sortBy === val ? 'var(--accent-dim)' : 'var(--bg-3)',
                  border: `1px solid ${sortBy === val ? 'var(--accent)' : 'transparent'}`,
                  color: sortBy === val ? 'white' : 'var(--text-muted)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {busy && status === 'booting' && <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
          {error && status !== 'connected' && <div style={{ padding: '16px', color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          {filteredProjects.map(p => (
            <ProjectRow
              key={p.id}
              project={p}
              selected={selectedProject?.id === p.id}
              onClick={() => setSelectedProject(p)}
            />
          ))}
          {!busy && filteredProjects.length === 0 && status === 'connected' && (
            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12 }}>
              {search ? `No projects matching "${search}"` : 'No projects found.'}
            </div>
          )}
        </div>
        </div>

        {/* Right: session list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedProject ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', gap: 12,
          }}>
            <div style={{ fontSize: 36 }}>⏱</div>
            <div style={{ fontSize: 14 }}>Select a project to view sessions</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {projects.length} project{projects.length !== 1 ? 's' : ''} available
            </div>
          </div>
        ) : (
          <>
            <div style={{
              padding: '12px 18px 10px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-1)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedProject.label}
                  </div>
                  {selectedProject.cwd && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {selectedProject.cwd}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  <span className="tag blue">
                    {sessions.filter(s => !s.isSubAgent).length} session{sessions.filter(s => !s.isSubAgent).length !== 1 ? 's' : ''}
                  </span>
                  {subAgentCount > 0 && (
                    <button
                      onClick={() => setShowSubAgents(v => !v)}
                      style={{
                        padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 10,
                        background: showSubAgents ? 'rgba(255,166,87,0.15)' : 'var(--bg-3)',
                        border: `1px solid ${showSubAgents ? 'var(--orange)' : 'var(--border)'}`,
                        color: showSubAgents ? 'var(--orange)' : 'var(--text-muted)',
                      }}>
                      {subAgentCount} sub-agent{subAgentCount !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
              <input
                placeholder="Search sessions…"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                style={{
                  width: '100%', padding: '5px 9px', marginTop: 6,
                  background: 'var(--bg-2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                  fontSize: 12, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredSessions.map((s, idx) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onClick={() => navigate(`/replay/${s.id}`)}
                  ref={idx === 0 ? firstSessionRef : null}
                />
              ))}
              {filteredSessions.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {sessionSearch ? `No sessions matching "${sessionSearch}"` : 'No sessions found.'}
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
