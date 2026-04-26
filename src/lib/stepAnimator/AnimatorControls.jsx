import React from 'react';
import IntegratedTimeline from './IntegratedTimeline.jsx';

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
  return (
    <div className={className} data-animator-controls>
      {/* Play/Pause/Reset buttons */}
      <div data-animator-buttons>
        <button data-animator-reset onClick={reset}>Reset</button>
        {isPlaying
          ? <button data-animator-pause onClick={pause}>Pause</button>
          : <button ref={playButtonRef} data-animator-play onClick={play} disabled={atEnd}>Play</button>
        }
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
