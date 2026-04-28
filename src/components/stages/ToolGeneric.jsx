import { StageCard, CardHeader, CodeBlock, CollapsibleBlock } from './shared.jsx';
import { timestamp, COLLAPSE } from './stageUtils.js';

export default function ToolGeneric({ step, isCurrent, isSearchMatch = false }) {
  const { toolName, toolInput, result, timestamp: ts } = step.event;

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--border)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.7 }}>
      <CardHeader icon="⚙" label={toolName} accent="var(--text-muted)" meta={timestamp(ts)} />
      <CollapsibleBlock expandLabel="▼ inspect" collapseLabel="▲ collapse">
        <CodeBlock>{JSON.stringify(toolInput, null, 2)}</CodeBlock>
        {result?.text && (
          <>
            <div style={{ padding: '4px 14px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, borderTop: '1px solid var(--border)' }}>RESULT</div>
            <CodeBlock>{result.text.slice(0, COLLAPSE.GENERIC_CHARS)}</CodeBlock>
          </>
        )}
      </CollapsibleBlock>
    </StageCard>
  );
}
