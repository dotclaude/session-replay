import React from 'react';
import TimelineClip from './TimelineClip.jsx';

export default function TimelineLayer({
  label,
  labelColor,
  clips,
  containerWidth,
  visibleMs,
  scrollMs,
  selectedClipId,
  dispatch,
  onBgClick,
  height = 32,
}) {
  const HEADER_W = 72;
  const bodyWidth = containerWidth - HEADER_W;

  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', height }}>
      {/* Track header */}
      <div style={{
        width: HEADER_W,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        background: 'var(--bg-1)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: labelColor || 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      {/* Clip area */}
      <div
        style={{ flex: 1, position: 'relative', background: 'var(--bg-0)', cursor: 'crosshair', overflow: 'hidden' }}
        onClick={onBgClick}
      >
        {clips.map(clip => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            containerWidth={bodyWidth}
            visibleMs={visibleMs}
            scrollMs={scrollMs}
            isSelected={clip.id === selectedClipId}
            onSelect={id => dispatch({ type: 'SELECT_CLIP', payload: { clipId: id } })}
            dispatch={dispatch}
          />
        ))}
      </div>
    </div>
  );
}
