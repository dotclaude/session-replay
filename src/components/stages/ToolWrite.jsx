import React, { useState } from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp } from './shared.jsx';

export default function ToolWrite({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts } = step.event;
  const [expanded, setExpanded] = useState(false);
  const filePath = toolInput.file_path || '';
  const content = toolInput.content || '';
  const lines = content.split('\n');
  const ext = filePath.split('.').pop();

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--accent)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader
        icon="✎"
        label="write"
        accent="var(--accent)"
        meta={timestamp(ts)}
      />
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{filePath}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lines.length} lines</span>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <CodeBlock lang={ext}>{content}</CodeBlock>
        </div>
      )}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'block', width: '100%', padding: '5px',
          background: 'var(--bg-2)', border: 'none',
          borderTop: '1px solid var(--border)', color: 'var(--text-muted)',
          fontSize: 11, cursor: 'pointer',
        }}
      >
        {expanded ? '▲ hide content' : '▼ show content'}
      </button>
    </StageCard>
  );
}
