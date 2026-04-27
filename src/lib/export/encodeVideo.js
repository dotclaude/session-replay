/**
 * encodeVideo
 *
 * VFR (variable frame rate) encoding via precomputed PTS.
 *
 * All frames are fed to ffmpeg at a constant 1fps. A setpts filter then
 * remaps each frame's presentation timestamp to its precomputed value.
 * This means ffmpeg encodes exactly N keyframes regardless of how far apart
 * they are in time — a 30-second hold is one keyframe, not 30s × fps frames.
 *
 * Encode time is O(frame_count) not O(total_video_duration).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;

  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'Video export requires production mode. Run: yarn build && yarn preview\n\n' +
      'Reason: WASM ffmpeg needs SharedArrayBuffer, which requires COOP/COEP headers. ' +
      'These headers break Firefox HMR in dev mode, so they\'re disabled for development.'
    );
  }

  ffmpegInstance = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  return ffmpegInstance;
}

function evenInt(n) {
  const i = Math.ceil(Number(n));
  return i % 2 === 0 ? i : i + 1;
}

async function cleanVfs(ffmpeg, files) {
  for (const f of files) {
    try { await ffmpeg.deleteFile(f); } catch {}
  }
}

async function execWithProgress(ffmpeg, args, onProgress, frameCount) {
  let eventCount = 0;
  console.log('[encode] exec start', args.join(' '));
  const t0 = Date.now();

  const handler = ({ progress, time }) => {
    eventCount++;
    // With 1fps VFR input, progress is reliable — it's based on frames processed
    const ratio = Math.max(0, Math.min(progress ?? 0, 0.99));
    const encodedSec = (time ?? 0) / 1_000_000;
    console.log(`[encode] progress #${eventCount} ratio=${ratio.toFixed(3)} time=${encodedSec.toFixed(2)}s`);
    onProgress?.({ ratio, encodedSec });
  };

  ffmpeg.on('progress', handler);
  try {
    await ffmpeg.exec(args);
    console.log(`[encode] exec done in ${Date.now() - t0}ms (${eventCount} events)`);
  } catch (err) {
    console.error(`[encode] exec FAILED after ${Date.now() - t0}ms`, err);
    throw err;
  } finally {
    ffmpeg.off('progress', handler);
  }
  onProgress?.({ ratio: 1, encodedSec: null });
}

const CODEC_MIN_SEC = 0.05;
const MAX_HOLD_SEC  = 60;

/**
 * Mirror of useTimedAnimator.computeStepDuration — returns hold in seconds.
 */
function computeHoldSec(steps, index, timing) {
  const { mode, animationDuration, playbackSpeed, compressionFactor } = timing;
  const fixedSec = (animationDuration / Math.max(playbackSpeed, 0.01)) / 1000;

  if (mode === 'fixed') return fixedSec;

  const cur  = steps[index]?.timestamp;
  const next = steps[index + 1]?.timestamp;
  if (!cur || !next) return fixedSec;

  const deltaMs = new Date(next) - new Date(cur);
  if (deltaMs <= 0) return fixedSec;

  if (mode === 'realtime')   return deltaMs / Math.max(playbackSpeed,     0.01) / 1000;
  if (mode === 'compressed') return deltaMs / Math.max(compressionFactor, 0.01) / 1000;
  return fixedSec;
}

/**
 * Precompute cumulative PTS values for each frame.
 * Returns Float64Array of seconds — pts[i] is when frame i should be displayed.
 * This is pure JS and runs in <1ms regardless of video length.
 */
function computePTS(steps, timing) {
  const pts = new Float64Array(steps.length);
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    pts[i] = t;
    const hold = Math.min(Math.max(computeHoldSec(steps, i, timing), CODEC_MIN_SEC), MAX_HOLD_SEC);
    t += hold;
  }
  const totalSec = t;
  console.log(`[encode] PTS precomputed: ${steps.length} frames, totalSec=${totalSec.toFixed(3)}s`);
  console.log(`[encode] PTS sample: [${Array.from(pts.slice(0, 6)).map(v => v.toFixed(3)).join(', ')} ...]`);
  return { pts, totalSec };
}

/**
 * Build a setpts filter expression that maps each frame index N to its
 * precomputed PTS value (in timebase units of 1/1000 seconds).
 *
 * We write frames at 1fps (-framerate 1), so ffmpeg assigns PTS 0,1,2,...
 * The setpts expression overrides these with our precomputed values.
 *
 * Strategy: write PTS values into a concat manifest where each file entry
 * specifies an explicit outpoint — this is the most reliable VFR technique
 * in ffmpeg and doesn't require complex filter expressions.
 *
 * Actually the cleanest approach: use the concat demuxer with explicit
 * `duration` per entry — but we already know that causes encoding of
 * intermediate frames. Instead we use the `-vf settb,setpts` approach:
 *
 * Feed frames at 1fps. Each frame N has input PTS = N (seconds at 1fps).
 * Use setpts to remap: frame N → pts[N] seconds.
 * Build the expression as a series of if(eq(N,i), pts[i], ...) calls.
 * For large frame counts, use the `expr` with a lookup via mod arithmetic
 * or write the PTS list to a file and use the `movie` filter — complex.
 *
 * Simplest reliable approach for ffmpeg.wasm: write each frame as its own
 * 1-frame clip in a concat manifest with `duration` set, but pass
 * `-c copy` on a pre-encoded intermediate. That's two passes.
 *
 * Best approach for wasm: use `-framerate 1` input + `setpts` with the
 * expression `if(eq(N,0),T0, if(eq(N,1),T1,...,TN)...)` in seconds,
 * multiplied by TB (timebase). For 148 frames this is a ~6KB expression string.
 */
