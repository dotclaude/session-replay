import { useState } from 'react';
import { StageCard, CardHeader, timestamp, COLLAPSE } from './shared.jsx';
import ToolModal from './ToolModal.jsx';

export default function ToolSkill({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, result, skillDoc, timestamp: ts } = step.event;
  const [modalOpen, setModalOpen] = useState(false);

  const skillName = toolInput.skill || 'unknown';
  const skillArgs = toolInput.args || '';

  // Extract skill category and name
  const [category, name] = skillName.includes(':')
    ? skillName.split(':')
    : ['', skillName];

  const skillLabel = name || skillName;
  const categoryLabel = category ? `${category}/` : '';

  // Build modal sections
  const sections = [];
  if (skillArgs) {
    sections.push({ label: 'Arguments', content: skillArgs, mono: false });
  }
  if (skillDoc) {
    sections.push({ label: 'Documentation', content: skillDoc, mono: true });
  }
  if (result?.text) {
    sections.push({ label: 'Result', content: result.text, mono: true });
  }

  return (
    <>
      <StageCard
        isSearchMatch={isSearchMatch}
        accent="var(--purple)"
        style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}
      >
        <CardHeader
          icon="🎯"
          label={`${categoryLabel}${skillLabel}`}
          accent="var(--purple)"
          meta={timestamp(ts)}
        />

        {/* Skill args preview */}
        {skillArgs && (
          <div style={{
            padding: '8px 14px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
            maxHeight: COLLAPSE.SKILL_PREVIEW_HEIGHT,
            overflow: 'hidden',
            position: 'relative',
          }}>
            {skillArgs}
            {skillArgs.length > COLLAPSE.SKILL_FADE_CHARS && (
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '30px',
                background: 'linear-gradient(transparent, var(--bg-1))',
              }} />
            )}
          </div>
        )}

        {/* View details button */}
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'block',
            width: '100%',
            padding: '5px',
            background: 'var(--bg-2)',
            border: 'none',
            borderTop: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          👁 view details
        </button>
      </StageCard>

      <ToolModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Skill: ${categoryLabel}${skillLabel}`}
        sections={sections}
      />
    </>
  );
}
