import React from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp, CollapsibleBlock } from './shared.jsx';

export default function ToolRead({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts } = step.event;
  const filePath = toolInput.file_path || '';
  const content = result?.text || '';

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--purple)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader icon="👁" label="read" accent="var(--purple)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{filePath}</span>
        {toolInput.offset && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>L{toolInput.offset}–{(toolInput.offset || 0) + (toolInput.limit || 0)}</span>}
      </div>
      <CollapsibleBlock expandLabel="▼ show result" collapseLabel="▲ hide" disabled={!content}>
        <CodeBlock>{content}</CodeBlock>
      </CollapsibleBlock>
    </StageCard>
  );
}
