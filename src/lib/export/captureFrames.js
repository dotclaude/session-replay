/**
 * captureFrames
 *
 * Records the live preview by hooking into the animator's afterStepRef.
 *
 * For each step the animator executes, we:
 *   1. Wait for React to commit + paint (3 rAFs to be safe)
 *   2. Capture the current DOM state as a frame (step is shown, indicator hidden)
 *   3. If there is a next step: wait one more rAF for the ProcessingIndicator
 *      to appear (it renders while isPlaying=true and we haven't advanced yet),
 *      then capture a second "indicator frame"
 *   4. Signal the animator to advance
 *
 * This produces a video where every step has both a "content" frame and a
 * brief "Claude is thinking..." transition frame, matching the live preview.
 *
 * Returns: { frames: HTMLCanvasElement[], steps: Array }
 *   steps[i] is the step whose CONTENT this frame shows (used for duration)
 */

import html2canvas from 'html2canvas';

const SKIP_KINDS = new Set(['session-header', 'local-command-output', 'queue-op']);

// How many extra identical frames to hold the ProcessingIndicator for.
// At realtime speeds this keeps the indicator visible long enough to be seen.
const INDICATOR_HOLD_FRAMES = 2;

async function captureEl(previewEl, dpr, w, h) {
  const raw = await html2canvas(previewEl, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#0d1117',
    scale: 1 / dpr,
    width: w,
    height: h,
    logging: false,
  });
  if (raw.width === w && raw.height === h) return raw;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(raw, 0, 0, w, h);
  return c;
}

function rAFs(n) {
  return new Promise(resolve => {
    let count = 0;
    function tick() { if (++count >= n) resolve(); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  });
}

export function captureFrames({ previewEl, animatorRef, steps, onProgress }) {
  return new Promise((resolve, reject) => {
    const animator = animatorRef;
    const totalSteps = animator.totalSteps;
    const captureSteps = steps.filter(s => s && !SKIP_KINDS.has(s.kind));

    if (captureSteps.length === 0) { resolve({ frames: [], steps: [] }); return; }

    const frames = [];
    const capturedSteps = [];
    const dpr = window.devicePixelRatio || 1;
    const w = previewEl.offsetWidth;
    const h = previewEl.offsetHeight;
    let totalExpected = captureSteps.length * (1 + INDICATOR_HOLD_FRAMES);

    animator.afterStepRef.current = async (stepIndex) => {
      const step = steps[stepIndex];
      const isLast = stepIndex >= totalSteps - 1;
      const isVisual = step && !SKIP_KINDS.has(step.kind);

      // 3 rAFs: React commit, layout, paint
      await rAFs(3);

      if (isVisual) {
        // Frame 1: the step content itself
        const contentFrame = await captureEl(previewEl, dpr, w, h);
        frames.push(contentFrame);
        capturedSteps.push(step);
        onProgress?.(frames.length / totalExpected);

        // Frames 2..N: ProcessingIndicator transition (only if there is a next step)
        if (!isLast) {
          // The indicator is already rendered at this point since isPlaying=true
          // and currentEvent === last history item. Give it one more rAF to paint.
          await rAFs(1);
          const indicatorFrame = await captureEl(previewEl, dpr, w, h);
          for (let i = 0; i < INDICATOR_HOLD_FRAMES; i++) {
            frames.push(indicatorFrame);
            capturedSteps.push(step); // same step — same duration attribution
            onProgress?.(frames.length / totalExpected);
          }
        }
      }

      if (isLast) {
        animator.afterStepRef.current = null;
        animator.pause();
        resolve({ frames, steps: capturedSteps });
      }
    };

    animator.reset();
    animator.setIsPlaying(true);
  });
}
