import React from 'react';

export default function ClipControls({ currentStep, clipIn, clipOut, onSetIn, onSetOut, onClear, onExport }) {
  const hasClip = clipIn != null && clipOut != null && clipIn <= clipOut;
  const clipLength = hasClip ? clipOut - clipIn + 1 : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button
        onClick={() => onSetIn(currentStep)}
        title="Mark clip in-point at current step"
        style={{
          padding: '4px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          background: clipIn != null ? 'rgba(88,166,255,0.15)' : 'var(--bg-2)',
          border: `1px solid ${clipIn != null ? 'var(--accent)' : 'var(--border)'}`,
          color: clipIn != null ? 'var(--accent)' : 'var(--text-secondary)',
        }}>
        ⌊ In{clipIn != null ? ` ${clipIn}` : ''}
      </button>

      <button
        onClick={() => onSetOut(currentStep)}
        title="Mark clip out-point at current step"
        style={{
          padding: '4px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          background: clipOut != null ? 'rgba(88,166,255,0.15)' : 'var(--bg-2)',
          border: `1px solid ${clipOut != null ? 'var(--accent)' : 'var(--border)'}`,
          color: clipOut != null ? 'var(--accent)' : 'var(--text-secondary)',
        }}>
        Out {clipOut != null ? clipOut : ''} ⌉
      </button>

      {(clipIn != null || clipOut != null) && (
        <button onClick={onClear}
          style={{ padding: '4px 6px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          ✕
        </button>
      )}

      <button
        onClick={onExport}
        disabled={!hasClip}
        title={hasClip ? `Export ${clipLength} steps` : 'Set in/out points first'}
        style={{
          padding: '4px 10px', fontSize: 11, cursor: hasClip ? 'pointer' : 'not-allowed',
          borderRadius: 'var(--radius-sm)',
          background: hasClip ? 'var(--accent-dim)' : 'var(--bg-2)',
          border: `1px solid ${hasClip ? 'var(--accent)' : 'var(--border)'}`,
          color: hasClip ? 'white' : 'var(--text-muted)',
          opacity: hasClip ? 1 : 0.5,
        }}>
        Export{hasClip ? ` (${clipLength})` : ''}
      </button>
    </div>
  );
}
