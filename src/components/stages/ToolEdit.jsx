import React, { useState } from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp } from './shared.jsx';

export default function ToolEdit({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts } = step.event;
  const [expanded, setExpanded] = useState(false);
  const filePath = toolInput.file_path || '';
  const oldStr = toolInput.old_string || '';
  const newStr = toolInput.new_string || '';

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--yellow)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader icon="±" label="edit" accent="var(--yellow)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{filePath}</span>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>− before</div>
          <CodeBlock><span style={{ color: 'var(--red)' }}>{oldStr}</span></CodeBlock>
          <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--green)', fontWeight: 600, fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)' }}>+ after</div>
          <CodeBlock><span style={{ color: 'var(--green)' }}>{newStr}</span></CodeBlock>
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
        {expanded ? '▲ hide diff' : '▼ show diff'}
      </button>
    </StageCard>
  );
}
