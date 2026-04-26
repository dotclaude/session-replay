// Single source of truth for step-kind colors used across timeline, editor, and stage rendering.
export const KIND_COLORS = {
  'session-header':   '#30363d',
  'human':            '#58a6ff',
  'assistant-text':   '#3fb950',
  'tool-bash':        '#39d353',
  'tool-write':       '#58a6ff',
  'tool-edit':        '#d29922',
  'tool-read':        '#484f58',
  'tool-agent':       '#ffa657',
  'tool-web':         '#bc8cff',
  'tool-task':        '#484f58',
  'tool-skill':       '#bc8cff',
  'tool-generic':     '#30363d',
  'hook-event':       '#d29922',
  'agent-progress':   '#ffa657',
  'compaction-event': '#8b949e',
  'error-event':      '#f85149',
  'turn-summary':     '#3fb950',
  'pr-link':          '#bc8cff',
  'queue-op':         '#30363d',
  // annotation types
  'annotation-text':  '#f778ba',
  'annotation-arrow': '#f778ba',
  'annotation-rect':  '#f778ba',
  // local CLI commands
  'local-command': '#bc8cff',
  'local-command-output': '#8b949e',
};

export function kindColor(kind) {
  return KIND_COLORS[kind] ?? '#484f58';
}
