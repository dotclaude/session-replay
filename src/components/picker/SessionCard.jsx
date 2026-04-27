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

const SessionCard = React.forwardRef(({ session, onClick }, ref) => {
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
      ref={ref}
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
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

      {/* Feature pills row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: topTools.length ? 6 : 0 }}>
        {session.subAgentCount > 0 && (
          <span className="tag" style={{ fontSize: 10, background: 'rgba(255,166,87,0.15)', color: 'var(--orange)', border: '1px solid rgba(255,166,87,0.3)' }}
            title={`${session.subAgentCount} sub-agent task${session.subAgentCount !== 1 ? 's' : ''} spawned`}>
            ◈ {session.subAgentCount} agent{session.subAgentCount !== 1 ? 's' : ''}
          </span>
        )}
        {session.compactionCount > 0 && (
          <span className="tag" style={{ fontSize: 10, background: 'rgba(139,92,246,0.15)', color: 'var(--purple, #a78bfa)', border: '1px solid rgba(139,92,246,0.3)' }}
            title={`Context compacted ${session.compactionCount} time${session.compactionCount !== 1 ? 's' : ''}`}>
            ⟳ {session.compactionCount} compact{session.compactionCount !== 1 ? 'ions' : 'ion'}
          </span>
        )}
        {session.errorCount > 0 && (
          <span className="tag" style={{ fontSize: 10, background: 'rgba(255,68,68,0.12)', color: 'var(--red)', border: '1px solid rgba(255,68,68,0.3)' }}
            title={`${session.errorCount} API error${session.errorCount !== 1 ? 's' : ''} during session`}>
            ✕ {session.errorCount} error{session.errorCount !== 1 ? 's' : ''}
          </span>
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
});

SessionCard.displayName = 'SessionCard';

export default SessionCard;
