import React from 'react';

function formatDuration(firstTs, lastTs) {
  if (!firstTs || !lastTs) return null;
  const ms = new Date(lastTs) - new Date(firstTs);
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTokens(n) {
  if (!n) return null;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

export default function SessionCard({ session, onClick }) {
  const duration = formatDuration(session.firstTs, session.lastTs);
  const topTools = Object.entries(session.toolCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const isSubAgent = session.isSubAgent;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const title = session.title || session.id.slice(0, 16) + '…';
  const label = isSubAgent
    ? `Sub-agent session: ${title}, ${session.turnCount || 0} turns`
    : `Session: ${title}, ${session.turnCount || 0} turns`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={label}
      style={{
        padding: 14,
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent-dim)';
        e.currentTarget.style.background = 'var(--bg-2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'var(--bg-1)';
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: isSubAgent ? 'var(--orange)' : 'var(--text-primary)', lineHeight: 1.4 }}>
          {isSubAgent && <span style={{ fontSize: 10, marginRight: 5, opacity: 0.8 }}>◈ sub-agent</span>}
          {session.title || session.id.slice(0, 16) + '…'}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {session.fromIndex && (
            <span className="tag" style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Metadata only — original JSONL not found on disk">index</span>
          )}
          {session.prLinks?.length > 0 && (
            <span className="tag purple">
              {session.prLinks.length} PR{session.prLinks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      {session.summary && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
          {session.summary}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: topTools.length ? 8 : 0 }}>
        {session.firstTs && (
          <span className="tag">
            {new Date(session.firstTs).toLocaleDateString()} {new Date(session.firstTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {duration && <span className="tag">{duration}</span>}
        {session.turnCount > 0 && <span className="tag blue">{session.turnCount} turns</span>}
        {session.totalOutputTokens > 0 && (
          <span className="tag">{formatTokens(session.totalOutputTokens)} out tokens</span>
        )}
        {session.gitBranch && session.gitBranch !== 'main' && (
          <span className="tag orange">{session.gitBranch}</span>
        )}
      </div>

      {/* Top tools */}
      {topTools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {topTools.map(([name, count]) => (
            <span key={name} className="tag" style={{ fontSize: 10 }}>
              {name} ×{count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
