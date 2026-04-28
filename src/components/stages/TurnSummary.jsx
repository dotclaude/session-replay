import { timestamp } from './stageUtils.js';

export default function TurnSummary({ step, isCurrent: _isCurrent }) {
  return (
    <div style={{
      margin: '12px 16px',
      padding: '10px 16px',
      background: 'rgba(63, 185, 80, 0.08)',
      border: '1px solid rgba(63, 185, 80, 0.25)',
      borderRadius: 'var(--radius)',
      borderLeft: '3px solid var(--green)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--green)', textTransform: 'uppercase', marginBottom: 5 }}>
        Turn Summary · {timestamp(step.timestamp)}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {step.event.text}
      </div>
    </div>
  );
}
