/**
 * captureFrames
 *
 * Records the live preview by hooking into the animator's afterStepRef.
 *
 * Per step:
 *   1. Wait 1 rAF for React to paint (flushSync in recording mode means
 *      state is already committed — 1 rAF is sufficient)
 *   2. Pause + seek all CSS animations to a deterministic point before screenshot
 *   3. Capture content frame via html2canvas
 *   4. If not last step: seek animations to indicator peak, capture indicator frame
 *   5. Resume animations, signal animator to advance
 *
 * Using the Web Animations API to pause/seek gives deterministic CSS animation
 * frames without waiting for animation cycles to complete.
 *
 * Returns: { frames: HTMLCanvasElement[], steps: Array }
 */

import html2canvas from 'html2canvas';

const SKIP_KINDS = new Set(['session-header', 'local-command-output', 'queue-op']);
const INDICATOR_HOLD_FRAMES = 2;

// Seek time for ProcessingIndicator dots during indicator frames:
// 0.42s = all 3 dots near peak of their staggered pulse (0s, 0.2s, 0.4s delays)
const INDICATOR_SEEK_MS = 420;
// Seek time for content frames: 0ms = animations at rest / start state
const CONTENT_SEEK_MS = 0;

function pauseAnimations(el) {
  try {
    el.getAnimations({ subtree: true }).forEach(a => a.pause());
  } catch {}
}

function seekAnimations(el, timeMs) {
  try {
    el.getAnimations({ subtree: true }).forEach(a => { a.currentTime = timeMs; });
  } catch {}
}

function resumeAnimations(el) {
  try {
    el.getAnimations({ subtree: true }).forEach(a => a.play());
  } catch {}
}

function rAF() {
  return new Promise(r => requestAnimationFrame(r));
}

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

export function captureFrames({ previewEl, animatorRef, steps, onProgress }) {
  return new Promise((resolve, reject) => {
    const exportStart = performance.now();
    const log = (msg) => console.log(`[capture +${(performance.now() - exportStart).toFixed(0)}ms] ${msg}`);

    const animator = animatorRef;
    const totalSteps = animator.totalSteps;
    const captureSteps = steps.filter(s => s && !SKIP_KINDS.has(s.kind));

    log(`start: ${totalSteps} total steps, ${captureSteps.length} visual steps, ${steps.length} clipped steps`);
    log(`preview element: ${previewEl.offsetWidth}x${previewEl.offsetHeight}, dpr=${window.devicePixelRatio}`);

    if (captureSteps.length === 0) {
      log('no visual steps — resolving empty');
      resolve({ frames: [], steps: [] });
      return;
    }

    const frames = [];
    const capturedSteps = [];
    const dpr = window.devicePixelRatio || 1;
    const w = previewEl.offsetWidth;
    const h = previewEl.offsetHeight;
    const totalExpected = captureSteps.length * (1 + INDICATOR_HOLD_FRAMES);

    log(`expecting ~${totalExpected} frames (${captureSteps.length} content + ${captureSteps.length * INDICATOR_HOLD_FRAMES} indicator hold)`);

    animator.afterStepRef.current = async (stepIndex) => {
      const stepStart = performance.now();
      const step = steps[stepIndex];
      const isLast = stepIndex >= totalSteps - 1;
      const isVisual = step && !SKIP_KINDS.has(step.kind);

      // 1 rAF: React has already committed synchronously via flushSync in recording mode.
      // One rAF ensures the browser has painted before we screenshot.
      const rafStart = performance.now();
      await rAF();
      const rafMs = (performance.now() - rafStart).toFixed(0);

      if (isVisual) {
        // Content frame: animations at rest position
        pauseAnimations(previewEl);
        seekAnimations(previewEl, CONTENT_SEEK_MS);

        const h2cStart = performance.now();
        const contentFrame = await captureEl(previewEl, dpr, w, h);
        const h2cMs = (performance.now() - h2cStart).toFixed(0);

        resumeAnimations(previewEl);
        frames.push(contentFrame);
        capturedSteps.push(step);
        onProgress?.(frames.length / totalExpected, { kind: step.kind, h2cMs: +h2cMs, rafMs: +rafMs, isIndicator: false });

        log(`step ${stepIndex} (${step.kind}): rAF=${rafMs}ms html2canvas=${h2cMs}ms [frame ${frames.length}/${totalExpected}]`);

        // Indicator frames: seek animations to peak pulse state
        if (!isLast) {
          pauseAnimations(previewEl);
          seekAnimations(previewEl, INDICATOR_SEEK_MS);

          const ih2cStart = performance.now();
          const indicatorFrame = await captureEl(previewEl, dpr, w, h);
          const ih2cMs = (performance.now() - ih2cStart).toFixed(0);

          resumeAnimations(previewEl);

          for (let i = 0; i < INDICATOR_HOLD_FRAMES; i++) {
            frames.push(indicatorFrame);
            capturedSteps.push(step);
            onProgress?.(frames.length / totalExpected, { kind: step.kind, h2cMs: +ih2cMs, rafMs: 0, isIndicator: true });
          }

          log(`step ${stepIndex} indicator: html2canvas=${ih2cMs}ms [frames ${frames.length - INDICATOR_HOLD_FRAMES + 1}-${frames.length}/${totalExpected}]`);
        }
      } else {
        log(`step ${stepIndex} (${step?.kind ?? 'unknown'}) SKIPPED (non-visual), rAF=${rafMs}ms`);
      }

      const stepMs = (performance.now() - stepStart).toFixed(0);
      log(`step ${stepIndex} total: ${stepMs}ms`);

      if (isLast) {
        const totalMs = (performance.now() - exportStart).toFixed(0);
        log(`DONE: ${frames.length} frames captured in ${totalMs}ms (${captureSteps.length} steps, avg ${(parseFloat(totalMs) / captureSteps.length).toFixed(0)}ms/step)`);
        animator.afterStepRef.current = null;
        animator.pause();
        resolve({ frames, steps: capturedSteps });
      }
    };

    log('starting animator reset + play');
    animator.reset();
    animator.setIsPlaying(true);
  });
}
