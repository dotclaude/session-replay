import React from 'react';
import { StageCard, CardHeader, timestamp } from './shared.jsx';

export default function CompactionEvent({ step, isCurrent, isSearchMatch }) {
  const { preTokens, trigger, preCompactDiscoveredTools, timestamp: ts } = step.event;

  return (
    <StageCard accent="var(--text-secondary)" isCurrent={isCurrent} isSearchMatch={isSearchMatch} style={{ margin: '2px 16px', opacity: isCurrent ? 1 : 0.65 }}>
      <CardHeader icon="◎" label="context compact" accent="var(--text-secondary)" meta={timestamp(ts)} />
      <div style={{ padding: '6px 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {preTokens && (
          <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {preTokens.toLocaleString()} tokens at boundary
          </span>
        )}
        {trigger && (
          <span className="tag">{trigger}</span>
        )}
        {preCompactDiscoveredTools?.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {preCompactDiscoveredTools.length} tools in scope
          </span>
        )}
      </div>
    </StageCard>
  );
}
