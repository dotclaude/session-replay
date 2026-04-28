import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StageCard, CardHeader, timestamp, COLLAPSE, CollapsibleText } from './shared.jsx';
import ToolModal from './ToolModal.jsx';
import { useReplayContext } from '../../lib/ReplayContext.jsx';
import { useSessionProvider } from '../../lib/SessionProviderContext.jsx';

export default function ToolAgent({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts, subAgentId } = step.event;
  const [modalOpen, setModalOpen] = useState(false);
  const [agentPath, setAgentPath] = useState(null);
  const navigate = useNavigate();
  const { projectId, sessionId, steps, session } = useReplayContext();
  const { provider } = useSessionProvider();

  const description = toolInput.description || toolInput.subagent_type || 'Sub-agent';
  const prompt = toolInput.prompt || '';
  const resultText = result?.text || '';

  useEffect(() => {
    if (!projectId || !sessionId || !provider) return;

    const agentStepIndices = (steps || [])
      .filter(s => s.kind === 'tool-agent')
      .map(s => s.index);
    const myPosition = agentStepIndices.indexOf(step.index);
    if (myPosition < 0) return;

    provider.listSubAgentIds(projectId, sessionId, session?.subAgentLines)
      .then(agentIds => {
        // If we have a direct agentId from agent_progress events, verify it's in the list
        const resolvedId = subAgentId && agentIds.includes(subAgentId)
          ? subAgentId
          : agentIds[myPosition] ?? null;
        if (resolvedId) setAgentPath(`/replay/${sessionId}/agent/${resolvedId}`);
      })
      .catch(() => {});
  }, [subAgentId, projectId, sessionId, steps, step.index, session, provider]);

  const sections = [];
  if (prompt) {
    sections.push({ label: 'Prompt', content: prompt, mono: true });
  }
  if (resultText) {
    sections.push({ label: 'Result', content: resultText, mono: true });
  }

  return (
    <>
      <StageCard isSearchMatch={isSearchMatch} accent="var(--orange)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
        <CardHeader icon="◈" label={`agent · ${toolInput.subagent_type || 'general'}`} accent="var(--orange)" meta={timestamp(ts)} />
        <div style={{ padding: '10px 14px' }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{description}</div>
          <CollapsibleText text={prompt} limit={COLLAPSE.PREVIEW_CHARS} />
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'block', width: '100%', padding: '5px',
            background: 'var(--bg-2)', border: 'none',
            borderTop: '1px solid var(--border)', color: 'var(--text-muted)',
            fontSize: 11, cursor: 'pointer',
          }}
        >
          👁 view details
        </button>
        {agentPath && (
          <button
            onClick={e => { e.stopPropagation(); navigate(agentPath); }}
            style={{
              display: 'block', width: '100%', padding: '5px',
              background: 'var(--bg-2)', border: 'none',
              borderTop: '1px solid var(--border)',
              color: 'var(--orange)',
              fontSize: 11, cursor: 'pointer',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            ◈ Open agent replay →
          </button>
        )}
      </StageCard>

      <ToolModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Agent: ${toolInput.subagent_type || 'general'}`}
        sections={sections}
      />
    </>
  );
}
