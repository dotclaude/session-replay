import React from 'react';
import { StageCard, CardHeader, timestamp } from './shared.jsx';

export default function ErrorEvent({ step, isCurrent, isSearchMatch }) {
  const { error, messageId, model, timestamp: ts } = step.event;

  return (
    <StageCard accent="var(--red)" isCurrent={isCurrent} isSearchMatch={isSearchMatch} style={{ margin: '3px 16px' }}>
      <CardHeader icon="✕" label="api error" accent="var(--red)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px' }}>
        <div style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.5, fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
          {error}
        </div>
        {model && model !== '<synthetic>' && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            model: {model}
            {messageId && ` · ${messageId}`}
          </div>
        )}
      </div>
    </StageCard>
  );
}
