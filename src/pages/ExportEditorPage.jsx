import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parseSession } from '../lib/parser/parseSession.js';
import { buildSteps } from '../lib/parser/buildSteps.js';
import { captureFrames } from '../lib/export/captureFrames.js';
import { encodeGif, encodeMp4, encodeWebm } from '../lib/export/encodeVideo.js';
import StageRenderer from '../components/stages/StageRenderer.jsx';
import ProcessingIndicator from '../components/stages/ProcessingIndicator.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { kindColor } from '../lib/editor/kindColors.js';
import { useTheme } from '../hooks/useTheme.js';
import { useTimedAnimator } from '../lib/stepAnimator/useTimedAnimator.js';
import { getProcessingMessage } from '../lib/utils/processingMessages.js';
import { loadSessionsCache } from '../lib/sessionsStore.ts';
import { getSavedSessionsDirectory } from '../lib/fsAccess.ts';
import { loadFullSession } from '../lib/progressiveSessionReader.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

const SKIP_KINDS = new Set(['session-header', 'local-command-output', 'queue-op']);

const RENDER_MODES = [
  { id: 'scroll',  label: 'Scroll',  desc: 'History accumulates, scrolls to newest' },
  { id: 'focused', label: 'Focused', desc: 'Current step large, 2 prior steps dimmed above' },
  { id: 'stream',  label: 'Stream',  desc: 'One step at a time fills the frame' },
];

// ─── Clip colors ─────────────────────────────────────────────────────────────

const CLIP_COLORS = ['#58a6ff', '#3fb950', '#ffa657', '#bc8cff', '#f85149', '#d29922'];
function clipColor(idx) { return CLIP_COLORS[idx % CLIP_COLORS.length]; }
let _clipIdSeq = 0;
function newClipId() { return ++_clipIdSeq; }

// ─── Timeline strip ───────────────────────────────────────────────────────────

