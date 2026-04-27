import React from 'react';

export default function DirectoryDropZone({ dragging }) {
  return (
    <div
      style={{
        padding: '28px 24px',
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '10px',
        background: dragging ? 'rgba(88, 166, 255, 0.06)' : 'var(--bg-2)',
        textAlign: 'center',
        transition: 'border-color 0.15s, background 0.15s',
        cursor: 'default',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: '28px', marginBottom: '8px', opacity: dragging ? 1 : 0.5 }}>📁</div>
      <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
        Drag your .claude folder here
      </strong>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'block' }}>
        In Finder, press{' '}
        <kbd style={{ padding: '1px 5px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>⌘ Shift .</kbd>
        {' '}to show hidden folders, then drag <code style={{ fontFamily: 'var(--font-mono)' }}>.claude</code> into this window.
      </span>
    </div>
  );
}
