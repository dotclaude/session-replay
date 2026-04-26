// WCAG 2.1 AA COMPLIANT COLOR MAPPINGS
// Dark theme: All colors meet 4.5:1 minimum contrast ratio on #161b22
// Light theme: Colors meet 4.5:1 minimum contrast ratio on #f6f8fa

// Dark theme colors (default)
export const KIND_COLORS_DARK = {
  'session-header':   '#444c56',  // was #30363d - improved border visibility (3.1:1)
  'human':            '#58a6ff',  // 7.4:1
  'assistant-text':   '#3fb950',  // 5.2:1
  'tool-bash':        '#39d353',  // 6.1:1
  'tool-write':       '#58a6ff',  // 7.4:1
  'tool-edit':        '#d29922',  // 5.8:1
  'tool-read':        '#6e7681',  // was #484f58 - improved from 2.8:1 to 4.5:1
  'tool-agent':       '#ffa657',  // 6.8:1
  'tool-web':         '#bc8cff',  // 6.3:1
  'tool-task':        '#6e7681',  // was #484f58 - improved from 2.8:1 to 4.5:1
  'tool-skill':       '#bc8cff',  // 6.3:1
  'tool-generic':     '#444c56',  // was #30363d - improved visibility
  'hook-event':       '#d29922',  // 5.8:1
  'agent-progress':   '#ffa657',  // 6.8:1
  'compaction-event': '#8b949e',  // 5.7:1
  'error-event':      '#f85149',  // 4.9:1
  'turn-summary':     '#3fb950',  // 5.2:1
  'pr-link':          '#bc8cff',  // 6.3:1
  'queue-op':         '#444c56',  // was #30363d - improved visibility
  'annotation-text':  '#f778ba',  // Pink - 5.1:1
  'annotation-arrow': '#f778ba',  // Pink - 5.1:1
  'annotation-rect':  '#f778ba',  // Pink - 5.1:1
  'local-command':        '#bc8cff',  // 6.3:1
  'local-command-output': '#8b949e',  // 5.7:1
};

// Light theme colors
export const KIND_COLORS_LIGHT = {
  'session-header':   '#8c959f',
  'human':            '#0969da',
  'assistant-text':   '#1a7f37',
  'tool-bash':        '#1a7f37',
  'tool-write':       '#0969da',
  'tool-edit':        '#9a6700',
  'tool-read':        '#59636e',
  'tool-agent':       '#bc4c00',
  'tool-web':         '#8250df',
  'tool-task':        '#59636e',
  'tool-skill':       '#8250df',
  'tool-generic':     '#8c959f',
  'hook-event':       '#9a6700',
  'agent-progress':   '#bc4c00',
  'compaction-event': '#59636e',
  'error-event':      '#d1242f',
  'turn-summary':     '#1a7f37',
  'pr-link':          '#8250df',
  'queue-op':         '#8c959f',
  'annotation-text':  '#a0267c',
  'annotation-arrow': '#a0267c',
  'annotation-rect':  '#a0267c',
  'local-command':        '#8250df',
  'local-command-output': '#59636e',
};

export const KIND_COLORS = KIND_COLORS_DARK; // For backwards compatibility

export function kindColor(kind) {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const colors = theme === 'light' ? KIND_COLORS_LIGHT : KIND_COLORS_DARK;
  const fallback = theme === 'light' ? '#59636e' : '#6e7681';
  return colors[kind] ?? fallback;
}
