import { timestamp } from './stageUtils.js';

export default function AssistantText({ step, isCurrent }) {
  const { text, usage } = step.event;

  return (
    <div style={{ margin: '4px 16px 4px' }}>
      <div style={{
        maxWidth: '85%',
        background: 'var(--bg-1)',
        border: `1px solid ${isCurrent ? 'var(--green)' : 'var(--border)'}`,
        borderRadius: '2px 12px 12px 12px',
        padding: '10px 14px',
        color: 'var(--text-primary)',
        fontSize: 13,
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: isCurrent ? '0 0 0 2px rgba(63,185,80,0.2)' : 'none',
        transition: 'box-shadow 0.3s',
      }}>
        {text}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 4, display: 'flex', gap: 8 }}>
        <span>Claude · {timestamp(step.timestamp)}</span>
        {usage?.output_tokens && <span>{usage.output_tokens} tokens</span>}
      </div>
    </div>
  );
}
