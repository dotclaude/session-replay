import React from 'react';

export default function TimelineScrubber({ playheadMs, visibleMs, scrollMs, containerWidth, trackHeaderWidth, onDrag }) {
  const px = trackHeaderWidth + ((playheadMs - scrollMs) / visibleMs) * (containerWidth - trackHeaderWidth);

  // Don't render if out of visible range
  if (px < trackHeaderWidth - 2 || px > containerWidth + 2) return null;

  function handleMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();
    const msPerPixel = visibleMs / (containerWidth - trackHeaderWidth);
    const startX = e.clientX;
    const startMs = playheadMs;

    function onMouseMove(ev) {
      const dx = ev.clientX - startX;
      onDrag(Math.max(0, startMs + dx * msPerPixel));
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: px,
        top: 0,
        bottom: 0,
        width: '1px',
        background: 'var(--accent)',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      {/* Drag handle at top */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          left: '-5px',
          width: '11px',
          height: '14px',
          background: 'var(--accent)',
          borderRadius: '0 0 3px 3px',
          cursor: 'col-resize',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
    </div>
  );
}
