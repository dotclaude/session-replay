import React, { useState } from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp } from './shared.jsx';

export default function ToolGeneric({ step, isCurrent, isSearchMatch = false }) {
  const { toolName, toolInput, result, timestamp: ts } = step.event;
  const [expanded, setExpanded] = useState(false);

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--border)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.7 }}>
      <CardHeader icon="⚙" label={toolName} accent="var(--text-muted)" meta={timestamp(ts)} />
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <CodeBlock>{JSON.stringify(toolInput, null, 2)}</CodeBlock>
          {result?.text && (
            <>
              <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, borderTop: '1px solid var(--border)' }}>RESULT</div>
              <CodeBlock>{result.text.slice(0, 150)}</CodeBlock>
            </>
          )}
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
        {expanded ? '▲ collapse' : '▼ inspect'}
      </button>
    </StageCard>
  );
}
