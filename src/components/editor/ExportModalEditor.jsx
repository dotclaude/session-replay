import React, { useState, useCallback } from 'react';
import { captureFrames } from '../../lib/export/captureFrames.js';
import { encodeGif, encodeMp4, encodeWebm } from '../../lib/export/encodeVideo.js';
import { buildFramePlan } from '../../lib/export/buildFramePlan.js';

const FORMATS = [
  { id: 'mp4',  icon: '🎬', name: 'MP4',  desc: 'Best compression' },
  { id: 'webm', icon: '📹', name: 'WebM', desc: 'Web optimized' },
  { id: 'gif',  icon: '🎞', name: 'GIF',  desc: 'Browser-safe loop' },
  { id: 'json', icon: '{ }', name: 'JSON', desc: 'Composition data' },
];

const WIDTHS = [640, 900, 1280];

function Btn({ onClick, children, style }) {
  return (
    <button onClick={onClick} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', ...style }}>
      {children}
    </button>
  );
}

export default function ExportModalEditor({ composition, steps, sessionId, onClose }) {
  // Derive clipIn / clipOut from non-muted clips
  const nonMuted = composition.clips.filter(c => !c.muted);
  const clipIn  = nonMuted.length ? Math.min(...nonMuted.map(c => c.stepIndex)) : 0;
  const clipOut = nonMuted.length ? Math.max(...nonMuted.map(c => c.stepIndex)) : Math.max(0, steps.length - 1);

  const [format, setFormat] = useState('mp4');
  const [fps, setFps] = useState(10);
  const [gifQuality, setGifQuality] = useState(10);
  const [vidWidth, setVidWidth] = useState(900);
  const [phase, setPhase] = useState('idle');
  const [captureProgress, setCaptureProgress] = useState(0);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState('');
  const [exportError, setExportError] = useState(null);

  const framePlan = buildFramePlan(steps, clipIn, clipOut);
  const clipLength = clipOut - clipIn + 1;

  const isExporting = phase === 'capturing' || phase === 'encoding';
  const overallProgress = phase === 'capturing' ? captureProgress * 0.7
    : phase === 'encoding' ? 0.7 + encodeProgress * 0.3
    : phase === 'done' ? 1 : 0;

  const doExport = useCallback(async () => {
    setPhase('capturing');
    setCaptureProgress(0);
    setEncodeProgress(0);
    setExportError(null);
    setDownloadUrl(null);

    try {
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(steps.slice(clipIn, clipOut + 1), null, 2)], { type: 'application/json' });
        setDownloadUrl(URL.createObjectURL(blob));
        setDownloadName(`session-${(sessionId || 'export').slice(0, 8)}-${clipIn}-${clipOut}.json`);
        setPhase('done');
        return;
      }

      const { frames } = await captureFrames({ steps, clipIn, clipOut, onProgress: setCaptureProgress });
      setPhase('encoding');

      let blob;
      if (format === 'gif') {
        blob = await encodeGif({ frames, fps, quality: gifQuality, onProgress: setEncodeProgress });
      } else if (format === 'mp4') {
        blob = await encodeMp4({ frames, fps, width: vidWidth, onProgress: setEncodeProgress });
      } else {
        blob = await encodeWebm({ frames, fps, width: vidWidth, onProgress: setEncodeProgress });
      }

      setDownloadUrl(URL.createObjectURL(blob));
      setDownloadName(`session-${(sessionId || 'export').slice(0, 8)}-${clipIn}-${clipOut}.${format}`);
      setPhase('done');
    } catch (e) {
      setExportError(e.message || String(e));
      setPhase('error');
    }
  }, [format, steps, clipIn, clipOut, fps, gifQuality, vidWidth, sessionId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Backdrop
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div style={{ width: 680, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ height: 44, background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>↑ Export Timeline</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
            {clipLength} clips · {framePlan.length} frames · {composition.annotations.length} annotations
          </span>
          <button onClick={onClose} style={{ width: 24, height: 24, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', height: 340 }}>

          {/* Settings */}
          <div style={{ width: 240, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            {/* Format */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Format</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {FORMATS.map(f => (
                  <button key={f.id} onClick={() => setFormat(f.id)} style={{ padding: 8, background: format === f.id ? 'rgba(88,166,255,0.1)' : 'var(--bg-2)', border: `1px solid ${format === f.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontSize: 14, marginBottom: 2 }}>{f.icon}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{f.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            {format !== 'json' && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Settings</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>FPS</span>
                  <input type="range" min={3} max={30} value={fps} onChange={e => setFps(+e.target.value)} style={{ flex: 1 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-primary)', width: 22, textAlign: 'right' }}>{fps}</span>
                </div>
                {format !== 'gif' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Width</span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {WIDTHS.map(w => (
                        <button key={w} onClick={() => setVidWidth(w)} style={{ height: 22, padding: '0 6px', background: vidWidth === w ? 'var(--bg-3)' : 'var(--bg-2)', border: `1px solid ${vidWidth === w ? 'var(--text-muted)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: 9, color: vidWidth === w ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}>{w}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Summary</div>
              {[['Clips', clipLength], ['Frames', framePlan.length], ['Step range', `${clipIn}–${clipOut}`]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress / done panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
            {phase === 'idle' && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Ready to export {framePlan.length} frames as {format.toUpperCase()}
              </div>
            )}

            {isExporting && (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
                  {phase === 'capturing' ? 'Capturing frames…' : 'Encoding…'}
                </div>
                <div style={{ width: 240, height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${overallProgress * 100}%`, background: 'linear-gradient(90deg, var(--accent-dim), var(--accent))', borderRadius: 3, transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {phase === 'capturing'
                    ? `${Math.round(captureProgress * framePlan.length)} / ${framePlan.length} frames`
                    : `Encoding… ${Math.round(encodeProgress * 100)}%`}
                </div>
              </>
            )}

            {phase === 'done' && downloadUrl && (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)' }}>✓ Export complete</div>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  style={{ height: 34, padding: '0 20px', background: 'var(--green)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--bg-0)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  ↓ Download {downloadName}
                </a>
                <Btn onClick={() => { setPhase('idle'); setDownloadUrl(null); }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', height: 28, padding: '0 12px' }}>
                  Export again
                </Btn>
              </>
            )}

            {phase === 'error' && (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', textAlign: 'center', maxWidth: 240 }}>
                  Export failed: {exportError}
                </div>
                <Btn onClick={() => setPhase('idle')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', height: 28, padding: '0 12px' }}>
                  Retry
                </Btn>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ height: 52, background: 'var(--bg-2)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', flex: 1 }}>
            {downloadUrl ? `→ ${downloadName}` : `${clipLength} clips · ${format.toUpperCase()} · ${fps} fps${format !== 'gif' && format !== 'json' ? ` · ${vidWidth}px` : ''}`}
          </span>
          <Btn onClick={onClose} style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            Cancel
          </Btn>
          <Btn
            onClick={doExport}
            style={{ height: 34, padding: '0 20px', background: isExporting || phase === 'done' ? 'var(--bg-3)' : 'var(--accent)', border: 'none', color: isExporting || phase === 'done' ? 'var(--text-muted)' : 'var(--bg-0)', fontWeight: 600, opacity: isExporting ? 0.6 : 1, cursor: isExporting ? 'not-allowed' : 'pointer' }}
          >
            {isExporting ? 'Exporting…' : `↑ Export · ${format.toUpperCase()}`}
          </Btn>
        </div>
      </div>
    </div>
  );
}
