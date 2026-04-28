import { StageCard, CardHeader, CodeBlock, CollapsibleBlock } from './shared.jsx';
import { timestamp } from './stageUtils.js';

export default function ToolWrite({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, timestamp: ts } = step.event;
  const filePath = toolInput.file_path || '';
  const content = toolInput.content || '';
  const lines = content.split('\n');
  const ext = filePath.split('.').pop();

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--accent)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader icon="✎" label="write" accent="var(--accent)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{filePath}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lines.length} lines</span>
      </div>
      <CollapsibleBlock expandLabel="▼ show content" collapseLabel="▲ hide content">
        <CodeBlock lang={ext}>{content}</CodeBlock>
      </CollapsibleBlock>
    </StageCard>
  );
}
