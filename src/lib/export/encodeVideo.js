/**
 * encodeVideo
 *
 * VFR encoding: precompute PTS array in JS, write ffconcat manifest with
 * per-frame durations, then encode with -vsync vfr.
 *
 * -vsync vfr tells ffmpeg to write exactly one encoded frame per input frame
 * and let the container timestamps (from ffconcat durations) drive playback.
 * No synthetic duplicate frames are generated for long holds — a 30s hold is
 * one keyframe with the right timestamp, not 30s×fps frames.
 *
 * Encode time is O(frame_count), not O(total_video_duration).
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

async function execWithProgress(ffmpeg, args, onProgress, label) {
  let eventCount = 0;
  console.log(`[encode] ${label} start:`, args.join(' '));
  const t0 = Date.now();

  const handler = ({ progress, time }) => {
    eventCount++;
    const ratio = Math.max(0, Math.min(progress ?? 0, 0.99));
    const encodedSec = (time ?? 0) / 1_000_000;
    console.log(`[encode] ${label} #${eventCount} ratio=${ratio.toFixed(3)} encodedSec=${encodedSec.toFixed(2)}`);
    onProgress?.({ ratio, encodedSec });
  };

  ffmpeg.on('progress', handler);
  try {
    await ffmpeg.exec(args);
    console.log(`[encode] ${label} done in ${Date.now() - t0}ms (${eventCount} events)`);
  } catch (err) {
    console.error(`[encode] ${label} FAILED after ${Date.now() - t0}ms`, err);
    throw err;
  } finally {
    ffmpeg.off('progress', handler);
  }
  onProgress?.({ ratio: 1, encodedSec: null });
}

const CODEC_MIN_SEC = 0.05;
const MAX_HOLD_SEC  = 60;

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
 * Precompute cumulative PTS and per-frame durations.
 * Pure JS, runs in <1ms regardless of video length.
 */
function computePTS(steps, timing) {
  const durations = [];
  let totalSec = 0;
  for (let i = 0; i < steps.length; i++) {
    const raw = computeHoldSec(steps, i, timing);
    const dur = Math.min(Math.max(raw, CODEC_MIN_SEC), MAX_HOLD_SEC);
    durations.push(dur);
    totalSec += dur;
  }
  console.log(`[encode] PTS: ${steps.length} frames, totalSec=${totalSec.toFixed(3)}s`);
  console.log(`[encode] durations sample: [${durations.slice(0, 6).map(v => v.toFixed(3)).join(', ')} ...]`);
  return { durations, totalSec };
}

/**
 * Build ffconcat manifest. With -vsync vfr, ffmpeg encodes exactly one frame
 * per input entry — the durations set container timestamps, not GOP structure.
 */
function buildFfconcat(frameFiles, durations) {
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < frameFiles.length; i++) {
    lines.push(`file ${frameFiles[i]}`);
    lines.push(`duration ${durations[i].toFixed(6)}`);
  }
  // ffconcat requires the last file repeated without a duration line
  lines.push(`file ${frameFiles[frameFiles.length - 1]}`);
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

  console.log(`[encode] dimensions: src=${srcW}x${srcH} out=${outW}x${outH} format=${format} frames=${frames.length}`);

  await cleanVfs(ffmpeg, [...frameFiles, concatFile, 'palette.png', outputFile]);

  try {
    // Phase 1: write PNGs to VFS
    for (let i = 0; i < frames.length; i++) {
      const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
      const data = await fetchFile(blob);
      await ffmpeg.writeFile(frameFiles[i], data);
      onProgress?.({ stage: 'writing', framesDone: i + 1, framesTotal: frames.length });
    }

    // Phase 2: precompute timing, write manifest
    const { durations, totalSec } = computePTS(steps, timing);
    const concatText = buildFfconcat(frameFiles, durations);
    await ffmpeg.writeFile(concatFile, concatText);

    const concatLines = concatText.split('\n');
    console.log('[encode] ffconcat sample:\n' + [...concatLines.slice(0, 9), '...', ...concatLines.slice(-2)].join('\n'));

    const scaleFilter = `scale=${outW}:${outH}:flags=lanczos`;

    // Phase 3: encode with -vsync vfr — one encoded frame per input, no gap-filling
    if (format === 'gif') {
      onProgress?.({ stage: 'palette', ratio: 0, totalSec });
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vsync', 'vfr',
        '-vf', `${scaleFilter},palettegen`,
        'palette.png',
      ], p => onProgress?.({ stage: 'palette', totalSec, ...p }), 'palette');

      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-i', 'palette.png',
        '-vsync', 'vfr',
        '-lavfi', `${scaleFilter}[x];[x][1:v]paletteuse`,
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), 'gif-encode');

    } else if (format === 'webm') {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vsync', 'vfr',
        '-vf', scaleFilter,
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuv420p',
        '-b:v', '0',
        '-crf', '30',
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), 'webm-encode');

    } else {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vsync', 'vfr',
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), 'mp4-encode');
    }

    const data = await ffmpeg.readFile(outputFile);
    console.log(`[encode] output file size: ${data.byteLength} bytes`);

    if (!data.byteLength) throw new Error('ffmpeg produced an empty output file — encode may have failed silently');

    onProgress?.({ stage: 'done', ratio: 1, totalSec });

    return new Blob([data.buffer], {
      type: format === 'gif' ? 'image/gif' : format === 'webm' ? 'video/webm' : 'video/mp4',
    });

  } catch (err) {
    console.error('[encode] encodeViaWasm error:', err);
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
