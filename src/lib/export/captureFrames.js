/**
 * captureFrames
 *
 * Records the live preview by hooking into the animator's afterStepRef.
 *
 * Per step:
 *   1. Wait 1 rAF for React to paint (flushSync in recording mode means
 *      state is already committed — 1 rAF is sufficient)
 *   2. Pause + seek all CSS animations to a deterministic point before screenshot
 *   3. Capture content frame via html2canvas → immediately serialize to Blob URL
 *   4. If not last step: animate through the ProcessingIndicator pulse cycle,
 *      capturing one frame every INDICATOR_FRAME_MS ms of animation time,
 *      up to MAX_INDICATOR_FRAMES total (loops the 1400ms pulse cycle)
 *   5. Resume animations, signal animator to advance
 *
 * Frame serialization:
 *   Each canvas is immediately converted to a Blob URL and the canvas released.
 *   This keeps peak JS heap flat regardless of session length, preventing the
 *   GC stalls that occur when accumulating 1000+ large canvas objects.
 *
 * Animated indicator:
 *   The ProcessingIndicator has a 1.4s CSS pulse animation on 3 dots with
 *   delays 0s/0.2s/0.4s. We capture indicator frames by seeking through the
 *   animation timeline at INDICATOR_FRAME_MS intervals, producing ~8fps motion
 *   that looks like the dots are actually pulsing in the video.
 *
 * Returns: { frames: string[] (Blob URLs), steps: Array, revokeAll: () => void }
 */

import html2canvas from 'html2canvas';

const SKIP_KINDS = new Set(['session-header', 'local-command-output', 'queue-op']);

// ProcessingIndicator pulse animation: 1400ms cycle, 3 dots at 0/200/400ms delays.
// We sample the cycle at this interval to produce smooth-looking motion.
const INDICATOR_FRAME_MS = 125;     // 8fps through the animation cycle
const INDICATOR_CYCLE_MS = 1400;    // matches CSS animation-duration
// Max indicator frames per step regardless of how long the gap is.
// At 8fps this is ~4 seconds of animation — long gaps just loop.
const MAX_INDICATOR_FRAMES = 32;
// Minimum indicator frames for very short gaps (always show at least 1 pulse)
const MIN_INDICATOR_FRAMES = 3;
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

