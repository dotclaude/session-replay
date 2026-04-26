import React, { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { parseSession } from '../lib/parser/parseSession.js';
import { buildSteps } from '../lib/parser/buildSteps.js';
import { buildComposition } from '../lib/editor/buildComposition.js';
import { compositionReducer, INITIAL_STATE } from '../lib/editor/compositionReducer.js';
import { useTimedAnimator } from '../lib/stepAnimator/useTimedAnimator.js';
import EditorShell from '../components/editor/EditorShell.jsx';
import EditorHeader from '../components/editor/EditorHeader.jsx';
import EditorCanvas from '../components/editor/EditorCanvas.jsx';
import EditorProperties from '../components/editor/EditorProperties.jsx';
import EditorTimeline from '../components/editor/EditorTimeline.jsx';
import ExportModalEditor from '../components/editor/ExportModalEditor.jsx';

export default function EditorPage() {
  const { sessionId } = useParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [mode, setMode] = useState('edit');
  const [activeTool, setActiveTool] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);

  const stepsRef = useRef({ current: [] });
  const compositionRef = useRef(INITIAL_STATE);

  const [composition, dispatch] = useReducer(compositionReducer, INITIAL_STATE);

  // Keep compositionRef current so executeStep can read it without stale closure.
  useEffect(() => { compositionRef.current = composition; }, [composition]);

  // ── Session load ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetch(`/api/sessions/${sessionId}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(lines => {
        const events = parseSession(lines);
        const steps = buildSteps(events);
        stepsRef.current = steps;
        const clips = buildComposition(steps);
        dispatch({ type: 'INIT_SESSION', payload: { sessionId, clips } });
        if (steps.length) setCurrentStep(steps[0]);
        setLoading(false);
      })
      .catch(e => { setLoadError(e.message); setLoading(false); });
  }, [sessionId]);

  // ── Ordered steps for animator (sorted by startMs, follows composition order) ──
  const orderedStepsRef = useRef([]);
  useEffect(() => {
    if (!stepsRef.current.length || !composition.clips.length) return;
    const sorted = [...composition.clips].sort((a, b) => a.startMs - b.startMs);
    orderedStepsRef.current = sorted.map(c => stepsRef.current[c.stepIndex]).filter(Boolean);
  }, [composition.clips]);

  // ── Step executor ───────────────────────────────────────────────────────────
  const executeStep = useCallback((step) => {
    if (!step) return;
    setCurrentStep(step);
    const comp = compositionRef.current;
    const clip = comp.clips.find(c => c.stepIndex === step.index);
    if (clip) dispatch({ type: 'SET_PLAYHEAD', payload: { ms: clip.startMs } });
  }, []);

  const resetState = useCallback(() => {
    const first = orderedStepsRef.current[0];
    if (first) setCurrentStep(first);
    dispatch({ type: 'SET_PLAYHEAD', payload: { ms: 0 } });
  }, []);

  // useTimedAnimator expects a ref where ref.current is the steps array
  const animStepsRef = useRef([]);
  useEffect(() => {
    animStepsRef.current = orderedStepsRef.current;
  }, [composition.clips]); // reorder when clips change

  const animator = useTimedAnimator({
    steps: animStepsRef,
    executeStep,
    resetState,
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          animator.isPlaying ? animator.pause() : animator.play();
          break;
        case 'z':
        case 'Z':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
          }
          break;
        case 's':
        case 'S':
          if (composition.selectedClipId) {
            dispatch({ type: 'SPLIT_CLIP', payload: { clipId: composition.selectedClipId, atMs: composition.playheadMs } });
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (composition.selectedClipId) {
            dispatch({ type: 'DELETE_CLIP', payload: { clipId: composition.selectedClipId } });
          } else if (composition.selectedAnnotationId) {
            dispatch({ type: 'DELETE_ANNOTATION', payload: { annotationId: composition.selectedAnnotationId } });
          }
          break;
        case 'e':
        case 'E':
          if (e.metaKey || e.ctrlKey) { e.preventDefault(); setShowExport(true); }
          break;
        default: break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [animator, composition.selectedClipId, composition.selectedAnnotationId, composition.playheadMs]);

  // ── Scrub to step via timeline ──────────────────────────────────────────────
  const scrubToMs = useCallback((ms) => {
    dispatch({ type: 'SET_PLAYHEAD', payload: { ms } });
    // Find clip closest to ms
    const clip = composition.clips
      .filter(c => !c.muted)
      .reduce((best, c) => {
        const dist = Math.abs(c.startMs - ms);
        return dist < Math.abs((best?.startMs ?? Infinity) - ms) ? c : best;
      }, null);
    if (clip != null) {
      const step = stepsRef.current[clip.stepIndex];
      if (step) {
        animator.scrubTo(orderedStepsRef.current.indexOf(step));
      }
    }
  }, [composition.clips, animator]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', background: 'var(--bg-0)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
        <div style={{ color: 'var(--red)' }}>Failed to load session</div>
        <div>{loadError}</div>
      </div>
    );
  }

  return (
    <>
    {showExport && (
      <ExportModalEditor
        composition={composition}
        steps={stepsRef.current}
        sessionId={sessionId}
        onClose={() => setShowExport(false)}
      />
    )}
    <EditorShell
      header={
        <EditorHeader
          sessionId={sessionId}
          mode={mode}
          onModeChange={setMode}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onExport={() => setShowExport(true)}
        />
      }
      canvas={
        <EditorCanvas
          step={currentStep}
          annotations={composition.annotations}
          playheadMs={composition.playheadMs}
          activeTool={activeTool}
          activeColor="#f778ba"
          selectedAnnotationId={composition.selectedAnnotationId}
          dispatch={dispatch}
        />
      }
      props={
        <EditorProperties
          composition={composition}
          dispatch={dispatch}
        />
      }
      timeline={
        <EditorTimeline
          composition={composition}
          dispatch={dispatch}
          animator={animator}
          onScrubMs={scrubToMs}
          loading={loading}
        />
      }
    />
    </>
  );
}
