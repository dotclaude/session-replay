import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parseSession } from '../lib/parser/parseSession.js';
import { buildSteps } from '../lib/parser/buildSteps.js';
import { buildFramePlan } from '../lib/export/buildFramePlan.js';
import { captureFrames } from '../lib/export/captureFrames.js';
import { encodeGif, encodeMp4, encodeWebm } from '../lib/export/encodeVideo.js';
import StageRenderer from '../components/stages/StageRenderer.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { kindColor } from '../lib/editor/kindColors.js';
import { useTheme } from '../hooks/useTheme.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// Removed KIND_COLORS - now using kindColor() function for theme-aware colors

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ steps, clipIn, clipOut, previewStep, onPreviewStep }) {
  const theme = useTheme(); // Force re-render on theme change
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const total = steps.length;

  function getIndex(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(Math.floor(((e.clientX - rect.left) / rect.width) * total), total - 1));
  }

  if (!total) return null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        style={{ display: 'block', width: '100%', height: 40, cursor: 'crosshair' }}
        viewBox={`0 0 ${total} 1`}
        preserveAspectRatio="none"
        onClick={e => onPreviewStep(getIndex(e))}
        onMouseMove={e => {
          const i = getIndex(e);
          setTooltip({ x: e.clientX - svgRef.current.getBoundingClientRect().left, i, desc: steps[i]?.description });
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {steps.map((s, i) => (
          <rect key={i} x={i} y={0} width={1} height={1}
            fill={kindColor(s.kind)}
            opacity={(clipIn != null && clipOut != null) ? (i >= clipIn && i <= clipOut ? 1 : 0.3) : 1}
          />
        ))}
        {steps.map((s, i) => s.kind === 'human'
          ? <line key={`t${i}`} x1={i} y1={0} x2={i} y2={1} stroke="#e6edf3" strokeWidth={0.1} opacity={0.4} />
          : null
        )}
        {clipIn != null && clipOut != null && (
          <rect x={clipIn} y={0} width={clipOut - clipIn + 1} height={1} fill="#58a6ff" opacity={0.15} />
        )}
        {clipIn != null && <line x1={clipIn} y1={0} x2={clipIn} y2={1} stroke="#58a6ff" strokeWidth={0.8} />}
        {clipOut != null && <line x1={clipOut + 1} y1={0} x2={clipOut + 1} y2={1} stroke="#58a6ff" strokeWidth={0.8} />}
        <line x1={previewStep + 0.5} y1={0} x2={previewStep + 0.5} y2={1} stroke="#f0f6fc" strokeWidth={0.5} opacity={0.8} />
      </svg>
      {tooltip && (
        <div style={{
          position: 'absolute', bottom: '100%',
          left: Math.min(tooltip.x, (svgRef.current?.clientWidth || 400) - 240),
          marginBottom: 4, background: 'var(--bg-0)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '3px 8px',
          fontSize: 11, color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
          pointerEvents: 'none', zIndex: 10,
        }}>
          {tooltip.i + 1}: {tooltip.desc}
        </div>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function SliderSetting({ label, value, min, max, step, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--accent)' }} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExportEditorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const stepsRef = useRef([]);

  const [clipIn, setClipIn] = useState(null);
  const [clipOut, setClipOut] = useState(null);
  const [previewStep, setPreviewStep] = useState(0);

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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sessions/${sessionId}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Session not found' : `Server error ${r.status}`);
        return r.json();
      })
      .then(lines => {
        if (!Array.isArray(lines) || lines.length === 0) throw new Error('Session is empty');
        const events = parseSession(lines);
        const steps = buildSteps(events);
        stepsRef.current = steps;
        setClipIn(0);
        setClipOut(steps.length - 1);
        setPreviewStep(0);
        setLoading(false);
      })
      .catch(e => { setLoadError(e.message); setLoading(false); });
  }, [sessionId]);

  const steps = stepsRef.current;
  const hasClip = clipIn != null && clipOut != null && clipIn <= clipOut;
  const clipLength = hasClip ? clipOut - clipIn + 1 : 0;

  const framePlan = useMemo(
    () => hasClip ? buildFramePlan(steps, clipIn, clipOut) : [],
    [steps, clipIn, clipOut, hasClip]
  );

  const estimatedDuration = useMemo(() => {
    if (!hasClip || !steps.length) return 0;
    const t0 = steps[clipIn]?.event?.timestamp || steps[clipIn]?.timestamp;
    const t1 = steps[clipOut]?.event?.timestamp || steps[clipOut]?.timestamp;
    return (t0 && t1) ? new Date(t1) - new Date(t0) : clipLength * 700;
  }, [steps, clipIn, clipOut, hasClip, clipLength]);

  const doExport = useCallback(async () => {
    if (!hasClip) return;
    setPhase('capturing');
    setCaptureProgress(0);
    setEncodeProgress(0);
    setExportError(null);
    setDownloadUrl(null);

    try {
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(steps.slice(clipIn, clipOut + 1), null, 2)], { type: 'application/json' });
        setDownloadUrl(URL.createObjectURL(blob));
        setDownloadName(`session-${sessionId.slice(0, 8)}-${clipIn}-${clipOut}.json`);
        setPhase('done');
        return;
      }

      const { frames } = await captureFrames({
        steps, clipIn, clipOut,
        onProgress: p => setCaptureProgress(p),
      });

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
      setDownloadName(`session-${sessionId.slice(0, 8)}-${clipIn}-${clipOut}.${format}`);
      setPhase('done');
    } catch (e) {
      setExportError(e.message || String(e));
      setPhase('error');
    }
  }, [hasClip, format, steps, clipIn, clipOut, fps, gifQuality, vidWidth, sessionId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
      Loading session…
    </div>
  );

  if (loadError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--red)' }}>
      <div>{loadError}</div>
      <button onClick={() => navigate(-1)} style={{ padding: '6px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer' }}>← Back</button>
    </div>
  );

  const totalSteps = steps.length;
  const isExporting = phase === 'capturing' || phase === 'encoding';
  const overallProgress = phase === 'capturing' ? captureProgress * 0.7
    : phase === 'encoding' ? 0.7 + encodeProgress * 0.3
    : phase === 'done' ? 1 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-0)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => navigate(`/replay/${sessionId}`)}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}>
          ←
        </button>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Animation Editor</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{sessionId.slice(0, 16)}</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{totalSteps} steps</div>
        <ThemeToggle />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel — timeline + controls */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Timeline */}
          <div style={{ padding: '14px 14px 8px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Timeline</div>
            <Timeline steps={steps} clipIn={clipIn} clipOut={clipOut} previewStep={previewStep} onPreviewStep={setPreviewStep} />
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <button onClick={() => setClipIn(previewStep)}
                style={{ flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: clipIn != null ? 'rgba(88,166,255,0.15)' : 'var(--bg-2)', border: `1px solid ${clipIn != null ? 'var(--accent)' : 'var(--border)'}`, color: clipIn != null ? 'var(--accent)' : 'var(--text-secondary)' }}>
                ⌊ In {clipIn != null ? `(${clipIn})` : ''}
              </button>
              <button onClick={() => setClipOut(previewStep)}
                style={{ flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: clipOut != null ? 'rgba(88,166,255,0.15)' : 'var(--bg-2)', border: `1px solid ${clipOut != null ? 'var(--accent)' : 'var(--border)'}`, color: clipOut != null ? 'var(--accent)' : 'var(--text-secondary)' }}>
                Out {clipOut != null ? `(${clipOut})` : ''} ⌉
              </button>
            </div>
            <button onClick={() => { setClipIn(0); setClipOut(steps.length - 1); }}
              style={{ width: '100%', marginTop: 4, padding: '3px 0', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Full session
            </button>
          </div>

          {/* Clip stats */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Clip Info</div>
            {hasClip ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <StatRow label="Steps" value={`${clipIn}–${clipOut} (${clipLength})`} />
                <StatRow label="Session time" value={fmt(estimatedDuration)} />
                <StatRow label="Frames" value={framePlan.length} />
                <StatRow label={`Duration @ ${fps}fps`} value={fmt(framePlan.length * (1000 / fps))} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click timeline to preview</div>
            )}
          </div>

          {/* Step scrubber */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Preview Step</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setPreviewStep(s => Math.max(0, s - 1))}
                style={{ padding: '3px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}>‹</button>
              <input type="range" min={0} max={totalSteps - 1} value={previewStep}
                onChange={e => setPreviewStep(+e.target.value)}
                style={{ flex: 1, accentColor: 'var(--accent)' }} />
              <button onClick={() => setPreviewStep(s => Math.min(totalSteps - 1, s + 1))}
                style={{ padding: '3px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}>›</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {previewStep + 1} / {totalSteps} — {steps[previewStep]?.description?.slice(0, 38)}
            </div>
          </div>

          {/* Export settings */}
          <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Export Settings</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {[['mp4','MP4'],['webm','WebM'],['gif','GIF'],['json','JSON']].map(([val, label]) => (
                <button key={val} onClick={() => setFormat(val)}
                  style={{ flex: 1, padding: '5px 0', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: format === val ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${format === val ? 'var(--accent)' : 'var(--border)'}`, color: format === val ? 'white' : 'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>

            {format !== 'json' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SliderSetting label="FPS" value={fps} min={3} max={format === 'gif' ? 15 : 30} step={1} onChange={setFps} />
                {format !== 'gif' && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Width</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[640, 900, 1280].map(w => (
                        <button key={w} onClick={() => setVidWidth(w)}
                          style={{ flex: 1, padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: vidWidth === w ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${vidWidth === w ? 'var(--accent)' : 'var(--border)'}`, color: vidWidth === w ? 'white' : 'var(--text-muted)' }}>
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {format === 'gif' && (
                  <SliderSetting label="Quality (lower = better)" value={gifQuality} min={1} max={20} step={1} onChange={setGifQuality} />
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-2)', padding: '7px 10px', borderRadius: 4, lineHeight: 1.5 }}>
                  {format === 'gif' ? 'Browser-encoded via gif.js — no upload, no server.'
                    : `Browser-encoded via ffmpeg.wasm — no upload, no server.${format === 'mp4' ? ' First run loads ~5MB WASM once.' : ''}`}
                </div>
              </div>
            )}
            {format === 'json' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-2)', padding: '7px 10px', borderRadius: 4 }}>
                Exports raw step data. Useful for analysis or re-importing into the replay.
              </div>
            )}
          </div>
        </div>

        {/* Right panel — preview + export */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}>

          {/* Preview header */}
          <div style={{ padding: '10px 16px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Preview</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Step {previewStep + 1}: {steps[previewStep]?.description?.slice(0, 60)}
            </span>
            {hasClip && (previewStep < clipIn || previewStep > clipOut) && (
              <span style={{ fontSize: 11, color: 'var(--yellow)', background: 'rgba(210,153,34,0.12)', padding: '2px 7px', borderRadius: 8, marginLeft: 'auto' }}>
                outside clip
              </span>
            )}
          </div>

          {/* Live preview */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {steps[previewStep] && (
              <StageRenderer key={previewStep} step={steps[previewStep]} isCurrent={true} isSearchMatch={false} />
            )}
          </div>

          {/* Export footer */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-1)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            {(isExporting || phase === 'done') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {phase === 'capturing' ? `Rendering frames… ${Math.round(captureProgress * 100)}%`
                      : phase === 'encoding' ? `Encoding ${format.toUpperCase()}… ${Math.round(encodeProgress * 100)}%`
                      : 'Done'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(overallProgress * 100)}%</span>
                </div>
                <div style={{ background: 'var(--bg-3)', borderRadius: 2, height: 6 }}>
                  <div style={{ width: `${Math.round(overallProgress * 100)}%`, height: '100%', background: phase === 'done' ? 'var(--green)' : 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            {exportError && (
              <div style={{ fontSize: 12, color: 'var(--red)', background: 'rgba(248,81,73,0.1)', padding: '7px 12px', borderRadius: 4, marginBottom: 10 }}>
                {exportError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {downloadUrl ? (
                <>
                  <a href={downloadUrl} download={downloadName}
                    style={{ flex: 1, display: 'block', textAlign: 'center', padding: '9px', background: 'var(--green)', color: '#000', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    ↓ Download {downloadName}
                  </a>
                  <button onClick={() => { setDownloadUrl(null); setPhase('idle'); }}
                    style={{ padding: '9px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
                    Re-export
                  </button>
                </>
              ) : (
                <button onClick={doExport} disabled={!hasClip || isExporting}
                  style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: (!hasClip || isExporting) ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-sm)', background: (!hasClip || isExporting) ? 'var(--bg-3)' : 'var(--accent-dim)', border: `1px solid ${(!hasClip || isExporting) ? 'var(--border)' : 'var(--accent)'}`, color: (!hasClip || isExporting) ? 'var(--text-muted)' : 'white', opacity: !hasClip ? 0.5 : 1 }}>
                  {isExporting ? 'Exporting…'
                    : !hasClip ? 'Set clip points first'
                    : `Export ${format.toUpperCase()} — ${framePlan.length} frames`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
