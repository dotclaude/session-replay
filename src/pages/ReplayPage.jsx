import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatorControls } from '../lib/stepAnimator/index.js';
import { useTimedAnimator } from '../lib/stepAnimator/useTimedAnimator.js';
import { parseSession } from '../lib/parser/parseSession.js';
import { buildSteps } from '../lib/parser/buildSteps.js';
import { computeSessionStats } from '../lib/stats/computeSessionStats.js';
import { buildSearchIndex } from '../lib/search/buildSearchIndex.js';
import StageRenderer from '../components/stages/StageRenderer.jsx';
import SearchBar from '../components/replay/SearchBar.jsx';
import FilterBar, { ALL_KINDS } from '../components/replay/FilterBar.jsx';
import StatsPanel from '../components/replay/StatsPanel.jsx';
import SessionClock from '../components/replay/SessionClock.jsx';
import ProcessingIndicator from '../components/stages/ProcessingIndicator.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { getProcessingMessage } from '../lib/utils/processingMessages.js';

export default function ReplayPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [sessionStats, setSessionStats] = useState(null);
  const [searchIdx, setSearchIdx] = useState([]);

  // Replay state
  const [currentEvent, setCurrentEvent] = useState(null);
  const [history, setHistory] = useState([]);

  // UI state
  const [activeKinds, setActiveKinds] = useState(() => new Set(ALL_KINDS));
  const [currentTurnOnly, setCurrentTurnOnly] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [searchMatches, setSearchMatches] = useState([]);
  const [contentWidth, setContentWidth] = useState(60); // percentage

  const stepsRef = useRef([]);
  const historyRef = useRef(null);
  const stageRef = useRef(null);
  const playButtonRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sessions/${sessionId}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404
          ? 'Session file not found on disk. It may have been pruned or moved.'
          : `Server error ${r.status}`);
        return r.json();
      })
      .then(lines => {
        if (!Array.isArray(lines) || lines.length === 0) {
          throw new Error('Session file is empty or unreadable.');
        }
        const events = parseSession(lines);
        const steps = buildSteps(events);
        stepsRef.current = steps;
        setMeta({ title: steps[0]?.event?.title || sessionId.slice(0, 16), sessionId });
        setSessionStats(computeSessionStats(steps));
        setSearchIdx(buildSearchIndex(steps));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [sessionId]);

  const executeStep = useCallback((step) => {
    if (!step) return;
    setCurrentEvent(step);
    if (step.kind !== 'session-header') {
      setHistory(prev => {
        if (prev.find(s => s.index === step.index)) return prev;
        return [...prev, step];
      });
    }
  }, []);

  const resetState = useCallback(() => {
    setCurrentEvent(null);
    setHistory([]);
  }, []);

  const animator = useTimedAnimator({
    steps: stepsRef,
    executeStep,
    resetState,
    initialDuration: 700,
  });

  useEffect(() => {
    if (!loading && stepsRef.current.length > 0) {
      executeStep(stepsRef.current[0]);
      // Focus play button for keyboard navigation
      setTimeout(() => {
        if (playButtonRef.current) {
          playButtonRef.current.focus();
        }
      }, 100);
    }
  }, [loading, executeStep]);

  // Auto-scroll history to bottom
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history.length]);

  // Derive current turn start index for "current turn only" filter
  const currentTurnStart = useMemo(() => {
    if (!currentTurnOnly || !currentEvent) return 0;
    for (let i = currentEvent.index; i >= 0; i--) {
      if (history[i]?.kind === 'human') return history[i].index;
    }
    return 0;
  }, [currentTurnOnly, currentEvent, history]);

  // Filtered history
  const filteredHistory = useMemo(() =>
    history.filter(s =>
      activeKinds.has(s.kind) &&
      (!currentTurnOnly || s.index >= currentTurnStart)
    ),
    [history, activeKinds, currentTurnOnly, currentTurnStart]
  );

  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
      Loading session…
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--red)' }}>
      <div>Failed to load session: {error}</div>
      <button onClick={() => navigate('/')} style={{ padding: '6px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer' }}>
        ← Back
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-0)' }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        background: 'var(--bg-1)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        flexWrap: 'wrap',
        minHeight: 44,
      }}>
        <button onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: '2px 4px', flexShrink: 0 }}>
          ←
        </button>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.2 }}>{meta?.title}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{sessionId.slice(0, 16)}</div>
        </div>

        <SessionClock elapsedMs={animator.elapsedMs} />

        {/* Mode selector */}
        <select
          value={animator.mode}
          onChange={e => animator.setMode(e.target.value)}
          style={{ padding: '3px 6px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', fontSize: 11, flexShrink: 0 }}
        >
          <option value="fixed">Fixed speed</option>
          <option value="compressed">Compressed ×{animator.compressionFactor}</option>
          <option value="realtime">Real-time</option>
        </select>

        {animator.mode === 'compressed' && (
          <input type="range" min={2} max={50} value={animator.compressionFactor}
            onChange={e => animator.setCompressionFactor(+e.target.value)}
            style={{ width: 70, accentColor: 'var(--accent)', flexShrink: 0 }}
            title={`${animator.compressionFactor}× compression`}
          />
        )}

        {/* Search */}
        <SearchBar
          index={searchIdx}
          onMatches={setSearchMatches}
          onJump={idx => animator.scrubTo(idx)}
          onClear={() => setSearchMatches([])}
        />

        {/* Animation editor */}
        <button onClick={() => navigate(`/export/${sessionId}`)}
          style={{
            padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', flexShrink: 0,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}>
          ◎ Export
        </button>

        {/* Stats toggle */}
        <button onClick={() => setStatsOpen(o => !o)}
          style={{
            padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)', flexShrink: 0,
            background: statsOpen ? 'var(--accent-dim)' : 'var(--bg-2)',
            border: `1px solid ${statsOpen ? 'var(--accent)' : 'var(--border)'}`,
            color: statsOpen ? 'var(--bg-0)' : 'var(--text-secondary)',
          }}>
          Stats
        </button>

        {/* Width control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Content width">
            Adjust Width
          </span>
          <input
            type="range"
            min={50}
            max={80}
            step={10}
            value={contentWidth}
            onChange={e => setContentWidth(+e.target.value)}
            style={{ width: 60, accentColor: 'var(--accent)', cursor: 'pointer' }}
            title={`Content width: ${contentWidth}% (${(100 - contentWidth) / 2}%-${contentWidth}%-${(100 - contentWidth) / 2}%)`}
          />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
            {contentWidth}%
          </span>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>
          {animator.totalSteps} steps
        </div>

        {/* Theme toggle - rightmost */}
        <ThemeToggle />
      </div>

      {/* Filter bar */}
      <FilterBar
        activeKinds={activeKinds}
        onChange={setActiveKinds}
        currentTurnOnly={currentTurnOnly}
        onCurrentTurnOnly={setCurrentTurnOnly}
      />

      {/* Main area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>

        {/* Scrollable history */}
        <div ref={historyRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
          {filteredHistory.length === 0 && history.length === 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              gap: 16,
            }}>
              {/* Large play icon */}
              <div style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'var(--bg-2)',
                border: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                color: 'var(--accent)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onClick={() => animator.play()}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-3)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              role="button"
              tabIndex={0}
              aria-label="Play replay"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  animator.play();
                }
              }}>
                ▶
              </div>
              <div style={{ fontSize: 13, textAlign: 'center' }}>
                <div>Click Play or use keyboard shortcuts to begin replay</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Space: Play/Pause · ← →: Step · Home/End: Jump · Scroll: Scrub
                </div>
              </div>
            </div>
          )}
          <div ref={stageRef} style={{ width: `${contentWidth}%`, margin: '0 auto', transition: 'width 0.2s ease' }}>
            {filteredHistory.map(step => (
              <StageRenderer
                key={step.index}
                step={step}
                isCurrent={step.index === currentEvent?.index}
                isSearchMatch={searchMatchSet.has(step.index)}
              />
            ))}
            {/* Processing indicator - show when playing and at current step */}
            {(() => {
              const nextStep = stepsRef.current[animator.currentStep + 1];
              const processingMessage = nextStep ? getProcessingMessage(nextStep.kind) : 'Processing...';
              const isProcessing = animator.isPlaying && currentEvent && currentEvent.index === filteredHistory[filteredHistory.length - 1]?.index;
              return <ProcessingIndicator visible={isProcessing} message={processingMessage} />;
            })()}
          </div>
        </div>

        {/* Stats panel overlay */}
        <StatsPanel
          stats={sessionStats}
          isOpen={statsOpen}
          onClose={() => setStatsOpen(false)}
          onScrubTo={idx => animator.scrubTo(idx)}
          currentStep={animator.currentStep}
        />
      </div>

      {/* Controls bar with integrated timeline */}
      <AnimatorControls
        ref={playButtonRef}
        {...animator}
        steps={stepsRef.current}
        activeKinds={activeKinds}
        showSpeedControl
        showDurationControl={animator.mode === 'fixed'}
      />
    </div>
  );
}
