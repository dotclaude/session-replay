import { StageCard, CardHeader, timestamp } from './shared.jsx';

export default function HookEvent({ step, isCurrent, isSearchMatch }) {
  const { hookEvent, hookName, command, timestamp: ts } = step.event;
  return (
    <StageCard accent="var(--yellow)" isCurrent={isCurrent} isSearchMatch={isSearchMatch} style={{ margin: '2px 16px', opacity: isCurrent ? 1 : 0.75 }}>
      <CardHeader icon="⚡" label={`hook · ${hookEvent || ''}`} accent="var(--yellow)" meta={timestamp(ts)} />
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{hookName}</span>
        {command && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{command}</span>
        )}
      </div>
    </StageCard>
  );
}
