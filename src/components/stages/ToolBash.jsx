import React, { useState } from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp, COLLAPSE, ExpandButton } from './shared.jsx';

export default function ToolBash({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts } = step.event;
  const [expanded, setExpanded] = useState(false);

  const resultText = result?.text || '';
  const isError = result?.isError;
  const lines = resultText.split('\n');
  const hasMore = lines.length > COLLAPSE.BASH_LINES;
  const preview = hasMore ? lines.slice(0, COLLAPSE.BASH_LINES).join('\n') : resultText;

  return (
    <StageCard isSearchMatch={isSearchMatch} accent={isError ? 'var(--red)' : 'var(--cyan)'} style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader icon="$" label="bash" accent="var(--cyan)" meta={timestamp(ts)} />
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
              {hasMore && !expanded ? preview + `\n… (${lines.length - COLLAPSE.BASH_LINES} more lines)` : resultText}
            </span>
          </CodeBlock>
          {hasMore && (
            <ExpandButton
              expanded={expanded}
              onToggle={() => setExpanded(e => !e)}
              expandLabel={`▼ show ${lines.length - COLLAPSE.BASH_LINES} more lines`}
              collapseLabel="▲ collapse"
            />
          )}
        </div>
      )}
    </StageCard>
  );
}
