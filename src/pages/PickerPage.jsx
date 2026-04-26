import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SessionCard from '../components/picker/SessionCard.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

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
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [showSubAgents, setShowSubAgents] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => { setProjects(data); setLoadingProjects(false); })
      .catch(() => {
        setError('Cannot reach bridge server. Run: yarn bridge');
        setLoadingProjects(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoadingSessions(true);
    setSessions([]);
    setSessionSearch('');
    fetch(`/api/projects/${encodeURIComponent(selectedProject.id)}/sessions`)
      .then(r => r.json())
      .then(data => { setSessions(data); setLoadingSessions(false); })
      .catch(() => setLoadingSessions(false));
  }, [selectedProject]);

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
    return list;
  }, [sessions, showSubAgents, sessionSearch]);

  const subAgentCount = sessions.filter(s => s.isSubAgent).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-0)' }}>

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
          {loadingProjects && <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
          {error && <div style={{ padding: '16px', color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          {filteredProjects.map(p => (
            <ProjectRow
              key={p.id}
              project={p}
              selected={selectedProject?.id === p.id}
              onClick={() => setSelectedProject(p)}
            />
          ))}
          {!loadingProjects && !error && filteredProjects.length === 0 && (
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
              {loadingSessions && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading sessions…</div>}
              {filteredSessions.map(s => (
                <SessionCard key={s.id} session={s} onClick={() => navigate(`/replay/${s.id}`)} />
              ))}
              {!loadingSessions && filteredSessions.length === 0 && (
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
