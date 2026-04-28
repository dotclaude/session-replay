import { useState } from 'react';

export default function ExportPanel({ steps, clipIn, clipOut, stageRef, scrubTo, onClose }) {
  const [format, setFormat] = useState('json');
  const [fps, setFps] = useState(10);
  const [quality, setQuality] = useState(10);
  const [resolution, setResolution] = useState(800);
  const [progress, setProgress] = useState(null); // null | 0..1
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState('');
  const [error, setError] = useState(null);

  const hasClip = clipIn != null && clipOut != null && clipIn <= clipOut;
  const clipLength = hasClip ? clipOut - clipIn + 1 : 0;

  async function doExport() {
    setError(null);
    setDownloadUrl(null);
    setProgress(0);

    try {
      if (format === 'json') {
        const clipped = steps.slice(clipIn, clipOut + 1);
        const blob = new Blob([JSON.stringify(clipped, null, 2)], { type: 'application/json' });
        setDownloadUrl(URL.createObjectURL(blob));
        setDownloadName(`clip-${clipIn}-${clipOut}.json`);
        setProgress(1);
        return;
      }

      // For GIF/MP4 we need html2canvas
      const html2canvas = (await import('html2canvas')).default;
      const el = stageRef.current;
      if (!el) throw new Error('Stage element not found');

      // Capture frames
      const frames = [];
      for (let i = clipIn; i <= clipOut; i++) {
        scrubTo(i);
        // Double rAF — give React two frames to flush
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const canvas = await html2canvas(el, { backgroundColor: '#0d1117', scale: 1, logging: false });
        frames.push(canvas);
        setProgress((i - clipIn + 1) / clipLength * 0.6);
      }

      if (format === 'gif') {
        const GIF = (await import('gif.js')).default;
        const gif = new GIF({ workers: 2, quality, workerScript: '/gif.worker.js', width: frames[0].width, height: frames[0].height });
        for (const frame of frames) gif.addFrame(frame, { delay: Math.round(1000 / fps) });
        await new Promise((resolve, reject) => {
          gif.on('finished', blob => {
            setDownloadUrl(URL.createObjectURL(blob));
            setDownloadName(`clip-${clipIn}-${clipOut}.gif`);
            setProgress(1);
            resolve();
          });
          gif.on('progress', p => setProgress(0.6 + p * 0.4));
          gif.on('error', reject);
          gif.render();
        });
        return;
      }

      if (format === 'mp4') {
        const { createFFmpeg } = await import('@ffmpeg/ffmpeg');
        const ffmpeg = createFFmpeg({ log: false });
        setProgress(0.62);
        await ffmpeg.load();
        setProgress(0.65);
        for (let i = 0; i < frames.length; i++) {
          const blob = await new Promise(r => frames[i].toBlob(r, 'image/png'));
          const buf = await blob.arrayBuffer();
          ffmpeg.FS('writeFile', `frame${String(i).padStart(4, '0')}.png`, new Uint8Array(buf));
          setProgress(0.65 + (i / frames.length) * 0.2);
        }
        await ffmpeg.run('-framerate', String(fps), '-i', 'frame%04d.png', '-vf', `scale=${resolution}:-2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'out.mp4');
        const data = ffmpeg.FS('readFile', 'out.mp4');
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        setDownloadUrl(URL.createObjectURL(blob));
        setDownloadName(`clip-${clipIn}-${clipOut}.mp4`);
        setProgress(1);
      }
    } catch (e) {
      setError(e.message || String(e));
      setProgress(null);
    }
  }

  const btn = { padding: '5px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--border)' };
  const radioStyle = (val) => ({
    ...btn,
    background: format === val ? 'var(--accent-dim)' : 'var(--bg-2)',
    borderColor: format === val ? 'var(--accent)' : 'var(--border)',
    color: format === val ? 'white' : 'var(--text-secondary)',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        width: 400, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Export Clip</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Steps {clipIn}–{clipOut} <span style={{ color: 'var(--text-muted)' }}>({clipLength} steps)</span>
        </div>

        {/* Format */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Format</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={radioStyle('json')} onClick={() => setFormat('json')}>JSON</button>
            <button style={radioStyle('gif')} onClick={() => setFormat('gif')}>GIF</button>
            <button style={radioStyle('mp4')} onClick={() => setFormat('mp4')}>MP4</button>
          </div>
        </div>

        {/* Format-specific options */}
        {format === 'gif' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              FPS <span style={{ color: 'var(--text-primary)' }}>{fps}</span>
              <input type="range" min={5} max={15} step={5} value={fps} onChange={e => setFps(+e.target.value)} style={{ width: 120, accentColor: 'var(--accent)' }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              Quality <span style={{ color: 'var(--text-primary)' }}>{quality}</span>
              <input type="range" min={1} max={20} value={quality} onChange={e => setQuality(+e.target.value)} style={{ width: 120, accentColor: 'var(--accent)' }} />
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-2)', padding: '6px 10px', borderRadius: 4 }}>
              GIF export uses your browser + html2canvas. Target: &lt;5MB at 10fps.
            </div>
          </div>
        )}

        {format === 'mp4' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              FPS <span style={{ color: 'var(--text-primary)' }}>{fps}</span>
              <input type="range" min={15} max={30} step={5} value={fps} onChange={e => setFps(+e.target.value)} style={{ width: 120, accentColor: 'var(--accent)' }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              Width <span style={{ color: 'var(--text-primary)' }}>{resolution}px</span>
              <select value={resolution} onChange={e => setResolution(+e.target.value)}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>
                <option value={800}>800px</option>
                <option value={1280}>1280px</option>
              </select>
            </label>
            <div style={{ fontSize: 11, color: 'var(--yellow)', background: 'rgba(210,153,34,0.1)', padding: '6px 10px', borderRadius: 4 }}>
              MP4 requires downloading ffmpeg.wasm (~32MB) on first use.
            </div>
          </div>
        )}

        {/* Progress */}
        {progress != null && progress < 1 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              {format === 'json' ? 'Serializing…' : progress < 0.6 ? `Capturing frame ${Math.round(progress / 0.6 * clipLength)} / ${clipLength}…` : 'Encoding…'}
            </div>
            <div style={{ background: 'var(--bg-3)', borderRadius: 2, height: 4 }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', background: 'rgba(248,81,73,0.1)', padding: '8px 12px', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {/* Download / Export */}
        {downloadUrl ? (
          <a href={downloadUrl} download={downloadName}
            style={{ display: 'block', textAlign: 'center', padding: '8px', background: 'var(--green)', color: 'var(--bg-0)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            ↓ Download {downloadName}
          </a>
        ) : (
          <button onClick={doExport} disabled={progress != null && progress < 1}
            style={{ padding: '9px', background: progress != null && progress < 1 ? 'var(--bg-3)' : 'var(--accent-dim)', border: `1px solid var(--accent)`, color: progress != null && progress < 1 ? 'var(--text-muted)' : 'var(--bg-0)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: progress != null && progress < 1 ? 'wait' : 'pointer' }}>
            {progress != null && progress < 1 ? 'Exporting…' : `Export as ${format.toUpperCase()}`}
          </button>
        )}
      </div>
    </div>
  );
}
