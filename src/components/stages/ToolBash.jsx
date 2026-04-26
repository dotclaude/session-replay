import React, { useState } from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp } from './shared.jsx';

export default function ToolBash({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts } = step.event;
  const [expanded, setExpanded] = useState(true);

  const resultText = result?.text || '';
  const isError = result?.isError;
  const lines = resultText.split('\n');
  const preview = lines.slice(0, 12).join('\n');
  const hasMore = lines.length > 12;

  return (
    <StageCard isSearchMatch={isSearchMatch} accent={isError ? 'var(--red)' : 'var(--cyan)'} style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader
        icon="$"
        label="bash"
        accent="var(--cyan)"
        meta={timestamp(ts)}
      />
      <CodeBlock>
        <span style={{ color: 'var(--cyan)' }}>$ </span>
        <span style={{ color: 'var(--text-primary)' }}>{toolInput.command || ''}</span>
        {toolInput.description && (
          <span style={{ color: 'var(--text-muted)' }}>  # {toolInput.description}</span>
        )}
      </CodeBlock>
      {resultText && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <CodeBlock>
            <span style={{ color: isError ? 'var(--red)' : 'var(--text-secondary)' }}>
              {hasMore && !expanded ? preview + `\n… (${lines.length - 12} more lines)` : resultText}
            </span>
          </CodeBlock>
          {hasMore && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                display: 'block', width: '100%', padding: '4px',
                background: 'var(--bg-2)', border: 'none',
                borderTop: '1px solid var(--border)', color: 'var(--text-muted)',
                fontSize: 11, cursor: 'pointer',
              }}
            >
              {expanded ? '▲ collapse' : `▼ show ${lines.length - 12} more lines`}
            </button>
          )}
        </div>
      )}
    </StageCard>
  );
}
