import React, { useState } from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp } from './shared.jsx';

export default function ToolRead({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts } = step.event;
  const [expanded, setExpanded] = useState(false);
  const filePath = toolInput.file_path || '';
  const content = result?.text || '';

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--purple)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader icon="👁" label="read" accent="var(--purple)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{filePath}</span>
        {toolInput.offset && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>L{toolInput.offset}–{(toolInput.offset || 0) + (toolInput.limit || 0)}</span>}
      </div>
      {expanded && content && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <CodeBlock>{content}</CodeBlock>
        </div>
      )}
      {content && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'block', width: '100%', padding: '5px',
            background: 'var(--bg-2)', border: 'none',
            borderTop: '1px solid var(--border)', color: 'var(--text-muted)',
            fontSize: 11, cursor: 'pointer',
          }}
        >
          {expanded ? '▲ hide' : '▼ show result'}
        </button>
      )}
    </StageCard>
  );
}
