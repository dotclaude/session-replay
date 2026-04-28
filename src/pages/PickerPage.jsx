import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  saveSessionsDirectoryHandle,
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

function ProjectRow({ project, selected, onClick, indent = 0 }) {
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
        padding: `7px 14px 7px ${14 + indent * 10}px`,
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

function FolderRow({ label, count, expanded, onToggle, depth }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-expanded={expanded}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: `4px 14px 4px ${14 + depth * 10}px`,
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        userSelect: 'none',
      }}
    >
      <span style={{
        fontSize: 8, color: 'var(--text-muted)',
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s', display: 'inline-block', lineHeight: 1,
      }}>▶</span>
      <span style={{
        flex: 1, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>{label}</span>
      {count > 0 && (
        <span style={{
          fontSize: 10, padding: '1px 5px', borderRadius: 8,
          background: 'var(--bg-3)', color: 'var(--text-muted)', flexShrink: 0,
        }}>{count}</span>
      )}
    </div>
  );
}

function countLeafProjects(node) {
  let count = node.projects.length;
  for (const child of node.children.values()) count += countLeafProjects(child);
  return count;
}

function renderTreeNode(node, depth, isFolderExpanded, toggleFolder, selectedProject, setSelectedProject) {
  const items = [];

  for (const project of node.projects) {
    items.push(
      <ProjectRow
        key={project.id}
        project={project}
        selected={selectedProject?.id === project.id}
        onClick={() => setSelectedProject(project)}
        indent={depth}
      />
    );
  }

  for (const [seg, childNode] of node.children) {
    const isExpanded = isFolderExpanded(childNode.fullKey);
    const subtreeCount = countLeafProjects(childNode);
    items.push(
      <div key={childNode.fullKey}>
        <FolderRow
          label={seg}
          count={subtreeCount}
          expanded={isExpanded}
          onToggle={() => toggleFolder(childNode.fullKey)}
          depth={depth}
        />
        {isExpanded && renderTreeNode(childNode, depth + 1, isFolderExpanded, toggleFolder, selectedProject, setSelectedProject)}
      </div>
    );
  }

  return items;
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
  const [scanProgress, setScanProgress] = useState(null);
  const [search, setSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [showSubAgents, setShowSubAgents] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem('sidebarWidth');
    return stored ? parseInt(stored, 10) : 280;
  });
  const [dragHandleHovered, setDragHandleHovered] = useState(false);
  const [projectView, setProjectView] = useState(() =>
    localStorage.getItem('projectView') || 'tree'
  );
  // foldersExpanded: global default; folderOverrides: keys that deviate from the default
  const [foldersExpanded, setFoldersExpanded] = useState(false);
  const [folderOverrides, setFolderOverrides] = useState(() => new Set());

  const firstSessionRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const isFolderExpanded = useCallback((key) =>
    foldersExpanded ? !folderOverrides.has(key) : folderOverrides.has(key)
  , [foldersExpanded, folderOverrides]);

  const toggleFolder = useCallback((key) => {
    setFolderOverrides(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setFoldersExpanded(false);
    setFolderOverrides(new Set());
  }, []);

  const expandAll = useCallback(() => {
    setFoldersExpanded(true);
    setFolderOverrides(new Set());
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      const newWidth = Math.min(480, Math.max(180, dragStartWidthRef.current + delta));
      setSidebarWidth(newWidth);
      localStorage.setItem('sidebarWidth', String(newWidth));
    };
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleSidebarDragStart = useCallback((e) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [sidebarWidth]);

  const refreshFromHandle = useCallback(async (handle) => {
    setStatus('refreshing');
    setError(null);

    try {
      setScanProgress({ projectsScanned: 0, sessionsFound: 0, currentProject: null, phase: 'enumerating' });

      const PROGRESS_THROTTLE_MS = 80;
      let lastProgressTs = 0;
      const throttledProgress = (p) => {
        const now = Date.now();
        if (now - lastProgressTs >= PROGRESS_THROTTLE_MS) {
          lastProgressTs = now;
          setScanProgress(p);
        }
      };

      const projects = await scanProjectsMetadata(handle, throttledProgress);

      const nextCache = {
        generatedAt: new Date().toISOString(),
        projects,
      };

      await saveSessionsCache(nextCache);
      await reinitialise(); // update provider with current FS handle

      setCache(nextCache);
      setProjects(projects);
      setScanProgress(null);
      setStatus('connected');
    } catch (err) {
      console.error('Failed to refresh sessions:', err);
      setError(friendlyPickerError(err));
      setStatus('error');
    }
  }, [reinitialise]);

  const boot = useCallback(async () => {
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
  }, [refreshFromHandle]);

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

  async function connectFromHandle(handle) {
    try {
      setError(null);
      setStatus('refreshing');
      await saveSessionsDirectoryHandle(handle);
      await refreshFromHandle(handle);
    } catch (err) {
      console.error('Connect from handle failed:', err);
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
  }, [boot]);

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

  const projectTree = useMemo(() => {
    if (projectView !== 'tree') return null;

    const root = { label: '', fullKey: '', children: new Map(), projects: [] };

    for (const project of filteredProjects) {
      if (!project.cwd) continue; // null-cwd projects handled separately as "Other"
      const segs = project.cwd.split('/').filter(Boolean);
      let node = root;
      for (let i = 0; i < segs.length - 1; i++) {
        const seg = segs[i];
        const key = segs.slice(0, i + 1).join('/');
        if (!node.children.has(seg)) {
          node.children.set(seg, { label: seg, fullKey: key, children: new Map(), projects: [] });
        }
        node = node.children.get(seg);
      }
      node.projects.push(project);
    }

    return root;
  }, [filteredProjects, projectView]);

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
        open={(status === 'needs-connect' || status === 'refreshing') && supportsFileSystemAccess() && projects.length === 0}
        busy={busy}
        error={error}
        scanning={scanProgress !== null}
        scanProgress={scanProgress}
        onConnect={connect}
        onDirectory={connectFromHandle}
        onError={(msg) => { setError(msg); setStatus('needs-connect'); }}
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
        {/* Left sidebar — resizable */}
        <div style={{ width: sidebarWidth, flexShrink: 0, display: 'flex', position: 'relative' }}>
          {/* Content column */}
          <div style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--bg-1)', overflow: 'hidden',
            borderRight: '1px solid var(--border)',
          }}>
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Projects
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {filteredProjects.length}/{projects.length}
                </span>
                <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {['tree', 'flat'].map(mode => (
                    <button key={mode} onClick={() => { setProjectView(mode); localStorage.setItem('projectView', mode); }}
                      style={{
                        padding: '2px 7px', fontSize: 10, cursor: 'pointer',
                        background: projectView === mode ? 'var(--accent-dim)' : 'var(--bg-3)',
                        border: 'none', borderRight: mode === 'tree' ? '1px solid var(--border)' : 'none',
                        color: projectView === mode ? 'white' : 'var(--text-muted)',
                      }}>
                      {mode === 'tree' ? 'Tree' : 'Flat'}
                    </button>
                  ))}
                </div>
                {projectView === 'tree' && (
                  <div style={{ display: 'flex', gap: 1 }}>
                    <button onClick={collapseAll} title="Collapse All"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, padding: 0, cursor: 'pointer', borderRadius: 3,
                        background: !foldersExpanded && folderOverrides.size === 0 ? 'var(--accent-dim)' : 'transparent',
                        border: 'none',
                        color: !foldersExpanded && folderOverrides.size === 0 ? 'var(--accent)' : 'var(--text-muted)',
                      }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M9 9H4v1h5V9z"/>
                        <path d="M9 7H4v1h5V7z"/>
                        <path d="M4 5h5V4H4v1z"/>
                        <path d="M14 3H2v10h12V3zm-1 9H3V4h10v8z"/>
                        <path d="M11 6.5l-1-1-1 1 .7.7-.7.7 1 1 1-1-.7-.7.7-.7z"/>
                      </svg>
                    </button>
                    <button onClick={expandAll} title="Expand All"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, padding: 0, cursor: 'pointer', borderRadius: 3,
                        background: foldersExpanded && folderOverrides.size === 0 ? 'var(--accent-dim)' : 'transparent',
                        border: 'none',
                        color: foldersExpanded && folderOverrides.size === 0 ? 'var(--accent)' : 'var(--text-muted)',
                      }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M9 9H4v1h5V9z"/>
                        <path d="M9 7H4v1h5V7z"/>
                        <path d="M4 5h5V4H4v1z"/>
                        <path d="M14 3H2v10h12V3zm-1 9H3V4h10v8z"/>
                        <path d="M11 9.5l-1 1-1-1 .7-.7-.7-.7 1-1 1 1-.7.7.7.7z"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
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
            {projectView === 'flat' || !projectTree
              ? filteredProjects.map(p => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    selected={selectedProject?.id === p.id}
                    onClick={() => setSelectedProject(p)}
                    indent={0}
                  />
                ))
              : (
                <>
                  {renderTreeNode(projectTree, 0, isFolderExpanded, toggleFolder, selectedProject, setSelectedProject)}
                  {filteredProjects.filter(p => !p.cwd).length > 0 && (
                    <div>
                      <FolderRow
                        label="Other"
                        count={filteredProjects.filter(p => !p.cwd).length}
                        expanded={isFolderExpanded('__other__')}
                        onToggle={() => toggleFolder('__other__')}
                        depth={0}
                      />
                      {isFolderExpanded('__other__') && filteredProjects.filter(p => !p.cwd).map(p => (
                        <ProjectRow
                          key={p.id}
                          project={p}
                          selected={selectedProject?.id === p.id}
                          onClick={() => setSelectedProject(p)}
                          indent={1}
                        />
                      ))}
                    </div>
                  )}
                </>
              )
            }
            {!busy && filteredProjects.length === 0 && status === 'connected' && (
              <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12 }}>
                {search ? `No projects matching "${search}"` : 'No projects found.'}
              </div>
            )}
          </div>
          </div>
          {/* Drag handle — 8px hit zone centered on the border */}
          <div
            onMouseDown={handleSidebarDragStart}
            onMouseEnter={() => setDragHandleHovered(true)}
            onMouseLeave={() => setDragHandleHovered(false)}
            style={{
              position: 'absolute', right: -4, top: 0, bottom: 0,
              width: 8, cursor: 'col-resize', zIndex: 20,
              display: 'flex', alignItems: 'stretch', justifyContent: 'center',
            }}
          >
            <div style={{
              width: 2,
              background: dragHandleHovered ? 'var(--accent)' : 'transparent',
              transition: 'background 0.15s',
            }} />
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
