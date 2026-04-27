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

async function execWithProgress(ffmpeg, args, onProgress, progressStart, progressEnd) {
  const handler = ({ progress }) => {
    const p = Math.max(0, Math.min(1, progress));
    onProgress?.(progressStart + p * (progressEnd - progressStart));
  };
  ffmpeg.on('progress', handler);
  try {
    await ffmpeg.exec(args);
  } finally {
    ffmpeg.off('progress', handler);
  }
  onProgress?.(progressEnd);
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
  for (let i = 0; i < frameFiles.length; i++) {
    const raw = computeHoldSec(steps, i, timing);
    const dur = Math.min(Math.max(raw, CODEC_MIN_SEC), MAX_HOLD_SEC);
    lines.push(`file ${frameFiles[i]}`);
    lines.push(`duration ${dur.toFixed(6)}`);
  }
  if (frameFiles.length > 0) lines.push(`file ${frameFiles[frameFiles.length - 1]}`);
  return lines.join('\n');
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
    // Phase 1 (0–30%): write PNG frames
    for (let i = 0; i < frames.length; i++) {
      const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
      const data = await fetchFile(blob);
      await ffmpeg.writeFile(frameFiles[i], data);
      onProgress?.((i + 1) / frames.length * 0.3);
    }

    // Write ffconcat manifest
    const concatText = buildFfconcat(frameFiles, steps ?? [], timing);
    await ffmpeg.writeFile(concatFile, concatText);

    const scaleFilter = `scale=${outW}:${outH}:flags=lanczos`;

    // Phase 2 (30–95%): encode
    if (format === 'gif') {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vf', `${scaleFilter},palettegen`,
        'palette.png',
      ], onProgress, 0.3, 0.5);

      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-i', 'palette.png',
        '-lavfi', `${scaleFilter}[x];[x][1:v]paletteuse`,
        '-y', outputFile,
      ], onProgress, 0.5, 0.95);

    } else if (format === 'webm') {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vf', scaleFilter,
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuv420p',
        '-b:v', '0',
        '-crf', '30',
        '-y', outputFile,
      ], onProgress, 0.3, 0.95);

    } else {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-y', outputFile,
      ], onProgress, 0.3, 0.95);
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
