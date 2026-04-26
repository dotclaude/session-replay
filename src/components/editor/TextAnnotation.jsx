import React, { useState } from 'react';

export default function TextAnnotation({ annotation, canvasWidth, canvasHeight, isSelected, onSelect, dispatch }) {
  const x = annotation.x * canvasWidth;
  const y = annotation.y * canvasHeight;
  const [dragging, setDragging] = useState(false);

  function handleMouseDown(e) {
    e.stopPropagation();
    onSelect(annotation.id);
    setDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = annotation.x;
    const origY = annotation.y;

    function onMouseMove(ev) {
      const dx = (ev.clientX - startX) / canvasWidth;
      const dy = (ev.clientY - startY) / canvasHeight;
      dispatch({ type: 'UPDATE_ANNOTATION', payload: {
        annotationId: annotation.id,
        patch: {
          x: Math.max(0, Math.min(1, origX + dx)),
          y: Math.max(0, Math.min(1, origY + dy)),
        },
      }});
    }
    function onMouseUp() {
      setDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  return (
    <g onMouseDown={handleMouseDown} style={{ cursor: 'move' }}>
      {/* Background */}
      <rect
        x={x - 4}
        y={y - (annotation.fontSize || 14) - 2}
        width={(annotation.text?.length || 5) * (annotation.fontSize || 14) * 0.6 + 8}
        height={(annotation.fontSize || 14) + 8}
        rx={3}
        fill={annotation.color || '#f778ba'}
        fillOpacity={0.85}
      />
      <text
        x={x}
        y={y}
        fontSize={annotation.fontSize || 14}
        fontFamily="'Consolas', 'SF Mono', monospace"
        fill="#fff"
        style={{ userSelect: 'none' }}
      >
        {annotation.text}
      </text>
      {/* Selection outline */}
      {isSelected && (
        <rect
          x={x - 6}
          y={y - (annotation.fontSize || 14) - 4}
          width={(annotation.text?.length || 5) * (annotation.fontSize || 14) * 0.6 + 12}
          height={(annotation.fontSize || 14) + 12}
          rx={4}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      )}
    </g>
  );
}
