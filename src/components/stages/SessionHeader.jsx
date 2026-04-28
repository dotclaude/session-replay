
export default function SessionHeader({ step }) {
  const { title } = step.event;
  return (
    <div style={{
      margin: '8px 16px 16px',
      padding: '16px 20px',
      background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      borderTop: '3px solid var(--accent)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
        Session Replay
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
        {title || 'Untitled Session'}
      </div>
    </div>
  );
}
