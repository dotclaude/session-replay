import React from 'react';
import IntegratedTimeline from './IntegratedTimeline.jsx';

const StepBackIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <rect x="1" y="1.5" width="2" height="9" rx="1" fill="currentColor"/>
    <path d="M10.5 2L4.5 6l6 4V2z" fill="currentColor"/>
  </svg>
);

const StepForwardIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <rect x="9" y="1.5" width="2" height="9" rx="1" fill="currentColor"/>
    <path d="M1.5 2l6 4-6 4V2z" fill="currentColor"/>
  </svg>
);

export const AnimatorControls = React.forwardRef(({
  currentStep, totalSteps, isPlaying,
  playbackSpeed, animationDuration, currentDescription,
  play, pause, reset, scrubTo, setPlaybackSpeed, setAnimationDuration,
  showSpeedControl = true,
  showDurationControl = false,
  showStepIndicator = true,
  className,
  steps = [],
  activeKinds,
  clipIn,
  clipOut,
}, playButtonRef) => {
  const atEnd = currentStep >= totalSteps - 1;
  const atStart = currentStep <= 0;

  const stepBack = () => scrubTo(Math.max(0, currentStep - 1));
  const stepForward = () => scrubTo(Math.min(totalSteps - 1, currentStep + 1));

  return (
    <div className={className} data-animator-controls>
      {/* Play/Pause/Reset buttons */}
      <div data-animator-buttons>
        <button data-animator-reset onClick={reset} title="Reset to start">Reset</button>
        <button
          data-animator-step-back
          onClick={stepBack}
          disabled={atStart}
          title="Step back (←)"
          aria-label="Step back one step"
        >
          <StepBackIcon />
        </button>
        {isPlaying
          ? <button data-animator-pause onClick={pause}>Pause</button>
          : <button ref={playButtonRef} data-animator-play onClick={play} disabled={atEnd}>Play</button>
        }
        <button
          data-animator-step-forward
          onClick={stepForward}
          disabled={atEnd}
          title="Step forward (→)"
          aria-label="Step forward one step"
        >
          <StepForwardIcon />
        </button>
      </div>

      {/* Integrated timeline (minimap + scrubber) */}
      <IntegratedTimeline
        steps={steps}
        currentStep={currentStep}
        totalSteps={totalSteps}
        onScrub={scrubTo}
        activeKinds={activeKinds}
        clipIn={clipIn}
        clipOut={clipOut}
        currentDescription={showStepIndicator ? currentDescription : null}
      />

      {/* Speed control */}
      {showSpeedControl && (
        <div data-animator-speed>
          <label>Speed</label>
          <input type="range" min={0.5} max={4} step={0.5} value={playbackSpeed}
            onChange={e => setPlaybackSpeed(parseFloat(e.target.value))} />
          <span>{playbackSpeed}×</span>
        </div>
      )}

      {/* Duration control */}
      {showDurationControl && (
        <div data-animator-duration>
          <label>Step</label>
          <input type="range" min={100} max={2000} step={100} value={animationDuration}
            onChange={e => setAnimationDuration(parseInt(e.target.value, 10))} />
          <span>{animationDuration}ms</span>
        </div>
      )}
    </div>
  );
});

AnimatorControls.displayName = 'AnimatorControls';
