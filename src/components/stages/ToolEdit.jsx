import { StageCard, CardHeader, CodeBlock, CollapsibleBlock } from './shared.jsx';
import { timestamp } from './stageUtils.js';

export default function ToolEdit({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, timestamp: ts } = step.event;
  const filePath = toolInput.file_path || '';
  const oldStr = toolInput.old_string || '';
  const newStr = toolInput.new_string || '';

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--yellow)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader icon="±" label="edit" accent="var(--yellow)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{filePath}</span>
      </div>
      <CollapsibleBlock expandLabel="▼ show diff" collapseLabel="▲ hide diff">
        <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>− before</div>
        <CodeBlock><span style={{ color: 'var(--red)' }}>{oldStr}</span></CodeBlock>
        <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--green)', fontWeight: 600, fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)' }}>+ after</div>
        <CodeBlock><span style={{ color: 'var(--green)' }}>{newStr}</span></CodeBlock>
      </CollapsibleBlock>
    </StageCard>
  );
}
