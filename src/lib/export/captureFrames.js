/**
 * captureFrames
 *
 * Renders each frame directly to a canvas via the 2D API — no DOM capture,
 * no html2canvas. ~2ms per frame instead of ~500ms.
 *
 * Returns: { frames: HTMLCanvasElement[] }
 */

import { buildFramePlan } from './buildFramePlan.js';
import { renderFrameToCanvas, makeCanvas } from './renderFrameToCanvas.js';

export async function captureFrames({ steps, clipIn, clipOut, onProgress }) {
  const plan = buildFramePlan(steps, clipIn, clipOut);
  const frames = [];

  for (let f = 0; f < plan.length; f++) {
    const { stepIndex, textRevealFraction } = plan[f];
    const step = steps[stepIndex];
    if (!step) continue;

    const canvas = makeCanvas(900, 600);
    renderFrameToCanvas(canvas, step, textRevealFraction);
    frames.push(canvas);

    onProgress?.((f + 1) / plan.length);

    // Yield to the event loop every 20 frames so the progress bar updates
    if (f % 20 === 19) await new Promise(r => setTimeout(r, 0));
  }

  return { frames };
}
