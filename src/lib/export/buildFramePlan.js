import { getProcessingMessage } from '../utils/processingMessages.js';

const STREAM_KINDS = new Set(['assistant-text', 'tool-write', 'human']);
const STREAM_MIN_CHARS = 200;
const STREAM_CHARS_PER_FRAME = 120;

const SKIP_KINDS = new Set(['session-header', 'local-command-output', 'queue-op']);

const INDICATOR_FRAME_SEC = 0.125;
const MIN_INDICATOR_FRAMES = 3;
const MAX_INDICATOR_FRAMES = 32;

function textLengthFor(step) {
  switch (step.kind) {
    case 'assistant-text': return step.event?.text?.length || 0;
    case 'tool-write':     return step.event?.toolInput?.content?.length || 0;
    case 'human':          return step.event?.text?.length || 0;
    default:               return 0;
  }
}

function computeHoldSec(steps, index, timing) {
  const { mode, animationDuration, playbackSpeed, compressionFactor } = timing ?? {};
  const fixedSec = (animationDuration ?? 700) / Math.max(playbackSpeed ?? 1, 0.01) / 1000;
  if (!timing || mode === 'fixed') return fixedSec;
  const cur = steps[index]?.timestamp;
  const next = steps[index + 1]?.timestamp;
  if (!cur || !next) return fixedSec;
  const deltaMs = new Date(next) - new Date(cur);
  if (deltaMs <= 0) return fixedSec;
  const raw = mode === 'realtime'
    ? deltaMs / Math.max(playbackSpeed, 0.01) / 1000
    : deltaMs / Math.max(compressionFactor, 0.01) / 1000;
  return Math.min(Math.max(raw, 0.05), 60);
}

export function buildFramePlan(steps, clipIn, clipOut, timing, renderMode = 'scroll') {
  const plan = [];
  const history = [];

  for (let i = clipIn; i <= clipOut; i++) {
    const step = steps[i];
    if (!step || SKIP_KINDS.has(step.kind)) continue;
    history.push(step);

    const holdSec = computeHoldSec(steps, i, timing);
    const len = STREAM_KINDS.has(step.kind) ? textLengthFor(step) : 0;
    const isLast = (i === clipOut);

    if (len >= STREAM_MIN_CHARS) {
      const frameCount = Math.max(2, Math.ceil(len / STREAM_CHARS_PER_FRAME));
      const revealBudget = Math.min(holdSec * 0.4, 0.6);
      const revealFrameSec = revealBudget / frameCount;
      const contentSec = holdSec - revealBudget;

      for (let f = 0; f < frameCount; f++) {
        const frac = (f + 1) / frameCount;
        plan.push({
          history: [...history],
          processingMsg: null,
          revealFraction: frac,
          renderMode,
          animT: f * (revealFrameSec * 1000),
          currentFraction: frac,
          durationSec: f < frameCount - 1 ? revealFrameSec : contentSec,
          frameType: f < frameCount - 1 ? 'reveal' : 'content',
          stepIndex: i,
        });
      }
    } else {
      plan.push({
        history: [...history],
        processingMsg: null,
        revealFraction: 1,
        renderMode,
        animT: 0,
        currentFraction: 1,
        durationSec: holdSec,
        frameType: 'content',
        stepIndex: i,
      });
    }

    if (!isLast) {
      const nextStep = steps.slice(i + 1, clipOut + 1).find(s => s && !SKIP_KINDS.has(s.kind));
      const msg = nextStep ? getProcessingMessage(nextStep.kind) : null;
      if (msg) {
        const nextIdx = steps.indexOf(nextStep);
        const nextHoldSec = computeHoldSec(steps, nextIdx, timing);
        const raw = Math.ceil(nextHoldSec / INDICATOR_FRAME_SEC);
        const nFrames = Math.min(Math.max(raw, MIN_INDICATOR_FRAMES), MAX_INDICATOR_FRAMES);

        for (let f = 0; f < nFrames; f++) {
          plan.push({
            history: [...history],
            processingMsg: msg,
            revealFraction: 1,
            renderMode,
            animT: f * (INDICATOR_FRAME_SEC * 1000),
            currentFraction: 1,
            durationSec: INDICATOR_FRAME_SEC,
            frameType: 'indicator',
            stepIndex: i,
          });
        }
      }
    }
  }

  return plan;
}
