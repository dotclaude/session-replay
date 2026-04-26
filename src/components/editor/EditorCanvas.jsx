import React from 'react';
import StageRenderer from '../stages/StageRenderer.jsx';
import AnnotationLayer from './AnnotationLayer.jsx';

export default function EditorCanvas({ step, annotations, playheadMs, activeTool, activeColor, selectedAnnotationId, dispatch }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-0)',
      position: 'relative',
    }}>
      {step ? (
        <div style={{ padding: '16px', minHeight: '100%' }}>
          <StageRenderer key={step.index} step={step} isCurrent={true} isSearchMatch={false} />
        </div>
      ) : (
        <div style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
        }}>
          Loading session…
        </div>
      )}
      <AnnotationLayer
        annotations={annotations || []}
        playheadMs={playheadMs || 0}
        activeTool={activeTool}
        activeColor={activeColor}
        selectedAnnotationId={selectedAnnotationId}
        dispatch={dispatch}
      />
    </div>
  );
}
