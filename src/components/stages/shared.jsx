import React, { useState } from 'react';

// ─── Collapse / expand thresholds ────────────────────────────────────────────
// Change these to adjust how much is shown before an expand option appears.
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

// ─── Shared primitives ────────────────────────────────────────────────────────

export function StageCard({ children, accent = 'var(--border)', isSearchMatch = false, style = {} }) {
  return (
    <div style={{
      margin: '4px 16px',
      borderLeft: `3px solid ${isSearchMatch ? 'var(--yellow)' : accent}`,
      background: isSearchMatch ? 'rgba(210,153,34,0.06)' : 'var(--bg-1)',
      borderRadius: '0 var(--radius) var(--radius) 0',
      overflow: 'hidden',
      boxShadow: isSearchMatch ? 'inset 0 0 0 1px rgba(210,153,34,0.2)' : 'none',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function CardHeader({ icon, label, meta, accent = 'var(--text-muted)' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--border)',
      fontSize: 11,
      color: 'var(--text-muted)',
    }}>
      {icon && <span style={{ color: accent }}>{icon}</span>}
      <span style={{ fontWeight: 600, color: accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {meta && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{meta}</span>}
    </div>
  );
}

export function CodeBlock({ children, lang }) {
  return (
    <pre style={{
      margin: 0,
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      lineHeight: 1.6,
      color: 'var(--text-primary)',
      overflowX: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {children}
    </pre>
  );
}

export function timestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Collapse / expand components ────────────────────────────────────────────

/**
 * The standard bottom-of-card expand/collapse toggle button.
 * Used wherever a card has a collapsible content section below it.
 */
export function ExpandButton({ expanded, onToggle, expandLabel = '▼ show', collapseLabel = '▲ collapse' }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'block', width: '100%', padding: '5px',
        background: 'var(--bg-2)', border: 'none',
        borderTop: '1px solid var(--border)', color: 'var(--text-muted)',
        fontSize: 11, cursor: 'pointer',
      }}
    >
      {expanded ? collapseLabel : expandLabel}
    </button>
  );
}

/**
 * Inline text preview with hard character truncation and trailing ellipsis.
 * Renders nothing when text is empty. Does not include a toggle — pair with
 * ExpandButton + CollapsibleBlock when the full content is also shown.
 *
 * Usage:
 *   <CollapsibleText text={prompt} limit={COLLAPSE.PREVIEW_CHARS} />
 */
export function CollapsibleText({ text, limit = COLLAPSE.PREVIEW_CHARS, style = {}, prefix = null }) {
  if (!text) return null;
  const truncated = text.length > limit;
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, ...style }}>
      {prefix}
      {truncated ? text.slice(0, limit) + '…' : text}
    </div>
  );
}

/**
 * Card-level expand/collapse section. Manages its own open/closed state.
 * Renders an ExpandButton at the bottom and shows `children` only when expanded.
 *
 * Props:
 *   defaultExpanded  – start open? (default: false)
 *   expandLabel      – button label when collapsed
 *   collapseLabel    – button label when expanded
 *   disabled         – hide button entirely when there's nothing to show
 *   children         – full content rendered when expanded
 *
 * Usage:
 *   <CollapsibleBlock expandLabel="▼ show result" collapseLabel="▲ hide">
 *     <CodeBlock>{content}</CodeBlock>
 *   </CollapsibleBlock>
 */
export function CollapsibleBlock({ defaultExpanded = false, expandLabel = '▼ show', collapseLabel = '▲ collapse', disabled = false, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (disabled) return null;
  return (
    <>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
      <ExpandButton
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        expandLabel={expandLabel}
        collapseLabel={collapseLabel}
      />
    </>
  );
}
