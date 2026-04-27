/**
 * encodeVideo
 *
 * VFR encoding: precompute PTS durations in JS, write ffconcat manifest,
 * encode with -vsync vfr so ffmpeg writes exactly one encoded frame per
 * input entry (no synthetic gap-filling frames).
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

async function execWithProgress(ffmpeg, args, onProgress, label, encodeLog) {
  let eventCount = 0;
  let lastEventAt = performance.now();
  encodeLog(`${label} exec start: ${args.join(' ')}`);
  const t0 = performance.now();

  const handler = ({ progress, time }) => {
    eventCount++;
    const now = performance.now();
    const gapMs = (now - lastEventAt).toFixed(0);
    lastEventAt = now;
    const ratio = Math.max(0, Math.min(progress ?? 0, 0.99));
    const encodedSec = (time ?? 0) / 1_000_000;
    encodeLog(`${label} progress #${eventCount}: ratio=${ratio.toFixed(3)} encodedSec=${encodedSec.toFixed(2)}s gap=${gapMs}ms`);
    onProgress?.({ ratio, encodedSec });
  };

  ffmpeg.on('progress', handler);
  try {
    await ffmpeg.exec(args);
    encodeLog(`${label} exec done in ${(performance.now() - t0).toFixed(0)}ms (${eventCount} progress events)`);
  } catch (err) {
    encodeLog(`${label} exec FAILED after ${(performance.now() - t0).toFixed(0)}ms: ${err?.message ?? err}`);
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

function computeDurations(steps, timing) {
  const durations = [];
  let totalSec = 0;
  for (let i = 0; i < steps.length; i++) {
    const raw = computeHoldSec(steps, i, timing);
    const dur = Math.min(Math.max(raw, CODEC_MIN_SEC), MAX_HOLD_SEC);
    durations.push(dur);
    totalSec += dur;
  }
  return { durations, totalSec };
}

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
  const encodeStart = performance.now();
  const encodeLog = (msg) => console.log(`[encode +${(performance.now() - encodeStart).toFixed(0)}ms] ${msg}`);

  const ffmpeg = await getFFmpeg();

  const srcW = evenInt(frames[0]?.width ?? width ?? 900);
  const srcH = evenInt(frames[0]?.height ?? Math.round(srcW * 2 / 3));
  const outW = evenInt(Math.min(width ?? srcW, 1280));
  const outH = evenInt(srcH * (outW / srcW));

  const frameFiles = frames.map((_, i) => `f${String(i).padStart(5, '0')}.png`);
  const outputFile = `output.${format}`;
  const concatFile = 'input.ffconcat';

  encodeLog(`start: ${frames.length} frames, ${srcW}x${srcH} → ${outW}x${outH}, format=${format}`);
  encodeLog(`timing: mode=${timing.mode} speed=${timing.playbackSpeed} compression=${timing.compressionFactor} duration=${timing.animationDuration}ms`);

  await cleanVfs(ffmpeg, [...frameFiles, concatFile, 'palette.png', outputFile]);

  try {
    // Phase 1: write PNG frames to VFS
    encodeLog(`writing ${frames.length} PNG frames to VFS...`);
    const writeStart = performance.now();
    for (let i = 0; i < frames.length; i++) {
      const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
      const data = await fetchFile(blob);
      await ffmpeg.writeFile(frameFiles[i], data);
      if (i % 20 === 0 || i === frames.length - 1) {
        encodeLog(`  wrote frame ${i + 1}/${frames.length} (+${(performance.now() - writeStart).toFixed(0)}ms)`);
      }
      onProgress?.({ stage: 'writing', framesDone: i + 1, framesTotal: frames.length });
    }
    encodeLog(`VFS write done in ${(performance.now() - writeStart).toFixed(0)}ms`);

    // Phase 2: precompute durations + write ffconcat
    const { durations, totalSec } = computeDurations(steps, timing);
    const concatText = buildFfconcat(frameFiles, durations);
    await ffmpeg.writeFile(concatFile, concatText);

    const concatLines = concatText.split('\n');
    const durationSample = durations.slice(0, 8).map(d => d.toFixed(3)).join(', ');
    encodeLog(`ffconcat: ${frames.length} frames, totalSec=${totalSec.toFixed(3)}s`);
    encodeLog(`duration sample (first 8): [${durationSample} ...]`);
    encodeLog(`min=${Math.min(...durations).toFixed(3)}s max=${Math.max(...durations).toFixed(3)}s avg=${(totalSec/durations.length).toFixed(3)}s`);
    encodeLog(`ffconcat preview:\n${concatLines.slice(0, 9).join('\n')}\n...\n${concatLines.slice(-2).join('\n')}`);

    const scaleFilter = `scale=${outW}:${outH}:flags=lanczos`;

    // Phase 3: encode with -vsync vfr (one encoded frame per input, no gap-filling)
    if (format === 'gif') {
      onProgress?.({ stage: 'palette', ratio: 0, totalSec });
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vsync', 'vfr',
        '-vf', `${scaleFilter},palettegen`,
        'palette.png',
      ], p => onProgress?.({ stage: 'palette', totalSec, ...p }), 'gif-palette', encodeLog);

      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-i', 'palette.png',
        '-vsync', 'vfr',
        '-lavfi', `${scaleFilter}[x];[x][1:v]paletteuse`,
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), 'gif-encode', encodeLog);

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
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), 'webm-encode', encodeLog);

    } else {
      await execWithProgress(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-vsync', 'vfr',
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-y', outputFile,
      ], p => onProgress?.({ stage: 'encoding', totalSec, ...p }), 'mp4-encode', encodeLog);
    }

    const data = await ffmpeg.readFile(outputFile);
    encodeLog(`output: ${data.byteLength} bytes (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`);

    if (!data.byteLength) throw new Error('ffmpeg produced an empty output file — encode may have failed silently');

    const totalMs = (performance.now() - encodeStart).toFixed(0);
    encodeLog(`DONE: total encode time ${totalMs}ms for ${frames.length} frames (${totalSec.toFixed(1)}s video)`);

    onProgress?.({ stage: 'done', ratio: 1, totalSec, outputBytes: data.byteLength, outW, outH });

    return new Blob([data.buffer], {
      type: format === 'gif' ? 'image/gif' : format === 'webm' ? 'video/webm' : 'video/mp4',
    });

  } catch (err) {
    encodeLog(`ERROR: ${err?.message ?? err}`);
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
