/**
 * buildFramePlan
 *
 * Given a slice of steps (clipIn..clipOut) and a frames-per-step target,
 * returns an ordered array of FrameDescriptor objects. Each descriptor says:
 *   - stepIndex: which step to render
 *   - textRevealFraction: 0..1 — how much of the "long text" to show
 *
 * Long-text steps (assistant-text, tool-write, tool-edit, human with >200 chars)
 * are expanded into multiple frames so the viewer sees content stream in rather
 * than jump.
 *
 * Returns: FrameDescriptor[]
 */

const STREAM_KINDS = new Set(['assistant-text', 'tool-write', 'human']);
const STREAM_MIN_CHARS = 200;
const STREAM_CHARS_PER_FRAME = 120; // characters revealed per frame

function textLengthFor(step) {
  switch (step.kind) {
    case 'assistant-text': return step.event?.text?.length || 0;
    case 'tool-write':     return step.event?.toolInput?.content?.length || 0;
    case 'human':          return step.event?.text?.length || 0;
    default:               return 0;
  }
}

export function buildFramePlan(steps, clipIn, clipOut) {
  const plan = [];

  for (let i = clipIn; i <= clipOut; i++) {
    const step = steps[i];
    if (!step) continue;

    const len = STREAM_KINDS.has(step.kind) ? textLengthFor(step) : 0;

    if (len >= STREAM_MIN_CHARS) {
      const frameCount = Math.max(2, Math.ceil(len / STREAM_CHARS_PER_FRAME));
      for (let f = 0; f < frameCount; f++) {
        plan.push({ stepIndex: i, textRevealFraction: (f + 1) / frameCount });
      }
    } else {
      plan.push({ stepIndex: i, textRevealFraction: 1 });
    }
  }

  return plan;
}
