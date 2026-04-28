import { kindColor } from '../../lib/editor/kindColors.js';
import { useTheme } from '../../hooks/useTheme.js';

export const ALL_KINDS = [
  'session-header', 'human', 'assistant-text',
  'tool-bash', 'tool-write', 'tool-edit', 'tool-read',
  'tool-agent', 'tool-web', 'tool-task', 'tool-skill', 'tool-generic',
  'hook-event', 'agent-progress', 'compaction-event', 'error-event',
  'turn-summary', 'pr-link', 'local-command', 'local-command-output',
];

const FILTER_GROUPS = [
  { kind: 'human',            label: 'Human' },
  { kind: 'assistant-text',   label: 'Claude' },
  { kind: 'tool-bash',        label: 'Bash' },
  { kind: 'tool-write',       label: 'Write' },
  { kind: 'tool-edit',        label: 'Edit' },
  { kind: 'tool-read',        label: 'Read' },
  { kind: 'tool-agent',       label: 'Agent' },
  { kind: 'tool-skill',       label: 'Skills' },
  { kind: 'tool-web',         label: 'Web' },
  { kind: 'tool-task',        label: 'Tasks' },
  { kind: 'local-command',    label: 'Commands' },
  { kind: 'hook-event',       label: 'Hooks' },
  { kind: 'agent-progress',   label: 'Reasoning' },
  { kind: 'compaction-event', label: 'Compact' },
  { kind: 'error-event',      label: 'Errors' },
  { kind: 'turn-summary',     label: 'Summary' },
  { kind: 'pr-link',          label: 'PRs' },
];

export default function FilterBar({ activeKinds, onChange, currentTurnOnly, onCurrentTurnOnly }) {
  const _theme = useTheme(); // Force re-render on theme change
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

      {FILTER_GROUPS.map(({ kind, label }) => {
        const active = activeKinds.has(kind);
        const color = kindColor(kind);
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
