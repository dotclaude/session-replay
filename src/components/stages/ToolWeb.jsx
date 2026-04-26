import React from 'react';
import { StageCard, CardHeader, timestamp } from './shared.jsx';

export default function ToolWeb({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, toolName, timestamp: ts } = step.event;
  const isSearch = toolName === 'WebSearch';
  const label = isSearch ? toolInput.query : toolInput.url;

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--accent)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
      <CardHeader icon={isSearch ? '🔍' : '🌐'} label={isSearch ? 'web search' : 'web fetch'} accent="var(--accent)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all' }}>
        {label}
      </div>
    </StageCard>
  );
}
