import { timestamp } from './shared.jsx';

export default function HumanTurn({ step, isCurrent }) {
  return (
    <div style={{
      margin: '16px 16px 4px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
    }}>
      <div style={{
        maxWidth: '80%',
        background: 'var(--accent-dim)',
        border: `1px solid ${isCurrent ? 'var(--accent)' : 'transparent'}`,
        borderRadius: '12px 12px 2px 12px',
        padding: '10px 14px',
        color: 'var(--text-primary)',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: isCurrent ? '0 0 0 2px rgba(88,166,255,0.3)' : 'none',
        transition: 'box-shadow 0.3s',
      }}>
        {step.event.text}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingRight: 4 }}>
        You · {timestamp(step.timestamp)}
      </div>
    </div>
  );
}
