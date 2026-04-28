import { timestamp } from './shared.jsx';

export default function PRBadge({ step, isCurrent: _isCurrent }) {
  const { prNumber, prUrl, prRepository, timestamp: ts } = step.event;

  return (
    <div style={{
      margin: '12px 16px',
      padding: '12px 16px',
      background: 'rgba(188, 140, 255, 0.08)',
      border: '1px solid rgba(188, 140, 255, 0.3)',
      borderRadius: 'var(--radius)',
      borderLeft: '3px solid var(--purple)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 20 }}>⎇</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--purple)', textTransform: 'uppercase', marginBottom: 4 }}>
          Pull Request Created
        </div>
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          {prRepository} #{prNumber}
        </a>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{prUrl}</div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{timestamp(ts)}</div>
    </div>
  );
}
