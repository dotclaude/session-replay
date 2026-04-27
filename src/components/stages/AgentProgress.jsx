import React from 'react';
import { StageCard, CardHeader, CodeBlock, timestamp, COLLAPSE, CollapsibleText, CollapsibleBlock } from './shared.jsx';

export default function AgentProgress({ step, isCurrent, isSearchMatch }) {
  const { agentId, prompt, innerMessage, timestamp: ts } = step.event;

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
      {innerText && (
        <div style={{ padding: '8px 14px' }}>
          <CollapsibleText
            text={innerText}
            limit={COLLAPSE.PREVIEW_CHARS}
            prefix={<span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>{innerRole}</span>}
          />
        </div>
      )}
      <CollapsibleBlock
        expandLabel="▼ expand"
        collapseLabel="▲ collapse"
        disabled={!prompt && !innerText}
      >
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
      </CollapsibleBlock>
    </StageCard>
  );
}
