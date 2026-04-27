import React, { useState, useEffect } from 'react';
import { StageCard, CardHeader, timestamp } from './shared.jsx';
import ToolModal from './ToolModal.jsx';
import { useReplayContext } from '../../lib/ReplayContext.jsx';
import { getSavedSessionsDirectory } from '../../lib/fsAccess.ts';
import { checkSubAgentExists, listSubAgentIds } from '../../lib/progressiveSessionReader.ts';

export default function ToolAgent({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts, subAgentId } = step.event;
  const [modalOpen, setModalOpen] = useState(false);
  const [agentUrl, setAgentUrl] = useState(null);
  const { projectId, sessionId, steps, session } = useReplayContext();

  const description = toolInput.description || toolInput.subagent_type || 'Sub-agent';
  const prompt = toolInput.prompt || '';
  const resultText = result?.text || '';

  useEffect(() => {
    if (!projectId || !sessionId) return;

    // Positional index among all tool-agent steps (used for both paths)
    const agentStepIndices = (steps || [])
      .filter(s => s.kind === 'tool-agent')
      .map(s => s.index);
    const myPosition = agentStepIndices.indexOf(step.index);
    if (myPosition < 0) return;

    // Firefox path: use subAgentLines stored in cache during import
    if (session?.subAgentLines) {
      // Sort cached agent IDs by the first timestamp in their lines (creation order)
      const cachedIds = Object.entries(session.subAgentLines)
        .map(([id, lines]) => ({ id, firstTs: lines[0]?.timestamp || '' }))
        .sort((a, b) => a.firstTs.localeCompare(b.firstTs))
        .map(e => e.id);
      const resolvedId = subAgentId || cachedIds[myPosition] || null;
      if (resolvedId && session.subAgentLines[resolvedId]) {
        setAgentUrl(`/replay/${sessionId}/agent/${resolvedId}`);
        return;
      }
    }

    // Chromium path: check filesystem
    getSavedSessionsDirectory()
      .then(async handle => {
        if (!handle) return null;

        if (subAgentId) {
          const exists = await checkSubAgentExists(handle, projectId, sessionId, subAgentId);
          return exists ? subAgentId : null;
        }

        const agentIds = await listSubAgentIds(handle, projectId, sessionId);
        return agentIds[myPosition] ?? null;
      })
      .then(resolvedAgentId => {
        if (resolvedAgentId) setAgentUrl(`/replay/${sessionId}/agent/${resolvedAgentId}`);
      })
      .catch(() => {});
  }, [subAgentId, projectId, sessionId, steps, step.index, session]);

  const sections = [];
  if (prompt) {
    sections.push({ label: 'Prompt', content: prompt, mono: true, maxHeight: '400px' });
  }
  if (resultText) {
    sections.push({ label: 'Result', content: resultText, mono: true, maxHeight: '400px' });
  }

  return (
    <>
      <StageCard isSearchMatch={isSearchMatch} accent="var(--orange)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}>
        <CardHeader icon="◈" label={`agent · ${toolInput.subagent_type || 'general'}`} accent="var(--orange)" meta={timestamp(ts)} />
        <div style={{ padding: '10px 14px' }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{description}</div>
          {prompt && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {prompt.slice(0, 120)}{prompt.length > 120 ? '…' : ''}
            </div>
          )}
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
        {agentUrl && (
          <a
            href={agentUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'block', width: '100%', padding: '5px',
              background: 'var(--bg-2)',
              borderTop: '1px solid var(--border)',
              color: 'var(--orange)',
              fontSize: 11, cursor: 'pointer',
              textAlign: 'center',
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            ◈ Open agent replay ↗
          </a>
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
