const MAX_HISTORY = 50;

function totalDuration(clips) {
  if (!clips.length) return 0;
  return Math.max(...clips.map(c => c.startMs + c.durationMs));
}

function snapshot(state) {
  return { clips: state.clips, annotations: state.annotations };
}

function pushHistory(state) {
  const past = [...state.past, snapshot(state)];
  return { past: past.slice(-MAX_HISTORY), future: [] };
}

export const INITIAL_STATE = {
  sessionId: null,
  clips: [],
  annotations: [],
  selectedClipId: null,
  selectedAnnotationId: null,
  playheadMs: 0,
  isPlaying: false,
  timelineZoom: 1.0,
  timelineScrollMs: 0,
  totalDurationMs: 0,
  mode: 'edit',
  past: [],
  future: [],
};

export function compositionReducer(state, { type, payload }) {
  switch (type) {

    case 'INIT_SESSION': {
      const { sessionId, clips } = payload;
      return {
        ...INITIAL_STATE,
        sessionId,
        clips,
        totalDurationMs: totalDuration(clips),
      };
    }

    // ── Clip mutations ────────────────────────────────────────────────────────

    case 'MOVE_CLIP': {
      const { clipId, startMs } = payload;
      const hist = pushHistory(state);
      const clips = state.clips.map(c => c.id === clipId ? { ...c, startMs: Math.max(0, startMs) } : c);
      return { ...state, ...hist, clips, totalDurationMs: totalDuration(clips) };
    }

    case 'RESIZE_CLIP': {
      const { clipId, durationMs } = payload;
      const hist = pushHistory(state);
      const clips = state.clips.map(c => c.id === clipId ? { ...c, durationMs: Math.max(100, durationMs) } : c);
      return { ...state, ...hist, clips, totalDurationMs: totalDuration(clips) };
    }

    case 'SET_CLIP_SPEED': {
      const hist = pushHistory(state);
      const clips = state.clips.map(c =>
        c.id === payload.clipId ? { ...c, speedFactor: Math.max(0.25, Math.min(4, payload.speedFactor)) } : c
      );
      return { ...state, ...hist, clips };
    }

    case 'SET_CLIP_LABEL': {
      const hist = pushHistory(state);
      const clips = state.clips.map(c => c.id === payload.clipId ? { ...c, label: payload.label } : c);
      return { ...state, ...hist, clips };
    }

    case 'TOGGLE_CLIP_MUTE': {
      const hist = pushHistory(state);
      const clips = state.clips.map(c => c.id === payload.clipId ? { ...c, muted: !c.muted } : c);
      return { ...state, ...hist, clips };
    }

    case 'SPLIT_CLIP': {
      const { clipId, atMs } = payload;
      const clip = state.clips.find(c => c.id === clipId);
      if (!clip) return state;
      const splitAt = atMs - clip.startMs;
      if (splitAt <= 0 || splitAt >= clip.durationMs) return state;
      const hist = pushHistory(state);
      const left  = { ...clip, id: `${clip.id}-a`, durationMs: splitAt };
      const right = { ...clip, id: `${clip.id}-b`, startMs: atMs, durationMs: clip.durationMs - splitAt };
      const clips = state.clips.flatMap(c => c.id === clipId ? [left, right] : [c]);
      return { ...state, ...hist, clips, totalDurationMs: totalDuration(clips), selectedClipId: right.id };
    }

    case 'DELETE_CLIP': {
      const hist = pushHistory(state);
      const clips = state.clips.filter(c => c.id !== payload.clipId);
      return {
        ...state, ...hist, clips,
        totalDurationMs: totalDuration(clips),
        selectedClipId: state.selectedClipId === payload.clipId ? null : state.selectedClipId,
      };
    }

    // ── Annotation mutations ──────────────────────────────────────────────────

    case 'ADD_ANNOTATION': {
      const hist = pushHistory(state);
      return { ...state, ...hist, annotations: [...state.annotations, payload] };
    }

    case 'UPDATE_ANNOTATION': {
      const { annotationId, patch } = payload;
      const hist = pushHistory(state);
      const annotations = state.annotations.map(a => a.id === annotationId ? { ...a, ...patch } : a);
      return { ...state, ...hist, annotations };
    }

    case 'DELETE_ANNOTATION': {
      const hist = pushHistory(state);
      const annotations = state.annotations.filter(a => a.id !== payload.annotationId);
      return {
        ...state, ...hist, annotations,
        selectedAnnotationId: state.selectedAnnotationId === payload.annotationId ? null : state.selectedAnnotationId,
      };
    }

    // ── Ephemeral ─────────────────────────────────────────────────────────────

    case 'SELECT_CLIP':
      return { ...state, selectedClipId: payload.clipId, selectedAnnotationId: null };
    case 'SELECT_ANNOTATION':
      return { ...state, selectedAnnotationId: payload.annotationId, selectedClipId: null };
    case 'DESELECT_ALL':
      return { ...state, selectedClipId: null, selectedAnnotationId: null };
    case 'SET_PLAYHEAD':
      return { ...state, playheadMs: Math.max(0, payload.ms) };
    case 'SET_PLAYING':
      return { ...state, isPlaying: payload.isPlaying };
    case 'SET_ZOOM':
      return { ...state, timelineZoom: Math.max(0.5, Math.min(20, payload.zoom)) };
    case 'SET_SCROLL':
      return { ...state, timelineScrollMs: Math.max(0, payload.scrollMs) };
    case 'SET_MODE':
      return { ...state, mode: payload.mode };

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    case 'UNDO': {
      if (!state.past.length) return state;
      const past = [...state.past];
      const prev = past.pop();
      const future = [snapshot(state), ...state.future];
      return { ...state, ...prev, past, future };
    }

    case 'REDO': {
      if (!state.future.length) return state;
      const future = [...state.future];
      const next = future.shift();
      const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY);
      return { ...state, ...next, past, future };
    }

    default:
      return state;
  }
}
