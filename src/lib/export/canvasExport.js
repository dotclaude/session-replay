import { buildFramePlan } from './buildFramePlan.js';
import { renderHistoryToCanvas, makeCanvas } from './renderFrameToCanvas.js';

// Firefox's H.264 WebCodecs encoder emits uninitialized YUV for the first frame.
// VP9 (WebM) doesn't have this bug. Detect Firefox and reroute mp4 → webm.
const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');

export async function exportViaCanvas({ steps, clips, timing, renderMode, format, width, onProgress }) {
  const t0 = performance.now();
  const log = (msg) => console.log(`[canvas-export +${(performance.now() - t0).toFixed(0)}ms] ${msg}`);
  const effectiveFormat = (format === 'mp4' && isFirefox) ? 'webm' : format;

  log('building frame plan...');
  const plan = clips.flatMap(c => buildFramePlan(steps, c.in, c.out, timing, renderMode ?? 'scroll'));
  const contentCount = plan.filter(f => f.frameType !== 'indicator').length;
  const indicatorCount = plan.filter(f => f.frameType === 'indicator').length;
  log(`plan: ${plan.length} frames (${contentCount} content/reveal + ${indicatorCount} indicator)`);
  onProgress?.({ stage: 'planning', framesDone: 0, framesTotal: plan.length });

  const W = width ?? 900;
  // Height must be even for H.264/VP9 chroma subsampling
  const H = Math.round(W * 600 / 900 / 2) * 2;
  // Use a regular HTMLCanvasElement. OffscreenCanvas has async compositing in
  // Firefox — VideoFrame would snapshot before 2D draws are committed.
  const canvas = makeCanvas(W, H);

  log(`setting up ${effectiveFormat} encoder at ${W}x${H}${effectiveFormat !== format ? ` (Firefox: mp4→webm)` : ''}...`);
  const { muxer, encoder } = await setupEncoder(W, H, effectiveFormat);
  log('encoder ready');

  log(`rendering ${plan.length} frames...`);
  const renderStart = performance.now();

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let timestampUs = 0;

  for (let i = 0; i < plan.length; i++) {
    const f = plan[i];
    renderHistoryToCanvas(canvas, f.history, f.processingMsg, f.revealFraction, f.renderMode, f.animT);

    // Read pixels back synchronously to force the 2D context to flush all
    // pending draw calls before we snapshot. Both Chrome and Firefox commit
    // draws synchronously when getImageData is called.
    const imageData = ctx.getImageData(0, 0, W, H);

    const durationUs = Math.round(f.durationSec * 1_000_000);
    // Construct VideoFrame from ImageData (raw pixels) instead of canvas —
    // this bypasses the browser compositing pipeline entirely and guarantees
    // the frame contains exactly what was drawn.
    const vf = new VideoFrame(imageData.data, {
      format: 'RGBA',
      codedWidth: W,
      codedHeight: H,
      timestamp: timestampUs,
      duration: durationUs,
    });
    encoder.encode(vf, { keyFrame: true });
    vf.close();
    timestampUs += durationUs;

    // Drain encoder queue — VP9 is slow and will stall if we don't wait
    while (encoder.encodeQueueSize > 3) {
      await yieldToMain();
    }
    await yieldToMain();

    onProgress?.({ stage: 'rendering', framesDone: i + 1, framesTotal: plan.length, frameType: f.frameType });
  }

  log(`rendered in ${(performance.now() - renderStart).toFixed(0)}ms`);

  log('flushing encoder...');
  onProgress?.({ stage: 'flushing', framesDone: plan.length, framesTotal: plan.length });
  await encoder.flush();
  muxer.finalize();

  const { buffer } = muxer.target;
  log(`done: ${buffer.byteLength} bytes (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB) in ${(performance.now() - t0).toFixed(0)}ms total`);

  onProgress?.({ stage: 'done', framesTotal: plan.length });

  const mime = effectiveFormat === 'webm' ? 'video/webm' : 'video/mp4';
  return { blob: new Blob([buffer], { type: mime }), format: effectiveFormat };
}

async function setupEncoder(W, H, format) {
  if (format === 'webm') {
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: 'V_VP9', width: W, height: H } });
    const encoder = await makeEncoder((chunk, meta) => muxer.addVideoChunk(chunk, meta));
    await configureEncoder(encoder, { codec: 'vp09.00.10.08', width: W, height: H, bitrate: 8_000_000, bitrateMode: 'constant' });
    return { muxer, encoder };
  } else {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
    const encoder = await makeEncoder((chunk, meta) => muxer.addVideoChunk(chunk, meta));
    // avc1.4200XX — Constrained Baseline, level XX. Try increasing levels until one is supported.
    // Level 31=H.264 3.1 (up to 1280x720), 32=H.264 3.2, 40=H.264 4.0 (up to 1920x1080)
    const avcLevels = ['avc1.42003f', 'avc1.420032', 'avc1.420031'];
    let avcCodec = null;
    for (const c of avcLevels) {
      const s = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H });
      if (s.supported) { avcCodec = c; break; }
    }
    if (!avcCodec) throw new Error(`No supported H.264 codec found for ${W}x${H}`);
    await configureEncoder(encoder, {
      codec: avcCodec,
      width: W, height: H,
      bitrate: 8_000_000,
      bitrateMode: 'constant',
    });
    return { muxer, encoder };
  }
}

function makeEncoder(outputCallback) {
  return new Promise((resolve, reject) => {
    const encoder = new VideoEncoder({
      output: outputCallback,
      error: (e) => reject(new Error(`VideoEncoder error: ${e.message ?? e}`)),
    });
    resolve(encoder);
  });
}

async function configureEncoder(encoder, config) {
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) {
    throw new Error(`VideoEncoder config not supported: codec=${config.codec}`);
  }
  encoder.configure(config);
  // Yield once so the encoder state machine transitions to 'configured'
  await new Promise(r => setTimeout(r, 0));
  if (encoder.state !== 'configured') {
    throw new Error(`VideoEncoder failed to configure (state=${encoder.state})`);
  }
}

function yieldToMain() {
  return new Promise(r => setTimeout(r, 0));
}