// clips: Array<{id, in, out}> — renders all clip regions in their colors
function Timeline({ steps, clips, currentStep, height = 44 }) {
  useTheme();
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const total = steps.length;

  // Determine which steps are inside any clip
  const inAnyClip = useMemo(() => {
    const set = new Set();
    clips.forEach(c => { for (let i = c.in; i <= c.out; i++) set.add(i); });
    return set;
  }, [clips]);

  function getIndex(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(Math.floor(((e.clientX - rect.left) / rect.width) * total), total - 1));
  }

  if (!total) return null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        style={{ display: 'block', width: '100%', height, cursor: 'default' }}
        viewBox={`0 0 ${total} 1`}
        preserveAspectRatio="none"
        onMouseMove={e => {
          const i = getIndex(e);
          setTooltip({ x: e.clientX - svgRef.current.getBoundingClientRect().left, i, desc: steps[i]?.description });
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Base step colors, dimmed if not in any clip */}
        {steps.map((s, i) => (
          <rect key={i} x={i} y={0} width={1} height={1}
            fill={kindColor(s.kind)}
            opacity={clips.length > 0 ? (inAnyClip.has(i) ? 1 : 0.2) : 1}
          />
        ))}
        {/* Turn markers */}
        {steps.map((s, i) => s.kind === 'human'
          ? <line key={`t${i}`} x1={i} y1={0} x2={i} y2={1} stroke="#e6edf3" strokeWidth={0.1} opacity={0.3} />
          : null
        )}
        {/* Clip regions */}
        {clips.map((c, ci) => (
          <React.Fragment key={c.id}>
            <rect x={c.in} y={0} width={c.out - c.in + 1} height={1} fill={clipColor(ci)} opacity={0.2} />
            <line x1={c.in} y1={0} x2={c.in} y2={1} stroke={clipColor(ci)} strokeWidth={0.8} />
            <line x1={c.out + 1} y1={0} x2={c.out + 1} y2={1} stroke={clipColor(ci)} strokeWidth={0.8} />
          </React.Fragment>
        ))}
        {/* Playhead */}
        {currentStep != null && (
          <line x1={currentStep + 0.5} y1={0} x2={currentStep + 0.5} y2={1} stroke="#f0f6fc" strokeWidth={0.5} opacity={0.7} />
        )}
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

// ─── Dual-handle range slider ─────────────────────────────────────────────────

const THUMB_H = 20;
const TRACK_H = 4;

function DualRangeSlider({ min, max, valueIn, valueOut, color, onChangeIn, onChangeOut }) {
  const pct = v => (v - min) / (max - min) * 100;
  return (
    <div style={{ position: 'relative', height: THUMB_H, margin: '6px 0' }}>
      <style>{`
        .dual-range input[type=range] {
          position: absolute; width: 100%;
          height: ${THUMB_H}px; top: 0;
          background: transparent; -webkit-appearance: none;
          pointer-events: none; margin: 0;
        }
        .dual-range input[type=range]::-webkit-slider-runnable-track {
          height: ${TRACK_H}px;
        }
        .dual-range input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 6px; height: ${THUMB_H}px;
          margin-top: ${-(THUMB_H - TRACK_H) / 2}px;
          border-radius: 2px; pointer-events: all; cursor: ew-resize; border: none;
        }
        .dual-range input[type=range]::-moz-range-track {
          height: ${TRACK_H}px;
        }
        .dual-range input[type=range]::-moz-range-thumb {
          width: 6px; height: ${THUMB_H}px;
          border-radius: 2px; pointer-events: all; cursor: ew-resize; border: none;
        }
        .dual-range input[type=range]:nth-child(1)::-webkit-slider-thumb { background: ${color}; }
        .dual-range input[type=range]:nth-child(2)::-webkit-slider-thumb { background: ${color}; }
        .dual-range input[type=range]:nth-child(1)::-moz-range-thumb { background: ${color}; }
        .dual-range input[type=range]:nth-child(2)::-moz-range-thumb { background: ${color}; }
      `}</style>

      {/* Track background — vertically centered */}
      <div style={{
        position: 'absolute',
        top: '50%', transform: 'translateY(-50%)',
        left: 0, right: 0, height: TRACK_H,
        background: 'var(--bg-3)', borderRadius: 2,
        pointerEvents: 'none',
      }} />
      {/* Track fill between handles */}
      <div style={{
        position: 'absolute',
        top: '50%', transform: 'translateY(-50%)',
        height: TRACK_H, borderRadius: 2,
        background: color,
        left: `${pct(valueIn)}%`,
        right: `${100 - pct(valueOut)}%`,
        pointerEvents: 'none',
      }} />

      <div className="dual-range" style={{ position: 'absolute', inset: 0 }}>
        <input type="range" min={min} max={max} value={valueIn}
          onChange={e => { const v = +e.target.value; if (v <= valueOut) onChangeIn(v); }}
        />
        <input type="range" min={min} max={max} value={valueOut}
          onChange={e => { const v = +e.target.value; if (v >= valueIn) onChangeOut(v); }}
        />
      </div>
    </div>
  );
}

// ─── Clip editor modal ────────────────────────────────────────────────────────

function ClipEditorModal({ steps, clips, onClipsChange, onClose }) {
  const [local, setLocal] = useState(() => clips.map(c => ({ ...c })));
  const total = steps.length;

  const update = (id, patch) => setLocal(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const add = () => setLocal(prev => [...prev, { id: newClipId(), in: 0, out: total - 1 }]);
  const remove = (id) => setLocal(prev => prev.filter(c => c.id !== id));
  const reset = () => setLocal([{ id: newClipId(), in: 0, out: total - 1 }]);

  // Sort clips by start position for display
  const sorted = [...local].sort((a, b) => a.in - b.in);

  // Total steps across all clips
  const totalSelected = local.reduce((sum, c) => sum + (c.out - c.in + 1), 0);

  const apply = () => { onClipsChange(local); onClose(); };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}
    >
      <div style={{ width: 640, maxHeight: '85vh', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>Edit Clip Ranges</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 12 }}>{totalSelected} of {total} steps selected</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
        </div>

        {/* Full timeline overview */}
        <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <Timeline steps={steps} clips={sorted} height={32} />
        </div>

        {/* Clip list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
              No clips — add one below
            </div>
          )}
          {sorted.map((clip, ci) => {
            const color = clipColor(ci);
            const dur = clip.out - clip.in + 1;
            const t0 = steps[clip.in]?.timestamp;
            const t1 = steps[clip.out]?.timestamp;
            const wallMs = t0 && t1 ? new Date(t1) - new Date(t0) : null;
            return (
              <div key={clip.id} style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 6, border: `1px solid ${color}44` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: color, fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14 }}>[</span>
                    Clip {ci + 1}
                    <span style={{ color: color, fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14 }}>]</span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {clip.in} → {clip.out} &nbsp;·&nbsp; {dur} steps{wallMs ? ` · ${fmt(wallMs)}` : ''}
                  </span>
                  {sorted.length > 1 && (
                    <button onClick={() => remove(clip.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>
                      ✕
                    </button>
                  )}
                </div>

                <DualRangeSlider
                  min={0} max={total - 1}
                  valueIn={clip.in} valueOut={clip.out}
                  color={color}
                  onChangeIn={v => update(clip.id, { in: v })}
                  onChangeOut={v => update(clip.id, { out: v })}
                />

                {/* Numeric inputs for precision */}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>In (step)</div>
                    <input type="number" min={0} max={clip.out} value={clip.in}
                      onChange={e => { const v = Math.max(0, Math.min(+e.target.value, clip.out)); update(clip.id, { in: v }); }}
                      style={{ width: '100%', padding: '3px 6px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Out (step)</div>
                    <input type="number" min={clip.in} max={total - 1} value={clip.out}
                      onChange={e => { const v = Math.max(clip.in, Math.min(+e.target.value, total - 1)); update(clip.id, { out: v }); }}
                      style={{ width: '100%', padding: '3px 6px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Steps</div>
                    <div style={{ padding: '3px 6px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {dur}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-2)', flexShrink: 0 }}>
          <button onClick={add}
            style={{ padding: '7px 14px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
            + Add clip
          </button>
          <button onClick={reset}
            style={{ padding: '7px 14px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
            Full session
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
            Cancel
          </button>
          <button onClick={apply}
            style={{ padding: '7px 18px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Apply
          </button>
        </div>
      </div>
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

// ─── Live animated preview ────────────────────────────────────────────────────

const LivePreview = forwardRef(function LivePreview({ stepsRef, clips, scale, renderMode }, ref) {
  const [currentEvent, setCurrentEvent] = useState(null);
  const [history, setHistory] = useState([]);
  const previewDomRef = useRef(null);

  const executeStep = useCallback((step) => {
    if (!step || SKIP_KINDS.has(step.kind)) return;
    setCurrentEvent(step);
    setHistory(prev => {
      if (prev.find(s => s.index === step.index)) return prev;
      return [...prev, step];
    });
  }, []);

  const resetState = useCallback(() => {
    setCurrentEvent(null);
    setHistory([]);
  }, []);

  const clippedStepsRef = useRef([]);
  const clipsKey = JSON.stringify(clips?.map(c => `${c.in}-${c.out}`));
  useEffect(() => {
    if (!stepsRef.current.length) return;
    const all = stepsRef.current;
    clippedStepsRef.current = clips && clips.length > 0
      ? clips.flatMap(c => all.slice(c.in, c.out + 1))
      : all;
    resetState();
    if (clippedStepsRef.current.length > 0) executeStep(clippedStepsRef.current[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipsKey, stepsRef.current.length]);

  const animator = useTimedAnimator({
    steps: clippedStepsRef,
    executeStep,
    resetState,
    initialDuration: 700,
    initialMode: 'realtime',
  });

  // Expose capture API to ExportShell.
  useImperativeHandle(ref, () => ({
    get previewEl() { return previewDomRef.current; },
    get steps() { return clippedStepsRef.current; },
    get timing() {
      return {
        mode: animator.mode,
        animationDuration: animator.animationDuration,
        playbackSpeed: animator.playbackSpeed,
        compressionFactor: animator.compressionFactor,
      };
    },
    animator,
    scrubTo: animator.scrubTo,
  }), [animator]);

  const filteredHistory = useMemo(() => history.filter(s => !SKIP_KINDS.has(s.kind)), [history]);

  // After each render, scroll the preview frame to the bottom.
  // previewDomRef is overflow:scroll but user scroll is blocked via onWheel/onTouchMove.
  useEffect(() => {
    if (!previewDomRef.current) return;
    previewDomRef.current.scrollTop = previewDomRef.current.scrollHeight;
  });

  const showIndicator = animator.isPlaying && currentEvent &&
    currentEvent.index === filteredHistory[filteredHistory.length - 1]?.index;
  const nextStep = clippedStepsRef.current[animator.currentStep + 1];
  const indicatorMsg = showIndicator && nextStep ? getProcessingMessage(nextStep.kind) : null;

  const displayHistory = renderMode === 'stream'
    ? filteredHistory.slice(-1)
    : renderMode === 'focused'
    ? filteredHistory.slice(-3)
    : filteredHistory;

  const scaledW = Math.round(900 * scale);
  const scaledH = Math.round(600 * scale);
  const total = animator.totalSteps;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Transport bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <button
          onClick={animator.isPlaying ? animator.pause : animator.play}
          style={{ padding: '4px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
        >
          {animator.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={animator.reset}
          style={{ padding: '4px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
        >
          ↺
        </button>

        {/* Trackbar */}
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={animator.currentStep}
          onChange={e => animator.scrubTo(+e.target.value)}
          style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />

        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 52, textAlign: 'right' }}>
          {animator.currentStep + 1}/{total}
        </span>
      </div>

      {/* Speed controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <select
          value={animator.mode}
          onChange={e => animator.setMode(e.target.value)}
          style={{ padding: '2px 6px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', fontSize: 11 }}
        >
          <option value="realtime">Real-time</option>
          <option value="fixed">Fixed</option>
          <option value="compressed">Compressed</option>
        </select>

        {animator.mode === 'realtime' && (
          <div style={{ display: 'flex', gap: 3 }}>
            {[0.25, 0.5, 1, 2, 4, 8].map(v => (
              <button key={v} onClick={() => animator.setPlaybackSpeed(v)}
                style={{ padding: '2px 6px', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', background: animator.playbackSpeed === v ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${animator.playbackSpeed === v ? 'var(--accent)' : 'var(--border)'}`, color: animator.playbackSpeed === v ? 'white' : 'var(--text-muted)' }}>
                {v}×
              </button>
            ))}
          </div>
        )}
        {animator.mode === 'fixed' && (
          <div style={{ display: 'flex', gap: 3 }}>
            {[200, 500, 700, 1000, 2000].map(v => (
              <button key={v} onClick={() => animator.setAnimationDuration(v)}
                style={{ padding: '2px 6px', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', background: animator.animationDuration === v ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${animator.animationDuration === v ? 'var(--accent)' : 'var(--border)'}`, color: animator.animationDuration === v ? 'white' : 'var(--text-muted)' }}>
                {v < 1000 ? `${v}ms` : `${v/1000}s`}
              </button>
            ))}
          </div>
        )}
        {animator.mode === 'compressed' && (
          <div style={{ display: 'flex', gap: 3 }}>
            {[5, 10, 25, 50].map(v => (
              <button key={v} onClick={() => animator.setCompressionFactor(v)}
                style={{ padding: '2px 6px', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', background: animator.compressionFactor === v ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${animator.compressionFactor === v ? 'var(--accent)' : 'var(--border)'}`, color: animator.compressionFactor === v ? 'white' : 'var(--text-muted)' }}>
                ×{v}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scaled preview viewport — fixed size, no scroll, clips exactly like the video frame */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
        <div style={{ width: scaledW, height: scaledH, flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 4 }}>
          {/* Inner 900×600 — scaled down, scrolls programmatically, user scroll blocked */}
          <div
            ref={previewDomRef}
            onWheel={e => e.preventDefault()}
            onTouchMove={e => e.preventDefault()}
            style={{
              width: 900,
              height: 600,
              transformOrigin: 'top left',
              transform: `scale(${scale})`,
              overflowY: 'scroll',
              overflowX: 'hidden',
              background: 'var(--bg-0)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            className="preview-frame"
          >
            <div style={{ padding: '12px 8px 16px' }}>
              {displayHistory.map((step) => (
                <StageRenderer
                  key={step.index}
                  step={step}
                  isCurrent={step.index === currentEvent?.index}
                  isSearchMatch={false}
                />
              ))}
              <ProcessingIndicator visible={!!indicatorMsg} message={indicatorMsg} />
            </div>
          </div>
          <style>{`
            .preview-frame::-webkit-scrollbar { display: none; }
          `}</style>
        </div>
      </div>
    </div>
  );
});

// ─── Video preview modal ──────────────────────────────────────────────────────

function VideoPreviewModal({ url, name, format, onClose }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)', overflow: 'hidden', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, fontFamily: 'var(--font-mono)' }}>{name}</span>
          <a href={url} download={name}
            style={{ padding: '5px 14px', background: 'var(--green)', color: 'var(--bg-0)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            ↓ Download
          </a>
          <button onClick={onClose}
            style={{ width: 26, height: 26, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
        {/* Media */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {format === 'gif' ? (
            <img src={url} alt={name} style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain', display: 'block' }} />
          ) : (
            <video src={url} controls style={{ maxWidth: '85vw', maxHeight: '80vh', display: 'block' }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export shell (shared by session and agent export pages) ──────────────────

export function ExportShell({ steps: initialSteps, sessionId, backTo, filePrefix }) {
  const navigate = useNavigate();
  const stepsRef = useRef(initialSteps ?? []);
  const livePreviewRef = useRef(null);

  const [clips, setClips] = useState(() => [{ id: newClipId(), in: 0, out: Math.max(0, (initialSteps?.length ?? 1) - 1) }]);
  const [showClipEditor, setShowClipEditor] = useState(false);
  const [scale, setScale] = useState(1);
  const [renderMode, setRenderMode] = useState('scroll');

  const [format, setFormat] = useState('mp4');
  const [gifQuality, setGifQuality] = useState(10);
  const [vidWidth, setVidWidth] = useState(900);
  const [phase, setPhase] = useState('idle');
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureFrame, setCaptureFrame] = useState(0);   // frames captured so far
  const [captureTotal, setCaptureTotal] = useState(0);   // total frames to capture
  const [encodeProgress, setEncodeProgress] = useState(0); // 0..1
  const [encodeStage, setEncodeStage] = useState('');      // 'writing' | 'palette' | 'encoding'
  const [encodeWritten, setEncodeWritten] = useState(0);   // frames written to VFS
  const [encodeEncodedSec, setEncodeEncodedSec] = useState(0); // seconds encoded so far
  const [encodeTotalSec, setEncodeTotalSec] = useState(0);     // total video duration
  const [encodeElapsed, setEncodeElapsed] = useState(0);
  const [encodeFrameCount, setEncodeFrameCount] = useState(0);
  const lastProgressRef = useRef(0); // timestamp of last progress event, for stall detection
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState('');
  const [exportError, setExportError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const encodeStartRef = useRef(null);

  // Keep stepsRef in sync if steps prop changes (shouldn't happen after mount, but be safe)
  useEffect(() => {
    if (initialSteps) {
      stepsRef.current = initialSteps;
      setClips([{ id: newClipId(), in: 0, out: initialSteps.length - 1 }]);
    }
  }, [initialSteps]);

  // Tick elapsed time via rAF during encoding — more reliable than setInterval
  // when the main thread is under load from WASM progress events.
  useEffect(() => {
    if (phase !== 'encoding') return;
    encodeStartRef.current = Date.now();
    let rafId;
    const tick = () => {
      setEncodeElapsed(Math.round((Date.now() - encodeStartRef.current) / 1000));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  const steps = stepsRef.current;
  const totalSteps = steps.length;
  const hasClip = clips.length > 0 && clips.every(c => c.in <= c.out);
  const clipLength = clips.reduce((sum, c) => sum + (c.out - c.in + 1), 0);

  const estimatedDuration = useMemo(() => {
    if (!hasClip || !steps.length) return 0;
    // Sum wall-clock duration across all clips
    return clips.reduce((sum, c) => {
      const t0 = steps[c.in]?.timestamp;
      const t1 = steps[c.out]?.timestamp;
      return sum + ((t0 && t1) ? new Date(t1) - new Date(t0) : (c.out - c.in + 1) * 700);
    }, 0);
  }, [steps, clips, hasClip]);

  const doExport = useCallback(async () => {
    if (!hasClip) return;
    setPhase('capturing');
    setCaptureProgress(0);
    setCaptureFrame(0);
    setCaptureTotal(0);
    setEncodeProgress(0);
    setEncodeFrameCount(0);
    setExportError(null);
    setDownloadUrl(null);

    try {
      const preview = livePreviewRef.current;
      if (!preview?.previewEl) throw new Error('Preview not ready — please wait for the session to load.');

      // Seed total before capture starts so the display is meaningful immediately
      const INDICATOR_HOLD = 2; // matches captureFrames.js INDICATOR_HOLD_FRAMES
      const visualSteps = preview.steps.filter(s => !['session-header','local-command-output','queue-op'].includes(s.kind));
      setCaptureTotal(visualSteps.length * (1 + INDICATOR_HOLD));

      let frameIdx = 0;
      const { frames, steps: capturedSteps } = await captureFrames({
        previewEl: preview.previewEl,
        steps: preview.steps,
        animatorRef: preview.animator,
        onProgress: p => {
          frameIdx = Math.round(p * visualSteps.length * (1 + INDICATOR_HOLD));
          setCaptureFrame(frameIdx);
          setCaptureProgress(p);
        },
      });

      if (!frames.length) throw new Error('No frames captured — clip range may contain only skipped steps.');

      const timing = preview.timing;
      setEncodeFrameCount(frames.length);
      setPhase('encoding');
      setEncodeElapsed(0);
      setEncodeStage('writing');
      setEncodeWritten(0);
      setEncodeEncodedSec(0);
      setEncodeTotalSec(0);

      const handleEncodeProgress = (p) => {
        if (!p) return;
        lastProgressRef.current = Date.now();
        setEncodeStage(p.stage ?? '');
        if (p.stage === 'writing') setEncodeWritten(p.framesDone ?? 0);
        if (p.stage === 'encoding' || p.stage === 'palette') {
          setEncodeProgress(p.ratio ?? 0);
          setEncodeEncodedSec(p.encodedSec ?? 0);
          setEncodeTotalSec(p.totalSec ?? 0);
        }
      };
      lastProgressRef.current = Date.now();

      let blob;
      if (format === 'gif') {
        blob = await encodeGif({ frames, steps: capturedSteps, timing, quality: gifQuality, onProgress: handleEncodeProgress });
      } else if (format === 'mp4') {
        blob = await encodeMp4({ frames, steps: capturedSteps, timing, width: vidWidth, onProgress: handleEncodeProgress });
      } else {
        blob = await encodeWebm({ frames, steps: capturedSteps, timing, width: vidWidth, onProgress: handleEncodeProgress });
      }

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(`${filePrefix ?? 'session'}-${clips.length}clip${clips.length !== 1 ? 's' : ''}.${format}`);
      setPhase('done');
      setShowPreview(true);
    } catch (e) {
      setExportError(e.message || String(e));
      setPhase('error');
    }
  }, [hasClip, format, gifQuality, vidWidth, filePrefix, clips]);

  const isExporting = phase === 'capturing' || phase === 'encoding';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-0)' }}>

      {showClipEditor && (
        <ClipEditorModal
          steps={steps}
          clips={clips}
          onClipsChange={setClips}
          onClose={() => setShowClipEditor(false)}
        />
      )}

      {showPreview && downloadUrl && (
        <VideoPreviewModal
          url={downloadUrl}
          name={downloadName}
          format={format}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => backTo ? navigate(backTo) : navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}>
          ←
        </button>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Export</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{sessionId?.slice(0, 16)}</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{totalSteps} steps</div>
        <ThemeToggle />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel — controls */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Clip range CTA */}
          <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {/* Timeline overview — click to open editor */}
            <button
              onClick={() => setShowClipEditor(true)}
              style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              title="Click to edit clip ranges"
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Clip Ranges</span>
                <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>✎ Edit</span>
              </div>
              <Timeline steps={steps} clips={clips} height={36} />
            </button>

            {/* Clip summary pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, justifyContent: 'center' }}>
              {clips.map((c, ci) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 7px', background: `${clipColor(ci)}22`, border: `1px solid ${clipColor(ci)}66`, borderRadius: 10, fontSize: 11, color: clipColor(ci), fontFamily: 'var(--font-mono)' }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>[</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{c.in}–{c.out}</span>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>]</span>
                </div>
              ))}
              {clips.length === 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No clips — click Edit to add</span>
              )}
            </div>

            {/* Summary row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--text-muted)' }}>{clips.length} clip{clips.length !== 1 ? 's' : ''} · {clipLength} steps</span>
              <span style={{ color: 'var(--text-muted)' }}>{fmt(estimatedDuration)}</span>
            </div>
          </div>

          {/* Export settings */}
          <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Export Settings</div>

            {/* Format */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {[['mp4','MP4'],['webm','WebM'],['gif','GIF']].map(([val, label]) => (
                <button key={val} onClick={() => setFormat(val)}
                  style={{ flex: 1, padding: '5px 0', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: format === val ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${format === val ? 'var(--accent)' : 'var(--border)'}`, color: format === val ? 'white' : 'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Render mode */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Render mode</div>
                {RENDER_MODES.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="renderMode" value={m.id} checked={renderMode === m.id}
                      onChange={() => setRenderMode(m.id)}
                      style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.desc}</div>
                    </div>
                  </label>
                ))}
              </div>


              {/* Scale */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Scale</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[[0.5,'0.5×'],[0.75,'0.75×'],[1,'1×']].map(([v, lbl]) => (
                    <button key={v} onClick={() => setScale(v)}
                      style={{ flex: 1, padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: scale === v ? 'var(--accent-dim)' : 'var(--bg-2)', border: `1px solid ${scale === v ? 'var(--accent)' : 'var(--border)'}`, color: scale === v ? 'white' : 'var(--text-muted)' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  Output: {vidWidth}×{Math.round(vidWidth * 2 / 3)}px
                </div>
              </div>

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
          </div>
        </div>

        {/* Right panel — live preview + export */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <LivePreview
              ref={livePreviewRef}
              stepsRef={stepsRef}
              clips={clips}
              scale={scale}
              renderMode={renderMode}
            />
          </div>

          {/* Export footer */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-1)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>

            {(isExporting || phase === 'done') && (
              <div style={{ marginBottom: 12 }}>

                {/* Phase label + detail */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {phase === 'capturing' ? '① Capturing preview frames'
                      : phase === 'encoding' ? `② Encoding ${format.toUpperCase()}`
                      : '✓ Export complete'}
                  </span>
                  {phase === 'capturing' && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {Math.round(captureProgress * 100)}%
                    </span>
                  )}
                  {phase === 'encoding' && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {encodeElapsed > 0 ? `${encodeElapsed}s elapsed` : '…'}
                    </span>
                  )}
                </div>

                {/* Detail line */}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                  {phase === 'capturing' && captureTotal > 0 &&
                    `Frame ${Math.min(captureFrame, captureTotal)} of ${captureTotal} — screenshotting live preview`}
                  {phase === 'encoding' && encodeStage === 'writing' &&
                    `Writing ${encodeWritten} / ${encodeFrameCount} frames to VFS…`}
                  {phase === 'encoding' && encodeStage === 'palette' &&
                    `Generating GIF colour palette from ${encodeFrameCount} frames… (${encodeTotalSec > 0 ? `${encodeTotalSec.toFixed(1)}s video` : ''})`}
                  {phase === 'encoding' && encodeStage === 'encoding' && (
                    `Encoding ${encodeFrameCount} frames → ${format.toUpperCase()} ${vidWidth}px · ${encodeTotalSec > 0 ? `${encodeTotalSec.toFixed(1)}s video` : ''}${encodeProgress >= 0.99 ? ' · finalising…' : ''}`
                  )}
                  {phase === 'encoding' && !encodeStage &&
                    `Preparing ${encodeFrameCount} frames…`}
                  {phase === 'done' && downloadUrl &&
                    `${encodeFrameCount} frames encoded · ${encodeTotalSec > 0 ? `${encodeTotalSec.toFixed(1)}s video · ` : ''}ready to preview or download`}
                </div>

                {/* Stall reassurance — shown when ffmpeg goes quiet for >4s */}
                {phase === 'encoding' && encodeElapsed - Math.round((Date.now() - lastProgressRef.current) / 1000) < -4 && (
                  <div style={{ fontSize: 10, color: 'var(--yellow)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ animation: 'pulse-dot 1.2s ease-in-out infinite', display: 'inline-block' }}>●</span>
                    Still encoding — ffmpeg is working, no progress events received recently
                    <style>{`@keyframes pulse-dot { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
                  </div>
                )}

                {/* Capture phase: determinate bar */}
                {phase === 'capturing' && (
                  <div style={{ background: 'var(--bg-3)', borderRadius: 2, height: 5 }}>
                    <div style={{ width: `${Math.round(captureProgress * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.15s' }} />
                  </div>
                )}

                {/* Encoding phase — all stages now determinate (VFR approach = O(frames)) */}
                {phase === 'encoding' && (
                  <div style={{ background: 'var(--bg-3)', borderRadius: 2, height: 5, overflow: 'hidden', position: 'relative' }}>
                    {(encodeStage === 'encoding' || encodeStage === 'palette') && encodeProgress > 0 ? (
                      <div style={{
                        width: `${Math.round(encodeProgress * 100)}%`,
                        height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s',
                      }} />
                    ) : encodeStage === 'writing' && encodeFrameCount > 0 ? (
                      <div style={{
                        width: `${Math.round((encodeWritten / encodeFrameCount) * 100)}%`,
                        height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.1s',
                      }} />
                    ) : (
                      <>
                        <div style={{
                          position: 'absolute', height: '100%', width: '35%',
                          background: 'var(--accent)', borderRadius: 2,
                          animation: 'encode-sweep 1.4s ease-in-out infinite',
                        }} />
                        <style>{`@keyframes encode-sweep { 0% { left: -35%; } 100% { left: 135%; } }`}</style>
                      </>
                    )}
                  </div>
                )}

                {/* Done: full green bar */}
                {phase === 'done' && (
                  <div style={{ background: 'var(--bg-3)', borderRadius: 2, height: 6 }}>
                    <div style={{ width: '100%', height: '100%', background: 'var(--green)', borderRadius: 2 }} />
                  </div>
                )}
              </div>
            )}

            {exportError && (
              <div style={{ fontSize: 12, color: 'var(--red)', background: 'rgba(248,81,73,0.1)', padding: '7px 12px', borderRadius: 4, marginBottom: 10 }}>
                {exportError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {phase === 'done' && downloadUrl ? (
                <>
                  <button onClick={() => setShowPreview(true)}
                    style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'white' }}>
                    ▶ Preview {format.toUpperCase()}
                  </button>
                  <a href={downloadUrl} download={downloadName}
                    style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', background: 'var(--green)', color: 'var(--bg-0)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    ↓ Download
                  </a>
                  <button onClick={() => { setDownloadUrl(null); setPhase('idle'); setShowPreview(false); }}
                    style={{ padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
                    Re-export
                  </button>
                </>
              ) : (
                <button onClick={doExport} disabled={!hasClip || isExporting}
                  style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: (!hasClip || isExporting) ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-sm)', background: (!hasClip || isExporting) ? 'var(--bg-3)' : 'var(--accent-dim)', border: `1px solid ${(!hasClip || isExporting) ? 'var(--border)' : 'var(--accent)'}`, color: (!hasClip || isExporting) ? 'var(--text-muted)' : 'white', opacity: !hasClip ? 0.5 : 1 }}>
                  {isExporting ? 'Exporting…'
                    : !hasClip ? 'Set clip range first'
                    : `Export ${format.toUpperCase()} — ${clipLength} steps`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main session export page ─────────────────────────────────────────────────

export default function ExportEditorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [steps, setSteps] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      setNeedsPermission(false);
      try {
        const cache = await loadSessionsCache();
        if (!cache) throw new Error('No sessions cache found. Please reconnect your .claude folder.');

        let found = null;
        let pid = null;
        for (const project of cache.projects) {
          found = project.sessions.find(s => s.id === sessionId);
          if (found) { pid = project.id; break; }
        }
        if (!found) throw new Error('Session not found in cache. Try refreshing on the picker page.');

        let lines = found.lines;
        if (!lines || lines.length === 0) {
          const handle = await getSavedSessionsDirectory();
          if (!handle) { if (!cancelled) { setNeedsPermission(true); setLoading(false); } return; }
          lines = await loadFullSession(handle, pid, sessionId);
        }

        if (!lines || lines.length === 0) throw new Error('Session file is empty or unreadable.');
        const builtSteps = buildSteps(parseSession(lines));
        if (!cancelled) { setSteps(builtSteps); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setLoadError(e.message); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
      Loading session…
    </div>
  );
  if (needsPermission) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--text-secondary)' }}>
      <div>Directory access required to load session.</div>
      <button onClick={() => navigate('/')} style={{ padding: '6px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer' }}>← Back to picker</button>
    </div>
  );
  if (loadError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--red)' }}>
      <div>{loadError}</div>
      <button onClick={() => navigate(-1)} style={{ padding: '6px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer' }}>← Back</button>
    </div>
  );

  return (
    <ExportShell
      steps={steps}
      sessionId={sessionId}
      backTo={`/replay/${sessionId}`}
      filePrefix={`session-${sessionId.slice(0, 8)}`}
    />
  );
}
