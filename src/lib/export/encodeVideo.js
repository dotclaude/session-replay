/**
 * encodeVideo
 *
 * Sends captured frames to the bridge server for encoding via system ffmpeg.
 * Frames are streamed as multipart/form-data (raw PNG blobs) — no base64,
 * no JSON size limit, no WASM.
 */

async function encodeViaServer({ frames, format, fps, width, onProgress }) {
  const form = new FormData();
  form.append('format', format);
  form.append('fps', String(fps));
  form.append('width', String(width));

  for (let i = 0; i < frames.length; i++) {
    const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
    form.append(`frame${i}`, blob, `f${String(i).padStart(5, '0')}.png`);
    onProgress?.(i / frames.length * 0.4);
  }

  onProgress?.(0.4);

  const res = await fetch('/api/encode', { method: 'POST', body: form });

  onProgress?.(0.9);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Encode failed: ${res.status}`);
  }

  const blob = await res.blob();
  onProgress?.(1);
  return blob;
}

export async function encodeGif({ frames, fps, quality, onProgress }) {
  return encodeViaServer({ frames, format: 'gif', fps, width: frames[0]?.width ?? 900, onProgress });
}

export async function encodeMp4({ frames, fps, width, onProgress }) {
  return encodeViaServer({ frames, format: 'mp4', fps, width, onProgress });
}

export async function encodeWebm({ frames, fps, width, onProgress }) {
  return encodeViaServer({ frames, format: 'webm', fps, width, onProgress });
}
