/**
 * captureFrames
 *
 * Records the live preview by hooking into the animator's afterStepRef.
 * The animator plays at maximum speed — after each step, we capture the DOM
 * via html2canvas then let the animator advance to the next step.
 *
 * Returns: { frames: HTMLCanvasElement[], steps: Array }
 */

import html2canvas from 'html2canvas';

const SKIP_KINDS = new Set(['session-header', 'local-command-output', 'queue-op']);

export function captureFrames({ previewEl, animatorRef, steps, onProgress }) {
  return new Promise((resolve, reject) => {
    const animator = animatorRef;
    const totalSteps = animator.totalSteps; // total steps in clipped ref
    const captureSteps = steps.filter(s => s && !SKIP_KINDS.has(s.kind));

    if (captureSteps.length === 0) {
      resolve({ frames: [], steps: [] });
      return;
    }

    const frames = [];
    const capturedSteps = [];
    const dpr = window.devicePixelRatio || 1;
    const w = previewEl.offsetWidth;
    const h = previewEl.offsetHeight;

    let stepsProcessed = 0; // counts all steps seen (including skipped)

    animator.afterStepRef.current = async (stepIndex) => {
      stepsProcessed++;
      const step = steps[stepIndex];
      const isLast = stepIndex >= totalSteps - 1;

      // Wait two rAFs so React has committed and the scroll position has updated.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      if (step && !SKIP_KINDS.has(step.kind)) {
        const raw = await html2canvas(previewEl, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#0d1117',
          scale: 1 / dpr,
          width: w,
          height: h,
          logging: false,
        });

        let canvas = raw;
        if (raw.width !== w || raw.height !== h) {
          canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(raw, 0, 0, w, h);
        }

        frames.push(canvas);
        capturedSteps.push(step);
        onProgress?.(frames.length / captureSteps.length);
      }

      if (isLast) {
        animator.afterStepRef.current = null;
        animator.pause();
        resolve({ frames, steps: capturedSteps });
      }
    };

    // Reset to step 0 and start playing immediately.
    animator.reset();
    animator.setIsPlaying(true);
  });
}
