/**
 * encodeVideo
 *
 * Uses @ffmpeg/ffmpeg (WebAssembly) to encode frames client-side.
 * No bridge server required.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance = null;
let ffmpegLoaded = false;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;

  // Check if SharedArrayBuffer is available (requires COOP/COEP headers)
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'Video export requires production mode. Run: npm run build && npm run preview\n\n' +
      'Reason: WASM ffmpeg needs SharedArrayBuffer, which requires COOP/COEP headers. ' +
      'These headers break Firefox HMR in dev mode, so they\'re disabled for development.'
    );
  }

  ffmpegInstance = new FFmpeg();

  // Load ffmpeg WASM files from CDN
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegLoaded = true;
  return ffmpegInstance;
}

async function encodeViaWasm({ frames, format, fps, width, onProgress }) {
  const ffmpeg = await getFFmpeg();

  // Write frames to ffmpeg virtual filesystem
  for (let i = 0; i < frames.length; i++) {
    const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
    const data = await fetchFile(blob);
    await ffmpeg.writeFile(`f${String(i).padStart(5, '0')}.png`, data);
    onProgress?.(i / frames.length * 0.3);
  }

  onProgress?.(0.3);

  const framePattern = 'f%05d.png';
  const scaleW = parseInt(width) % 2 === 0 ? width : String(parseInt(width) + 1);

  // Execute ffmpeg based on format
  if (format === 'gif') {
    // Two-pass palette generation for better GIF quality
    const palette = 'palette.png';
    await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', framePattern,
      '-vf', `scale=${scaleW}:-1:flags=lanczos,palettegen`,
      palette
    ]);

    onProgress?.(0.5);

    await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', framePattern,
      '-i', palette,
      '-lavfi', `scale=${scaleW}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
      '-y', 'output.gif'
    ]);
  } else if (format === 'webm') {
    await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', framePattern,
      '-vf', `scale=${scaleW}:-2`,
      '-c:v', 'libvpx-vp9',
      '-b:v', '0',
      '-crf', '30',
      '-y', 'output.webm'
    ]);
  } else {
    // MP4 default
    await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', framePattern,
      '-vf', `scale=${scaleW}:-2`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);
  }

  onProgress?.(0.9);

  // Read output file
  const data = await ffmpeg.readFile(`output.${format}`);
  const blob = new Blob([data.buffer], {
    type: format === 'gif' ? 'image/gif' : format === 'webm' ? 'video/webm' : 'video/mp4'
  });

  onProgress?.(1);
  return blob;
}

export async function encodeGif({ frames, fps, quality, onProgress }) {
  return encodeViaWasm({ frames, format: 'gif', fps, width: frames[0]?.width ?? 900, onProgress });
}

export async function encodeMp4({ frames, fps, width, onProgress }) {
  return encodeViaWasm({ frames, format: 'mp4', fps, width, onProgress });
}

export async function encodeWebm({ frames, fps, width, onProgress }) {
  return encodeViaWasm({ frames, format: 'webm', fps, width, onProgress });
}
