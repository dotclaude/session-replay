import React, { useState } from 'react';
import { StageCard, CardHeader, timestamp } from './shared.jsx';
import ToolModal from './ToolModal.jsx';

export default function ToolAgent({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, timestamp: ts } = step.event;
  const [modalOpen, setModalOpen] = useState(false);
  const description = toolInput.description || toolInput.subagent_type || 'Sub-agent';
  const prompt = toolInput.prompt || '';
  const resultText = result?.text || '';

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