// Serialise a canvas to a Blob URL immediately, releasing the canvas pixel buffer.
function canvasToBlobUrl(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

// Compute how many indicator frames to generate for a given inter-step gap.
// stepDurationMs is the video hold time for this step (matching encodeVideo timing).
function indicatorFrameCount(stepDurationMs) {
  if (stepDurationMs <= 0) return MIN_INDICATOR_FRAMES;
  const natural = Math.ceil(stepDurationMs / INDICATOR_FRAME_MS);
  return Math.min(Math.max(natural, MIN_INDICATOR_FRAMES), MAX_INDICATOR_FRAMES);
}

// Mirror of encodeVideo's computeHoldSec — computes inter-step gap in ms.
function computeStepDurationMs(steps, index, timing) {
  const { mode, animationDuration, playbackSpeed, compressionFactor } = timing;
  const fixedMs = animationDuration / Math.max(playbackSpeed, 0.01);

  if (mode === 'fixed') return fixedMs;

  const cur  = steps[index]?.timestamp;
  const next = steps[index + 1]?.timestamp;
  if (!cur || !next) return fixedMs;

  const deltaMs = new Date(next) - new Date(cur);
  if (deltaMs <= 0) return fixedMs;

  if (mode === 'realtime')   return deltaMs / Math.max(playbackSpeed, 0.01);
  if (mode === 'compressed') return deltaMs / Math.max(compressionFactor, 0.01);
  return fixedMs;
}

export function captureFrames({ previewEl, animatorRef, steps, timing, onProgress }) {
  return new Promise((resolve, reject) => {
    const exportStart = performance.now();
    const log = (msg) => console.log(`[capture +${(performance.now() - exportStart).toFixed(0)}ms] ${msg}`);

    const animator = animatorRef;
    const totalSteps = animator.totalSteps;
    const captureSteps = steps.filter(s => s && !SKIP_KINDS.has(s.kind));

    log(`start: ${totalSteps} total steps, ${captureSteps.length} visual steps, ${steps.length} clipped steps`);
    log(`preview element: ${previewEl.offsetWidth}x${previewEl.offsetHeight}, dpr=${window.devicePixelRatio}`);
    log(`timing: mode=${timing?.mode} speed=${timing?.playbackSpeed} compression=${timing?.compressionFactor}`);

    if (captureSteps.length === 0) {
      log('no visual steps — resolving empty');
      resolve({ frames: [], steps: [], revokeAll: () => {} });
      return;
    }

    const blobUrls = [];      // string[] — Blob URLs, one per frame
    const capturedSteps = [];
    const frameDurations = []; // number[] — seconds each frame should be held in the video
    const dpr = window.devicePixelRatio || 1;
    const w = previewEl.offsetWidth;
    const h = previewEl.offsetHeight;

    // Estimate total frames for progress reporting.
    // Indicator frame count varies per step, so this is approximate.
    const avgIndicatorFrames = Math.round((MIN_INDICATOR_FRAMES + MAX_INDICATOR_FRAMES) / 2);
    const totalExpected = captureSteps.length * (1 + avgIndicatorFrames);

    log(`estimated ~${totalExpected} frames (${captureSteps.length} content + ~${avgIndicatorFrames} indicator avg per step)`);

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
        // ── Content frame: animations at rest position ──────────────────────
        pauseAnimations(previewEl);
        seekAnimations(previewEl, CONTENT_SEEK_MS);

        const h2cStart = performance.now();
        const contentCanvas = await captureEl(previewEl, dpr, w, h);
        const h2cMs = (performance.now() - h2cStart).toFixed(0);

        // Immediately serialise → Blob URL, release canvas pixel buffer.
        const contentUrl = await canvasToBlobUrl(contentCanvas);
        resumeAnimations(previewEl);

        // Content frame holds for the full inter-step duration.
        // Encoder uses this directly — no need to re-derive from timestamps.
        const stepDurationMs = timing
          ? computeStepDurationMs(steps, stepIndex, timing)
          : 700;
        const contentHoldSec = Math.min(Math.max(stepDurationMs / 1000, 0.05), 60);

        blobUrls.push(contentUrl);
        capturedSteps.push(step);
        frameDurations.push(contentHoldSec);
        onProgress?.(blobUrls.length / totalExpected, {
          kind: step.kind, h2cMs: +h2cMs, rafMs: +rafMs, isIndicator: false,
        });

        log(`step ${stepIndex} (${step.kind}): rAF=${rafMs}ms html2canvas=${h2cMs}ms hold=${contentHoldSec.toFixed(3)}s [frame ${blobUrls.length}/${totalExpected}]`);

        // ── Indicator frames: animate through the pulse cycle ───────────────
        if (!isLast) {
          const nFrames = indicatorFrameCount(stepDurationMs);
          const indicatorHoldSec = INDICATOR_FRAME_MS / 1000;
          const indicatorStart = performance.now();

          pauseAnimations(previewEl);

          for (let i = 0; i < nFrames; i++) {
            // Loop through the 1400ms CSS animation cycle at INDICATOR_FRAME_MS steps
            const seekMs = (i * INDICATOR_FRAME_MS) % INDICATOR_CYCLE_MS;
            seekAnimations(previewEl, seekMs);

            const ic = await captureEl(previewEl, dpr, w, h);
            const iUrl = await canvasToBlobUrl(ic);

            blobUrls.push(iUrl);
            capturedSteps.push(step);
            frameDurations.push(indicatorHoldSec);
            onProgress?.(blobUrls.length / totalExpected, {
              kind: step.kind, h2cMs: 0, rafMs: 0, isIndicator: true,
            });
          }

          resumeAnimations(previewEl);
          const indicatorMs = (performance.now() - indicatorStart).toFixed(0);
          log(`step ${stepIndex} indicator: ${nFrames} frames @ ${INDICATOR_FRAME_MS}ms each (${stepDurationMs.toFixed(0)}ms gap) in ${indicatorMs}ms [frames to ${blobUrls.length}/${totalExpected}]`);
        }
      } else {
        log(`step ${stepIndex} (${step?.kind ?? 'unknown'}) SKIPPED (non-visual), rAF=${rafMs}ms`);
      }

      const stepMs = (performance.now() - stepStart).toFixed(0);
      log(`step ${stepIndex} total: ${stepMs}ms`);

      if (isLast) {
        const totalMs = (performance.now() - exportStart).toFixed(0);
        log(`DONE: ${blobUrls.length} frames captured in ${totalMs}ms (${captureSteps.length} steps, avg ${(parseFloat(totalMs) / captureSteps.length).toFixed(0)}ms/step)`);
        animator.afterStepRef.current = null;
        animator.pause();
        resolve({
          frames: blobUrls,
          steps: capturedSteps,
          durations: frameDurations,
          revokeAll: () => blobUrls.forEach(u => URL.revokeObjectURL(u)),
        });
      }
    };

    log('starting animator reset + play');
    animator.reset();
    animator.setIsPlaying(true);
  });
}
