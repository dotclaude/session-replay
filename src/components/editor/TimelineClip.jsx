import React, { useRef, useState } from 'react';
import { kindColor } from '../../lib/editor/kindColors.js';

function msToPixel(ms, containerWidth, visibleMs, scrollMs) {
  return ((ms - scrollMs) / visibleMs) * containerWidth;
}

export default function TimelineClip({
  clip,
  containerWidth,
  visibleMs,
  scrollMs,
  isSelected,
  onSelect,
  dispatch,
}) {
  const dragOffsetRef = useRef(0);
  const [dragPreviewStartMs, setDragPreviewStartMs] = useState(null);
  const [resizePreviewDurationMs, setResizePreviewDurationMs] = useState(null);

  const displayStartMs = dragPreviewStartMs ?? clip.startMs;
  const displayDurationMs = resizePreviewDurationMs ?? clip.durationMs;

  const left = msToPixel(displayStartMs, containerWidth, visibleMs, scrollMs);
  const width = Math.max(2, (displayDurationMs / visibleMs) * containerWidth);

  const color = kindColor(clip.kind);

  function handleBodyMouseDown(e) {
    e.stopPropagation();
    onSelect(clip.id);

    const startX = e.clientX;
    const origStartMs = clip.startMs;
    const msPerPixel = visibleMs / containerWidth;

    function onMouseMove(ev) {
      const dx = ev.clientX - startX;
      const newStartMs = Math.max(0, origStartMs + dx * msPerPixel);
      setDragPreviewStartMs(newStartMs);
    }
    function onMouseUp() {
      setDragPreviewStartMs(prev => {
        if (prev !== null) {
          dispatch({ type: 'MOVE_CLIP', payload: { clipId: clip.id, startMs: prev } });
        }
        return null;
      });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function handleResizeMouseDown(e) {
    e.stopPropagation();
    const startX = e.clientX;
    const origDurationMs = clip.durationMs;
    const msPerPixel = visibleMs / containerWidth;

    function onMouseMove(ev) {
      const dx = ev.clientX - startX;
      const newDurationMs = Math.max(100, origDurationMs + dx * msPerPixel);
      setResizePreviewDurationMs(newDurationMs);
    }
    function onMouseUp() {
      setResizePreviewDurationMs(prev => {
        if (prev !== null) {
          dispatch({ type: 'RESIZE_CLIP', payload: { clipId: clip.id, durationMs: prev } });
        }
        return null;
      });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  return (
    <div
      onMouseDown={handleBodyMouseDown}
      style={{
        position: 'absolute',
        left,
        top: 4,
        width,
        height: 24,
        borderRadius: '3px',
        background: color,
        opacity: clip.muted ? 0.35 : 1,
        border: isSelected ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(0,0,0,0.3)',
        boxSizing: 'border-box',
        cursor: 'grab',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      {/* Dark overlay for readability */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', borderRadius: 'inherit', pointerEvents: 'none' }} />
      {/* Label */}
      <span style={{
        position: 'relative',
        zIndex: 1,
        fontFamily: 'var(--font-mono)',
        fontSize: '8px',
        color: 'rgba(255,255,255,0.9)',
        padding: '0 5px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
        minWidth: 0,
      }}>
        {width > 24 ? clip.label : ''}
      </span>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'ew-resize',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '0 2px 2px 0',
          zIndex: 2,
        }}
      />
    </div>
  );
}
