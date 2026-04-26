import React from 'react';

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
      {meta && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'white' }}>{meta}</span>}
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
