import { useState, useEffect, useRef, useCallback } from 'react';

export function useStepAnimator({
  steps,
  executeStep,
  resetState,
  initialDuration = 600,
  initialSpeed = 1,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSpeed);
  const [animationDuration, setAnimationDuration] = useState(initialDuration);

  const executeStepRef = useRef(executeStep);
  const resetStateRef = useRef(resetState);
  useEffect(() => { executeStepRef.current = executeStep; }, [executeStep]);
  useEffect(() => { resetStateRef.current = resetState; }, [resetState]);

  useEffect(() => {
    if (!isPlaying) return;
    if (currentStep >= steps.current.length - 1) { setIsPlaying(false); return; }

    const timer = setTimeout(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        executeStepRef.current(steps.current[next]);
        return next;
      });
    }, animationDuration / playbackSpeed);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, playbackSpeed, animationDuration, steps]);

  const play  = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(0);
    resetStateRef.current?.();
    executeStepRef.current(steps.current[0]);
  }, [steps]);

  const scrubTo = useCallback((index) => {
    setIsPlaying(false);
    resetStateRef.current?.();
    for (let i = 0; i <= index; i++) executeStepRef.current(steps.current[i]);
    setCurrentStep(index);
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
  };
}
