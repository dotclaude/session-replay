import React, { useRef, useState } from 'react';
import TextAnnotation from './TextAnnotation.jsx';

function ArrowAnnotation({ annotation, canvasWidth, canvasHeight, isSelected, onSelect, dispatch }) {
  const x1 = annotation.x * canvasWidth;
  const y1 = annotation.y * canvasHeight;
  const x2 = annotation.x2 !== undefined ? annotation.x2 * canvasWidth : x1 + 60;
  const y2 = annotation.y2 !== undefined ? annotation.y2 * canvasHeight : y1 + 40;
  const color = annotation.color || '#f778ba';

  return (
    <g onMouseDown={e => { e.stopPropagation(); onSelect(annotation.id); }} style={{ cursor: 'pointer' }}>
      <defs>
        <marker id={`arrow-${annotation.id}`} markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill={color} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={2}
        markerEnd={`url(#arrow-${annotation.id})`}
        strokeOpacity={0.9}
      />
      {isSelected && <circle cx={x1} cy={y1} r={5} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1} strokeDasharray="3 2" />}
    </g>
  );
}

function RectAnnotation({ annotation, canvasWidth, canvasHeight, isSelected, onSelect, dispatch }) {
  const x = annotation.x * canvasWidth;
  const y = annotation.y * canvasHeight;
  const w = (annotation.width || 0.2) * canvasWidth;
  const h = (annotation.height || 0.1) * canvasHeight;
  const color = annotation.color || '#f85149';

  return (
    <g onMouseDown={e => { e.stopPropagation(); onSelect(annotation.id); }} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={w} height={h} rx={4}
        fill={color} fillOpacity={0.12}
        stroke={color} strokeWidth={2} strokeOpacity={0.8}
      />
      {isSelected && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={5}
        fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="4 2"
      />}
    </g>
  );
}

// ── Inline text input for placing text annotations ────────────────────────────
function TextInput({ x, y, color, onCommit, onCancel }) {
  const [value, setValue] = useState('');
  return (
    <foreignObject x={x - 4} y={y - 20} width={200} height={32}>
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (value.trim()) onCommit(value.trim()); else onCancel(); }
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => { if (value.trim()) onCommit(value.trim()); else onCancel(); }}
        style={{
          width: '100%',
          background: 'rgba(0,0,0,0.75)',
          border: `2px solid ${color}`,
          borderRadius: '4px',
          padding: '2px 6px',
          fontFamily: "'Consolas', monospace",
          fontSize: '13px',
          color: '#fff',
          outline: 'none',
        }}
        placeholder="Type annotation…"
      />
    </foreignObject>
  );
}

// ── Main AnnotationLayer ──────────────────────────────────────────────────────
export default function AnnotationLayer({
  annotations,
  playheadMs,
  activeTool,
  activeColor,
  selectedAnnotationId,
  dispatch,
  canvasRef,
}) {
  const svgRef = useRef(null);
  const [pendingInput, setPendingInput] = useState(null); // { x, y, normX, normY }
  const [drawStart, setDrawStart] = useState(null);
  const [drawCurrent, setDrawCurrent] = useState(null);

  const isActive = activeTool && activeTool !== 'select';
  const color = activeColor || '#f778ba';

  // Visible annotations at current playhead
  const visible = annotations.filter(a => a.startMs <= playheadMs && playheadMs < a.startMs + a.durationMs);

  function getNorm(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      px: e.clientX - rect.left,
      py: e.clientY - rect.top,
    };
  }

  function handleSvgMouseDown(e) {
    if (!isActive) return;
    e.stopPropagation();
    const { x, y, px, py } = getNorm(e);

    if (activeTool === 'text') {
      setPendingInput({ x: px, y: py, normX: x, normY: y });
      return;
    }

    setDrawStart({ x, y, px, py });
    setDrawCurrent({ x, y, px, py });

    function onMouseMove(ev) {
      const n = getNorm(ev);
      setDrawCurrent(n);
    }
    function onMouseUp(ev) {
      const end = getNorm(ev);
      const id = `annot-${Date.now()}`;
      if (activeTool === 'arrow') {
        dispatch({ type: 'ADD_ANNOTATION', payload: {
          id, type: 'arrow', color,
          x, y, x2: end.x, y2: end.y,
          startMs: playheadMs, durationMs: 4000,
        }});
      } else if (activeTool === 'rect') {
        const minX = Math.min(x, end.x);
        const minY = Math.min(y, end.y);
        dispatch({ type: 'ADD_ANNOTATION', payload: {
          id, type: 'rect', color,
          x: minX, y: minY,
          width: Math.abs(end.x - x), height: Math.abs(end.y - y),
          startMs: playheadMs, durationMs: 4000,
        }});
      }
      setDrawStart(null);
      setDrawCurrent(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  const svgStyle = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: isActive ? 'auto' : 'none',
    cursor: isActive ? 'crosshair' : 'default',
  };

  return (
    <svg ref={svgRef} style={svgStyle} onMouseDown={handleSvgMouseDown}>
      {/* Existing visible annotations */}
      {visible.map(ann => {
        const props = {
          key: ann.id,
          annotation: ann,
          canvasWidth: svgRef.current?.clientWidth || 600,
          canvasHeight: svgRef.current?.clientHeight || 400,
          isSelected: ann.id === selectedAnnotationId,
          onSelect: id => dispatch({ type: 'SELECT_ANNOTATION', payload: { annotationId: id } }),
          dispatch,
        };
        if (ann.type === 'text') return <TextAnnotation {...props} />;
        if (ann.type === 'arrow') return <ArrowAnnotation {...props} />;
        if (ann.type === 'rect') return <RectAnnotation {...props} />;
        return null;
      })}

      {/* Draw-in-progress preview */}
      {drawStart && drawCurrent && activeTool === 'arrow' && svgRef.current && (
        <line
          x1={drawStart.x * svgRef.current.clientWidth}
          y1={drawStart.y * svgRef.current.clientHeight}
          x2={drawCurrent.x * svgRef.current.clientWidth}
          y2={drawCurrent.y * svgRef.current.clientHeight}
          stroke={color} strokeWidth={2} strokeDasharray="4 2" strokeOpacity={0.7}
        />
      )}
      {drawStart && drawCurrent && activeTool === 'rect' && svgRef.current && (() => {
        const cw = svgRef.current.clientWidth;
        const ch = svgRef.current.clientHeight;
        const x = Math.min(drawStart.x, drawCurrent.x) * cw;
        const y = Math.min(drawStart.y, drawCurrent.y) * ch;
        const w = Math.abs(drawCurrent.x - drawStart.x) * cw;
        const h = Math.abs(drawCurrent.y - drawStart.y) * ch;
        return <rect x={x} y={y} width={w} height={h} rx={3} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={2} strokeDasharray="4 2" strokeOpacity={0.7} />;
      })()}

      {/* Inline text input for text tool */}
      {pendingInput && (
        <TextInput
          x={pendingInput.x}
          y={pendingInput.y}
          color={color}
          onCommit={text => {
            dispatch({ type: 'ADD_ANNOTATION', payload: {
              id: `annot-${Date.now()}`,
              type: 'text',
              text,
              color,
              fontSize: 14,
              x: pendingInput.normX,
              y: pendingInput.normY,
              startMs: playheadMs,
              durationMs: 4000,
            }});
            setPendingInput(null);
          }}
          onCancel={() => setPendingInput(null)}
        />
      )}
    </svg>
  );
}
