/**
 * encodeVideo
 *
 * Uses @ffmpeg/ffmpeg (WebAssembly) to encode frames client-side.
 * Per-frame durations are computed using the same logic as useTimedAnimator
 * so the video plays back at exactly the speed the preview was set to.
 *
 * timing object mirrors useTimedAnimator state:
 *   { mode, animationDuration, playbackSpeed, compressionFactor }
 *
 * Per-frame duration comes purely from step timestamps and timing mode.
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

// onProgress receives { ratio: 0..1, encodedSec: number, totalSec: number }
async function execWithProgress(ffmpeg, args, onProgress, totalSec) {
  let eventCount = 0;
  let lastEventAt = Date.now();
  console.log('[encode] execWithProgress start', { args: args.join(' '), totalSec });

  const handler = ({ progress, time }) => {
    eventCount++;
    const now = Date.now();
    const gap = now - lastEventAt;
    lastEventAt = now;
    const encodedSec = (time ?? 0) / 1_000_000;
    const ratio = totalSec > 0 ? Math.min(encodedSec / totalSec, 0.99) : Math.max(0, Math.min(1, progress));
    console.log(`[encode] progress #${eventCount} gap=${gap}ms raw_progress=${progress?.toFixed(3)} time=${time} encodedSec=${encodedSec.toFixed(2)} ratio=${ratio.toFixed(3)}`);
    onProgress?.({ ratio, encodedSec, totalSec });
  };

  ffmpeg.on('progress', handler);
  const t0 = Date.now();
  try {
    await ffmpeg.exec(args);
    console.log(`[encode] exec completed in ${Date.now() - t0}ms, total progress events: ${eventCount}`);
  } catch (err) {
    console.error(`[encode] exec FAILED after ${Date.now() - t0}ms`, err);
    throw err;
  } finally {
    ffmpeg.off('progress', handler);
  }
  onProgress?.({ ratio: 1, encodedSec: totalSec, totalSec });
}

const CODEC_MIN_SEC = 0.05; // 50ms absolute floor — prevents codec divide-by-zero
const MAX_HOLD_SEC  = 30;   // cap any single frame at 30s

/**
 * Compute hold duration for one step — mirrors useTimedAnimator exactly.
 *
 * mode='fixed':      each step holds for animationDuration/playbackSpeed ms
 * mode='realtime':   each step holds for its real timestamp delta / playbackSpeed
 * mode='compressed': each step holds for its real timestamp delta / compressionFactor
 *
 * Returns seconds.
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

  if (mode === 'realtime')   return deltaMs / Math.max(playbackSpeed,        0.01) / 1000;
  if (mode === 'compressed') return deltaMs / Math.max(compressionFactor,    0.01) / 1000;
  return fixedSec;
}

/**
 * Build ffconcat manifest with per-frame hold durations.
 *
 * For realtime/compressed modes the duration comes purely from timestamps —
 *
 * A small CODEC_MIN_SEC floor (50ms) is applied to all modes to keep
 * the video container valid.
 */
function buildFfconcat(frameFiles, steps, timing) {
  const lines = ['ffconcat version 1.0'];
  let totalSec = 0;
  for (let i = 0; i < frameFiles.length; i++) {
    const raw = computeHoldSec(steps, i, timing);
    const dur = Math.min(Math.max(raw, CODEC_MIN_SEC), MAX_HOLD_SEC);
    totalSec += dur;
    lines.push(`file ${frameFiles[i]}`);
    lines.push(`duration ${dur.toFixed(6)}`);
  }
  if (frameFiles.length > 0) lines.push(`file ${frameFiles[frameFiles.length - 1]}`);
  return { text: lines.join('\n'), totalSec };
}

async function encodeViaWasm({ frames, steps, format, timing, width, onProgress }) {
  const ffmpeg = await getFFmpeg();

  const srcW = evenInt(frames[0]?.width ?? width ?? 900);
  const srcH = evenInt(frames[0]?.height ?? Math.round(srcW * 2 / 3));
  const outW = evenInt(Math.min(width ?? srcW, 1280));
  const outH = evenInt(srcH * (outW / srcW));

  const frameFiles = frames.map((_, i) => `f${String(i).padStart(5, '0')}.png`);
  const outputFile = `output.${format}`;
  const concatFile = 'input.ffconcat';

  await cleanVfs(ffmpeg, [...frameFiles, concatFile, 'palette.png', outputFile]);

  try {
    // Phase 1: write PNG frames — report as frame-write stage
    for (let i = 0; i < frames.length; i++) {
      const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
      const data = await fetchFile(blob);
      await ffmpeg.writeFile(frameFiles[i], data);
      onProgress?.({ stage: 'writing', framesDone: i + 1, framesTotal: frames.length });
    }

    // Build ffconcat manifest — also gives us total video duration for progress
    const { text: concatText, totalSec } = buildFfconcat(frameFiles, steps ?? [], timing);
    await ffmpeg.writeFile(concatFile, concatText);

    // Log the first 5 and last 2 lines of the manifest so we can see frame durations
    const concatLines = concatText.split('\n');
    const sampleLines = [...concatLines.slice(0, 11), '...', ...concatLines.slice(-3)];
    console.log(`[encode] ffconcat built: ${frames.length} frames, totalSec=${totalSec.toFixed(3)}s`);
    console.log('[encode] ffconcat sample:\n' + sampleLines.join('\n'));
    console.log(`[encode] dimensions: src=${srcW}x${srcH} out=${outW}x${outH} format=${format}`);

    const scaleFilter = `scale=${outW}:${outH}:flags=lanczos`;

    // Phase 2: encode
    if (format === 'gif') {
      // Pass 1: palette — no meaningful time progress, just mark as palette stage
      onProgress?.({ stage: 'palette', ratio: 0, encodedSec: 0, totalSec });
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vf', `${scaleFilter},palettegen`,
        'palette.png',
      ], p => onProgress?.({ stage: 'palette', ...p }), totalSec);

      // Pass 2: encode
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-i', 'palette.png',
        '-lavfi', `${scaleFilter}[x];[x][1:v]paletteuse`,
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', ...p }), totalSec);

    } else if (format === 'webm') {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vf', scaleFilter,
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuv420p',
        '-b:v', '0',
        '-crf', '30',
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', ...p }), totalSec);

    } else {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', ...p }), totalSec);
    }

    const data = await ffmpeg.readFile(outputFile);
    onProgress?.(1);

    return new Blob([data.buffer], {
      type: format === 'gif' ? 'image/gif' : format === 'webm' ? 'video/webm' : 'video/mp4',
    });

  } catch (err) {
    if (err instanceof WebAssembly.RuntimeError || !err?.message) {
      ffmpegInstance = null;
    }
    throw err;
  } finally {
    try { await cleanVfs(ffmpeg, [...frameFiles, concatFile, 'palette.png', outputFile]); } catch {}
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
