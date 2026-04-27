import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';

/**
 * useTimedAnimator
 *
 * Drop-in replacement for useStepAnimator that supports per-step timing.
 * Returns the same interface plus: mode, setMode, compressionFactor,
 * setCompressionFactor, elapsedMs.
 *
 * mode:
 *   'fixed'      — constant animationDuration per step (default)
 *   'realtime'   — each step waits exactly as long as the real session did
 *   'compressed' — real timing divided by compressionFactor
 */

function computeStepDuration(steps, index, mode, factor, fixedDuration, speed) {
  if (mode === 'fixed') return fixedDuration;
  const cur = steps[index]?.timestamp;
  const next = steps[index + 1]?.timestamp;
  if (!cur || !next) return fixedDuration;
  const delta = new Date(next) - new Date(cur);
  const clamped = Math.min(Math.max(delta, 50), 30_000);
  if (mode === 'realtime') return clamped / (speed || 1);
  return clamped / factor;
}

export function useTimedAnimator({
  steps,
  executeStep,
  resetState,
  initialDuration = 600,
  initialSpeed = 1,
  initialMode = 'realtime',
  initialCompressionFactor = 25,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSpeed);
  const [animationDuration, setAnimationDuration] = useState(initialDuration);
  const [mode, setMode] = useState(initialMode); // 'fixed' | 'realtime' | 'compressed'
  const [compressionFactor, setCompressionFactor] = useState(initialCompressionFactor);

  const executeStepRef = useRef(executeStep);
  const resetStateRef = useRef(resetState);
  useEffect(() => { executeStepRef.current = executeStep; }, [executeStep]);
  useEffect(() => { resetStateRef.current = resetState; }, [resetState]);

  // When set, called after each step executes during recording mode.
  // The callback receives the step index and returns a Promise.
  // The animator waits for the promise to resolve before advancing.
  const afterStepRef = useRef(null);

  // Precompute cumulative elapsed ms from timestamps
  const cumulativeMs = useMemo(() => {
    const arr = [0];
    for (let i = 1; i < steps.current.length; i++) {
      const prev = steps.current[i - 1]?.timestamp;
      const cur = steps.current[i]?.timestamp;
      const delta = (prev && cur) ? Math.max(new Date(cur) - new Date(prev), 0) : 0;
      arr.push(arr[arr.length - 1] + delta);
    }
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.current.length]);

  useEffect(() => {
    if (!isPlaying) return;

    const isLastStep = currentStep >= steps.current.length - 1;
    const recordingCb = afterStepRef.current;

    if (recordingCb) {
      // Recording mode: call the hook for every step including the last one.
      // captureFrames.js is responsible for calling animator.pause() when done.
      const handle = setTimeout(() => {
        console.log(`[animator] recording step ${currentStep}/${steps.current.length - 1} kind=${steps.current[currentStep]?.kind} t=${performance.now().toFixed(0)}ms`);
        recordingCb(currentStep).then(() => {
          if (!isLastStep) {
            setCurrentStep(prev => {
              const next = prev + 1;
              executeStepRef.current(steps.current[next]);
              return next;
            });
          }
          // If isLastStep, captureFrames's hook sets afterStepRef.current=null and
          // calls animator.pause() — isPlaying becomes false and the effect stops.
        });
      }, 0);
      return () => clearTimeout(handle);
    }

    // Normal playback mode.
    if (isLastStep) {
      setIsPlaying(false);
      return;
    }

    const delay = computeStepDuration(
      steps.current, currentStep, mode, compressionFactor, animationDuration / playbackSpeed, playbackSpeed
    );

    const timer = setTimeout(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        executeStepRef.current(steps.current[next]);
        return next;
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, playbackSpeed, animationDuration, mode, compressionFactor, steps]);

  const play  = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    flushSync(() => {
      resetStateRef.current?.();
      executeStepRef.current(steps.current[0]);
      setCurrentStep(0);
    });
  }, [steps]);

  const scrubTo = useCallback((index) => {
    setIsPlaying(false);
    // flushSync forces reset + repopulation to commit in a single DOM update,
    // preventing the empty-history frame that causes flicker.
    flushSync(() => {
      resetStateRef.current?.();
      for (let i = 0; i <= index; i++) executeStepRef.current(steps.current[i]);
      setCurrentStep(index);
    });
  }, [steps]);

  return {
    currentStep,
    totalSteps: steps.current.length,
    isPlaying,
    playbackSpeed,
    animationDuration,
    currentDescription: steps.current[currentStep]?.description ?? '',
    play, pause, reset, scrubTo,
    setPlaybackSpeed,
    setAnimationDuration,
    mode, setMode,
    compressionFactor, setCompressionFactor,
    elapsedMs: cumulativeMs[currentStep] ?? 0,
    afterStepRef,  // set to async fn(stepIndex) => void to enable recording mode
    setIsPlaying,  // allow external callers to trigger play without going through play()
  };
}
