import React from 'react';

export default function EditorShell({ header, canvas, props: propsPanel, timeline }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr var(--props-width, 280px)',
      gridTemplateRows: '44px 1fr var(--timeline-height, 180px)',
      gridTemplateAreas: '"header header header" "canvas canvas props" "timeline timeline props"',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-0)',
    }}>
      <div style={{ gridArea: 'header', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
        {header}
      </div>
      <div style={{ gridArea: 'canvas', overflow: 'hidden', background: '#0a0c0f' }}>
        {canvas}
      </div>
      <div style={{ gridArea: 'props', borderLeft: '1px solid var(--border)', background: 'var(--bg-1)', overflowY: 'auto' }}>
        {propsPanel}
      </div>
      <div style={{ gridArea: 'timeline', borderTop: '1px solid var(--border)', background: 'var(--bg-1)', overflow: 'hidden' }}>
        {timeline}
      </div>
    </div>
  );
}
