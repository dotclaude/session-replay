import React, { useRef, useState, useCallback } from 'react';
import { KIND_COLORS } from '../editor/kindColors.js';

export default function IntegratedTimeline({
  steps,
  currentStep,
  totalSteps,
  onScrub,
  activeKinds,
  clipIn,
  clipOut,
  currentDescription,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const scrubToPosition = useCallback((clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    // Clamp to bounds
    const clampedX = Math.max(0, Math.min(x, rect.width));
    const index = Math.min(Math.floor((clampedX / rect.width) * totalSteps), totalSteps - 1);
    onScrub(Math.max(0, index));
  }, [totalSteps, onScrub]);

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    scrubToPosition(e.clientX);
  }, [scrubToPosition]);

  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const index = Math.min(Math.floor((x / rect.width) * totalSteps), totalSteps - 1);
    const step = steps[index];

    // Update tooltip (only when hovering, not dragging)
    if (!isDragging && step && x >= 0 && x <= rect.width) {
      setTooltip({ x: e.clientX - rect.left, text: `${index + 1}: ${step.description}` });
    }
  }, [totalSteps, steps, isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    // Scroll wheel delta varies by browser/OS, normalize it
    // Flip direction: scroll down (positive deltaY) = backward (negative delta)
    const delta = -Math.sign(e.deltaY);
    const newStep = Math.max(0, Math.min(currentStep + delta, totalSteps - 1));
    onScrub(newStep);

    // Show tooltip for the new step position
    if (svgRef.current && steps[newStep]) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = ((newStep + 0.5) / totalSteps) * rect.width;
      setTooltip({ x, text: `${newStep + 1}: ${steps[newStep].description}` });
    }
  }, [currentStep, totalSteps, onScrub, steps]);

  const handleKeyDown = useCallback((e) => {
    let newStep = currentStep;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newStep = Math.max(0, currentStep - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        newStep = Math.min(totalSteps - 1, currentStep + 1);
        break;
      case 'Home':
        e.preventDefault();
        newStep = 0;
        break;
      case 'End':
        e.preventDefault();
        newStep = totalSteps - 1;
        break;
      case 'PageUp':
        e.preventDefault();
        newStep = Math.max(0, currentStep - 10);
        break;
      case 'PageDown':
        e.preventDefault();
        newStep = Math.min(totalSteps - 1, currentStep + 10);
        break;
      default:
        return; // Don't handle other keys
    }

    onScrub(newStep);
  }, [currentStep, totalSteps, onScrub]);

  // Add global mouse move and mouse up listeners when dragging
  React.useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e) => {
        scrubToPosition(e.clientX);
      };
      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, scrubToPosition]);

  if (!totalSteps || !steps.length) return null;

  const clipInPct = clipIn != null ? (clipIn / totalSteps) * 100 : null;
  const clipOutPct = clipOut != null ? ((clipOut + 1) / totalSteps) * 100 : null;
  // Add 0.5 to center the playhead on the step, matching the SVG line position
  const playheadPct = ((currentStep + 0.5) / totalSteps) * 100;

  const currentStepDescription = steps[currentStep]?.description || '';

  return (
    <div ref={containerRef} data-integrated-timeline>
      {/* Timeline with colored steps */}
      <div
        data-timeline-track
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-label="Session replay timeline"
        aria-valuemin={0}
        aria-valuemax={totalSteps - 1}
        aria-valuenow={currentStep}
        aria-valuetext={`Step ${currentStep + 1} of ${totalSteps}: ${currentStepDescription}`}
      >
        <svg
          ref={svgRef}
          data-timeline-svg
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          preserveAspectRatio="none"
          viewBox={`0 0 ${totalSteps} 1`}
          aria-hidden="true"
        >
          {/* Step segments */}
          {steps.map((step, i) => (
            <rect
              key={i}
              x={i}
              y={0}
              width={1}
              height={1}
              fill={KIND_COLORS[step.kind] || '#484f58'}
              opacity={activeKinds && !activeKinds.has(step.kind) ? 0.2 : 1}
            />
          ))}

          {/* Turn boundary lines (at each human step) */}
          {steps.map((step, i) =>
            step.kind === 'human' ? (
              <line
                key={`turn-${i}`}
                x1={i}
                y1={0}
                x2={i}
                y2={1}
                stroke="#e6edf3"
                strokeWidth={0.15}
                opacity={0.3}
              />
            ) : null
          )}

          {/* Clip region overlay */}
          {clipInPct != null && clipOutPct != null && (
            <rect
              x={clipIn}
              y={0}
              width={clipOut - clipIn + 1}
              height={1}
              fill="#58a6ff"
              opacity={0.18}
            />
          )}

          {/* Current step indicator line */}
          <line
            x1={currentStep + 0.5}
            y1={0}
            x2={currentStep + 0.5}
            y2={1}
            stroke="white"
            strokeWidth={0.6}
            style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))' }}
          />
        </svg>

        {/* Playhead handle */}
        <div
          data-timeline-playhead
          style={{
            left: `${playheadPct}%`,
          }}
        />
      </div>

      {/* Step indicator text */}
      <div data-timeline-step-text>
        {currentStep + 1} / {totalSteps}{currentDescription ? ` — ${currentDescription}` : ''}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          data-timeline-tooltip
          style={{
            left: Math.min(tooltip.x, (containerRef.current?.clientWidth || 400) - 220),
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
