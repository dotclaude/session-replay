const DEFAULT_DURATION_MS = 700;

export function buildComposition(steps) {
  let accMs = 0;
  return steps.map(step => {
    const clip = {
      id: `clip-${step.index}`,
      stepIndex: step.index,
      kind: step.kind,
      label: step.description,
      startMs: accMs,
      durationMs: DEFAULT_DURATION_MS,
      speedFactor: 1.0,
      layerIndex: 0,
      muted: false,
    };
    accMs += DEFAULT_DURATION_MS;
    return clip;
  });
}
