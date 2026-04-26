import React, { useState } from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp } from './shared.jsx';

export default function AgentProgress({ step, isCurrent, isSearchMatch }) {
  const { agentId, prompt, innerMessage, timestamp: ts } = step.event;
  const [expanded, setExpanded] = useState(false);

  const innerContent = innerMessage?.message?.content;
  const innerText = Array.isArray(innerContent)
    ? innerContent.find(b => b.type === 'text')?.text || ''
    : typeof innerContent === 'string' ? innerContent : '';

  const innerRole = innerMessage?.type || innerMessage?.message?.role || 'message';

  return (
    <StageCard accent="var(--orange)" isCurrent={isCurrent} isSearchMatch={isSearchMatch} style={{ margin: '2px 16px', opacity: isCurrent ? 1 : 0.8 }}>
      <CardHeader
        icon="◈"
        label={`agent reasoning · ${(agentId || '').slice(0, 12) || 'sub-agent'}`}
        accent="var(--orange)"
        meta={timestamp(ts)}
      />
      <div style={{ padding: '8px 14px' }}>
        {!expanded && innerText && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>{innerRole}</span>
            {innerText.slice(0, 140)}{innerText.length > 140 ? '…' : ''}
          </div>
        )}
      </div>
      {(prompt || innerText) && (
        <>
          {expanded && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {prompt && (
                <>
                  <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>PROMPT</div>
                  <CodeBlock>{prompt}</CodeBlock>
                </>
              )}
              {innerText && (
                <>
                  <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, borderTop: prompt ? '1px solid var(--border)' : 'none', textTransform: 'uppercase' }}>
                    {innerRole}
                  </div>
                  <CodeBlock>{innerText}</CodeBlock>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ display: 'block', width: '100%', padding: '5px', background: 'var(--bg-2)', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
          >
            {expanded ? '▲ collapse' : '▼ expand'}
          </button>
        </>
      )}
    </StageCard>
  );
}
