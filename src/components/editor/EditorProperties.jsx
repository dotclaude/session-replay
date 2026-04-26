import React from 'react';
import { kindColor } from '../../lib/editor/kindColors.js';
import { useTheme } from '../../hooks/useTheme.js';

const Section = ({ title, children }) => (
  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
      {title}
    </div>
    {children}
  </div>
);

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
    {children}
  </div>
);

const Val = ({ children, color }) => (
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: color || 'var(--text-primary)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', minWidth: '60px', textAlign: 'right' }}>
    {children}
  </span>
);

export default function EditorProperties({ composition, dispatch }) {
  const theme = useTheme(); // Force re-render on theme change
  const { selectedClipId, selectedAnnotationId, clips, annotations } = composition;

  const clip = selectedClipId ? clips.find(c => c.id === selectedClipId) : null;
  const annotation = selectedAnnotationId ? annotations.find(a => a.id === selectedAnnotationId) : null;

  if (!clip && !annotation) {
    return (
      <div style={{ padding: '16px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
        Select a clip or annotation to edit its properties.
      </div>
    );
  }

  if (clip) {
    return (
      <div>
        <Section title="Clip">
          <Row label="Kind">
            <Val color={kindColor(clip.kind)}>{clip.kind}</Val>
          </Row>
          <Row label="Step">
            <Val>#{clip.stepIndex}</Val>
          </Row>
        </Section>

        <Section title="Label">
          <input
            value={clip.label}
            onChange={e => dispatch({ type: 'SET_CLIP_LABEL', payload: { clipId: clip.id, label: e.target.value } })}
            style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
          />
        </Section>

        <Section title="Timing">
          <Row label="Start">
            <Val>{(clip.startMs / 1000).toFixed(2)}s</Val>
          </Row>
          <Row label="Duration">
            <Val>{clip.durationMs}ms</Val>
          </Row>
          <input
            type="range" min={100} max={5000} step={50}
            value={clip.durationMs}
            onChange={e => dispatch({ type: 'RESIZE_CLIP', payload: { clipId: clip.id, durationMs: +e.target.value } })}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </Section>

        <Section title="Speed">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3px' }}>
            {[0.5, 1, 2, 4].map(s => (
              <button
                key={s}
                onClick={() => dispatch({ type: 'SET_CLIP_SPEED', payload: { clipId: clip.id, speedFactor: s } })}
                style={{ height: '22px', background: clip.speedFactor === s ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${clip.speedFactor === s ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', color: clip.speedFactor === s ? '#fff' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '9px', cursor: 'pointer' }}
              >
                {s}×
              </button>
            ))}
          </div>
        </Section>

        <Section title="Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_CLIP_MUTE', payload: { clipId: clip.id } })}
              style={{ height: '26px', background: clip.muted ? 'rgba(248,81,73,0.1)' : 'var(--bg-2)', border: `1px solid ${clip.muted ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', color: clip.muted ? 'var(--red)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'pointer' }}
            >
              {clip.muted ? '🔇 Muted' : '🔊 Mute'}
            </button>
            <button
              onClick={() => dispatch({ type: 'SPLIT_CLIP', payload: { clipId: clip.id, atMs: composition.playheadMs } })}
              style={{ height: '26px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'pointer' }}
            >
              ✂ Split at playhead
            </button>
            <button
              onClick={() => dispatch({ type: 'DELETE_CLIP', payload: { clipId: clip.id } })}
              style={{ height: '26px', background: 'rgba(248,81,73,0.08)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'pointer' }}
            >
              ⌫ Delete clip
            </button>
          </div>
        </Section>
      </div>
    );
  }

  // Annotation selected
  return (
    <div>
      <Section title={`Annotation · ${annotation.type}`}>
        {annotation.type === 'text' && (
          <Row label="Text">
            <input
              value={annotation.text || ''}
              onChange={e => dispatch({ type: 'UPDATE_ANNOTATION', payload: { annotationId: annotation.id, patch: { text: e.target.value } } })}
              style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-primary)' }}
            />
          </Row>
        )}
        <Row label="Start"><Val>{(annotation.startMs / 1000).toFixed(2)}s</Val></Row>
        <Row label="Duration"><Val>{annotation.durationMs}ms</Val></Row>
        <input
          type="range" min={500} max={10000} step={100}
          value={annotation.durationMs}
          onChange={e => dispatch({ type: 'UPDATE_ANNOTATION', payload: { annotationId: annotation.id, patch: { durationMs: +e.target.value } } })}
          style={{ width: '100%', marginTop: '4px' }}
        />
      </Section>
      <Section title="Actions">
        <button
          onClick={() => dispatch({ type: 'DELETE_ANNOTATION', payload: { annotationId: annotation.id } })}
          style={{ width: '100%', height: '26px', background: 'rgba(248,81,73,0.08)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'pointer' }}
        >
          ⌫ Delete annotation
        </button>
      </Section>
    </div>
  );
}