function buildSetptsExpr(pts) {
  // Build nested if expression: if(eq(N,0),T0,if(eq(N,1),T1,...,TN)...)
  // N is the frame number (0-based), TB is the timebase
  // We set timebase to 1/1000 so PTS values are in milliseconds
  const TB = 1000;
  let expr = `${Math.round(pts[pts.length - 1] * TB)}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    expr = `if(eq(N\\,${i})\\,${Math.round(pts[i] * TB)}\\,${expr})`;
  }
  return expr;
}

async function encodeViaWasm({ frames, steps, format, timing, width, onProgress }) {
  const ffmpeg = await getFFmpeg();

  const srcW = evenInt(frames[0]?.width ?? width ?? 900);
  const srcH = evenInt(frames[0]?.height ?? Math.round(srcW * 2 / 3));
  const outW = evenInt(Math.min(width ?? srcW, 1280));
  const outH = evenInt(srcH * (outW / srcW));

  const frameFiles = frames.map((_, i) => `f${String(i).padStart(5, '0')}.png`);
  const outputFile = `output.${format}`;

  await cleanVfs(ffmpeg, [...frameFiles, 'palette.png', outputFile]);

  try {
    // Phase 1: write PNG frames
    for (let i = 0; i < frames.length; i++) {
      const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
      const data = await fetchFile(blob);
      await ffmpeg.writeFile(frameFiles[i], data);
      onProgress?.({ stage: 'writing', framesDone: i + 1, framesTotal: frames.length });
    }

    // Phase 2: precompute PTS in JS — O(N), completes in <1ms
    const { pts, totalSec } = computePTS(steps, timing);
    const ptsExpr = buildSetptsExpr(pts);

    // setpts remaps frame N from 1fps input PTS to precomputed PTS.
    // settb=1/1000 sets timebase to milliseconds so our integer PTS values work.
    const ptsFilter = `settb=1/1000,setpts='${ptsExpr}'`;
    const scaleFilter = `scale=${outW}:${outH}:flags=lanczos`;

    console.log(`[encode] PTS expr length: ${ptsExpr.length} chars, timebase=1/1000`);
    console.log(`[encode] dimensions: src=${srcW}x${srcH} out=${outW}x${outH} format=${format}`);

    // Phase 3: encode — ffmpeg reads N frames at 1fps, setpts remaps timestamps.
    // Encode time is O(frame_count) not O(total_video_duration).
    if (format === 'gif') {
      // Pass 1: palette gen
      onProgress?.({ stage: 'palette', ratio: 0, encodedSec: 0, totalSec });
      await execWithProgress(ffmpeg, [
        '-framerate', '1', '-i', 'f%05d.png',
        '-vf', `${ptsFilter},${scaleFilter},palettegen`,
        'palette.png',
      ], p => onProgress?.({ stage: 'palette', totalSec, ...p }), frames.length);

      // Pass 2: encode
      await execWithProgress(ffmpeg, [
        '-framerate', '1', '-i', 'f%05d.png',
        '-i', 'palette.png',
        '-lavfi', `[0:v]${ptsFilter},${scaleFilter}[x];[x][1:v]paletteuse`,
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), frames.length);

    } else if (format === 'webm') {
      await execWithProgress(ffmpeg, [
        '-framerate', '1', '-i', 'f%05d.png',
        '-vf', `${ptsFilter},${scaleFilter}`,
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuv420p',
        '-b:v', '0',
        '-crf', '30',
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), frames.length);

    } else {
      // MP4
      await execWithProgress(ffmpeg, [
        '-framerate', '1', '-i', 'f%05d.png',
        '-vf', `${ptsFilter},${scaleFilter}`,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), frames.length);
    }

    const data = await ffmpeg.readFile(outputFile);
    onProgress?.({ stage: 'done', ratio: 1 });

    return new Blob([data.buffer], {
      type: format === 'gif' ? 'image/gif' : format === 'webm' ? 'video/webm' : 'video/mp4',
    });

  } catch (err) {
    if (err instanceof WebAssembly.RuntimeError || !err?.message) {
      ffmpegInstance = null;
    }
    throw err;
  } finally {
    try { await cleanVfs(ffmpeg, [...frameFiles, 'palette.png', outputFile]); } catch {}
  }
}

export async function encodeGif({ frames, steps, timing, quality, onProgress }) {
  return encodeViaWasm({ frames, steps, format: 'gif', timing, width: frames[0]?.width, onProgress });
}

export async function encodeMp4({ frames, steps, timing, width, onProgress }) {
  return encodeViaWasm({ frames, steps, format: 'mp4', timing, width, onProgress });
}

export async function encodeWebm({ frames, steps, timing, width, onProgress }) {
  return encodeViaWasm({ frames, steps, format: 'webm', timing, width, onProgress });
}
