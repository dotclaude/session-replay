export const COLLAPSE = {
  // Inline text preview character limit (AgentProgress, ToolAgent prompt snippet)
  PREVIEW_CHARS: 32,
  // Bash output line count shown before "show N more lines"
  BASH_LINES: 5,
  // Generic tool result character preview (ToolGeneric)
  GENERIC_CHARS: 32,
  // CSS max-height for skill args fade preview (ToolSkill)
  SKILL_PREVIEW_HEIGHT: '60px',
  // Character count above which the gradient fade is shown (ToolSkill)
  SKILL_FADE_CHARS: 32,
  // Max-height of scrollable sections inside ToolModal
  MODAL_SECTION_HEIGHT: '400px',
};

export function timestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
