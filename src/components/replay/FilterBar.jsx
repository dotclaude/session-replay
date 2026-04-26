import React from 'react';

export const ALL_KINDS = [
  'session-header', 'human', 'assistant-text',
  'tool-bash', 'tool-write', 'tool-edit', 'tool-read',
  'tool-agent', 'tool-web', 'tool-task', 'tool-skill', 'tool-generic',
  'hook-event', 'agent-progress', 'compaction-event', 'error-event',
  'turn-summary', 'pr-link', 'local-command', 'local-command-output',
];

const FILTER_GROUPS = [
  { kind: 'human',            label: 'Human',    color: '#58a6ff' },
  { kind: 'assistant-text',   label: 'Claude',   color: '#3fb950' },
  { kind: 'tool-bash',        label: 'Bash',     color: '#39d353' },
  { kind: 'tool-write',       label: 'Write',    color: '#58a6ff' },
  { kind: 'tool-edit',        label: 'Edit',     color: '#d29922' },
  { kind: 'tool-read',        label: 'Read',     color: '#8b949e' },
  { kind: 'tool-agent',       label: 'Agent',    color: '#ffa657' },
  { kind: 'tool-skill',       label: 'Skills',   color: '#bc8cff' },
  { kind: 'tool-web',         label: 'Web',      color: '#bc8cff' },
  { kind: 'tool-task',        label: 'Tasks',    color: '#8b949e' },
  { kind: 'local-command',    label: 'Commands', color: '#bc8cff' },
  { kind: 'hook-event',       label: 'Hooks',    color: '#d29922' },
  { kind: 'agent-progress',   label: 'Reasoning',color: '#ffa657' },
  { kind: 'compaction-event', label: 'Compact',  color: '#8b949e' },
  { kind: 'error-event',      label: 'Errors',   color: '#f85149' },
  { kind: 'turn-summary',     label: 'Summary',  color: '#3fb950' },
  { kind: 'pr-link',          label: 'PRs',      color: '#bc8cff' },
];

export default function FilterBar({ activeKinds, onChange, currentTurnOnly, onCurrentTurnOnly }) {
  function toggle(kind) {
    const next = new Set(activeKinds);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    onChange(next);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
      padding: '6px 12px',
      background: 'var(--bg-1)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {/* All / None */}
      <button onClick={() => onChange(new Set(ALL_KINDS))}
        style={{ padding: '2px 8px', fontSize: 10, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
        All
      </button>
      <button onClick={() => onChange(new Set())}
        style={{ padding: '2px 8px', fontSize: 10, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer', marginRight: 4 }}>
        None
      </button>

      {FILTER_GROUPS.map(({ kind, label, color }) => {
        const active = activeKinds.has(kind);
        return (
          <button key={kind} onClick={() => toggle(kind)}
            style={{
              padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 10,
              background: active ? `${color}22` : 'transparent',
              border: `1px solid ${active ? color : 'var(--border)'}`,
              color: active ? color : 'var(--text-muted)',
              transition: 'all 0.1s',
            }}>
            {label}
          </button>
        );
      })}

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

      {/* Current turn only */}
      <button onClick={() => onCurrentTurnOnly(!currentTurnOnly)}
        style={{
          padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 10,
          background: currentTurnOnly ? 'rgba(88,166,255,0.15)' : 'transparent',
          border: `1px solid ${currentTurnOnly ? 'var(--accent)' : 'var(--border)'}`,
          color: currentTurnOnly ? 'var(--accent)' : 'var(--text-muted)',
        }}>
        Current turn
      </button>
    </div>
  );
}
