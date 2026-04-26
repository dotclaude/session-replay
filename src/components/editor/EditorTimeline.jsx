import React, { useRef, useEffect, useState, useCallback } from 'react';
import TimelineRuler from './TimelineRuler.jsx';
import TimelineLayer from './TimelineLayer.jsx';
import TimelineScrubber from './TimelineScrubber.jsx';

const TRACK_HEADER_W = 72;

// ── Coordinate helpers ────────────────────────────────────────────────────────
function pixelToMs(px, bodyWidth, visibleMs, scrollMs) {
  return scrollMs + (px / bodyWidth) * visibleMs;
}

function stepIndexAtMs(ms, clips) {
  if (!clips.length) return 0;
  const nonMuted = clips.filter(c => !c.muted);
  if (!nonMuted.length) return 0;
  const closest = nonMuted.reduce((best, c) => {
    return Math.abs(c.startMs - ms) < Math.abs(best.startMs - ms) ? c : best;
  });
  return closest.stepIndex;
}

// ── Transport bar ─────────────────────────────────────────────────────────────
function TransportBar({ animator, composition, dispatch }) {
  const { isPlaying, playbackSpeed, setPlaybackSpeed } = animator;
  const { playheadMs, totalDurationMs } = composition;

  function fmt(ms) {
    const s = ms / 1000;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return m > 0 ? `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}.${(s % 1).toFixed(1).slice(2)}` : `${sec}s`;
  }

  return (
    <div style={{
      height: 36,
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '6px',
      background: 'var(--bg-1)',
      flexShrink: 0,
    }}>
      {[['⏮', () => animator.reset()], ['⏪', () => animator.scrubTo(0)], [isPlaying ? '⏸' : '▶', () => isPlaying ? animator.pause() : animator.play()], ['⏩', null], ['⏭', null]].map(([icon, fn], i) => (
        <button key={i} onClick={fn || undefined}
          style={{ width: i === 2 ? 28 : 24, height: i === 2 ? 28 : 24, borderRadius: 'var(--radius-sm)', background: i === 2 ? 'var(--accent)' : 'var(--bg-2)', border: `1px solid ${i === 2 ? 'var(--accent)' : 'var(--border)'}`, color: i === 2 ? 'var(--bg-0)' : 'var(--text-secondary)', cursor: fn ? 'pointer' : 'default', opacity: fn ? 1 : 0.4, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {icon}
        </button>
      ))}

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
        <span style={{ color: 'var(--text-primary)' }}>{fmt(playheadMs)}</span> / {fmt(totalDurationMs)}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>Speed</span>
        {[0.5, 1, 2, 4].map(s => (
          <button key={s} onClick={() => setPlaybackSpeed(s)}
            style={{ height: 20, padding: '0 6px', borderRadius: 'var(--radius-sm)', background: playbackSpeed === s ? 'var(--bg-3)' : 'var(--bg-2)', border: `1px solid ${playbackSpeed === s ? 'var(--text-muted)' : 'var(--border)'}`, color: playbackSpeed === s ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '9px', cursor: 'pointer' }}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EditorTimeline({ composition, dispatch, animator, onScrubMs, loading }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { clips, annotations, selectedClipId, playheadMs, totalDurationMs, timelineZoom, timelineScrollMs } = composition;

  const visibleMs = totalDurationMs > 0 ? totalDurationMs / timelineZoom : 30000;
  const bodyWidth = containerWidth - TRACK_HEADER_W;

  // ── Zoom on Ctrl+Wheel ────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.5, Math.min(20, timelineZoom * factor));
    // Keep the point under mouse stable
    const mouseX = e.clientX - containerRef.current.getBoundingClientRect().left - TRACK_HEADER_W;
    const mouseFraction = Math.max(0, Math.min(1, mouseX / bodyWidth));
    const msAtMouse = timelineScrollMs + mouseFraction * visibleMs;
    const newVisibleMs = totalDurationMs / newZoom;
    const newScrollMs = Math.max(0, msAtMouse - mouseFraction * newVisibleMs);
    dispatch({ type: 'SET_ZOOM', payload: { zoom: newZoom } });
    dispatch({ type: 'SET_SCROLL', payload: { scrollMs: newScrollMs } });
  }, [timelineZoom, timelineScrollMs, visibleMs, totalDurationMs, bodyWidth, dispatch]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Click on layer background → move playhead ─────────────────────────────
  const handleLayerBgClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ms = pixelToMs(px, bodyWidth, visibleMs, timelineScrollMs);
    onScrubMs(Math.max(0, ms));
  }, [bodyWidth, visibleMs, timelineScrollMs, onScrubMs]);

  // ── Annotation clips (synthesized) ────────────────────────────────────────
  const annotationClips = annotations.map(ann => ({
    id: ann.id,
    stepIndex: -1,
    kind: `annotation-${ann.type}`,
    label: ann.text || ann.type,
    startMs: ann.startMs,
    durationMs: ann.durationMs,
    layerIndex: 1,
    muted: false,
    speedFactor: 1,
    _isAnnotation: true,
    _annotationId: ann.id,
  }));

  if (loading || !totalDurationMs) {
    return (
      <div ref={containerRef} style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
        {loading ? 'Loading session…' : 'No clips'}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TransportBar animator={animator} composition={composition} dispatch={dispatch} />

      <TimelineRuler
        totalDurationMs={totalDurationMs}
        zoom={timelineZoom}
        scrollMs={timelineScrollMs}
        containerWidth={containerWidth}
        trackHeaderWidth={TRACK_HEADER_W}
      />

      {/* Track area — relative for scrubber overlay */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <TimelineLayer
          label="Video"
          labelColor="var(--accent)"
          clips={clips}
          containerWidth={bodyWidth}
          visibleMs={visibleMs}
          scrollMs={timelineScrollMs}
          selectedClipId={selectedClipId}
          dispatch={dispatch}
          onBgClick={handleLayerBgClick}
        />
        {annotationClips.length > 0 && (
          <TimelineLayer
            label="Annot."
            labelColor="var(--pink, #f778ba)"
            clips={annotationClips}
            containerWidth={bodyWidth}
            visibleMs={visibleMs}
            scrollMs={timelineScrollMs}
            selectedClipId={selectedClipId}
            dispatch={dispatch}
            onBgClick={handleLayerBgClick}
            height={24}
          />
        )}

        <TimelineScrubber
          playheadMs={playheadMs}
          visibleMs={visibleMs}
          scrollMs={timelineScrollMs}
          containerWidth={containerWidth}
          trackHeaderWidth={TRACK_HEADER_W}
          onDrag={onScrubMs}
        />
      </div>

      {/* Zoom bar */}
      <div style={{
        height: 24,
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-0)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: '6px',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>Zoom</span>
        <input
          type="range" min={0.5} max={20} step={0.1}
          value={timelineZoom}
          onChange={e => dispatch({ type: 'SET_ZOOM', payload: { zoom: +e.target.value } })}
          style={{ width: 80 }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>{timelineZoom.toFixed(1)}×</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>
          Space play · S split · Del delete · ⌘Z undo · ⌘E export
        </span>
      </div>
    </div>
  );
}
