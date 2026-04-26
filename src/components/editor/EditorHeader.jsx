import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function EditorHeader({ sessionId, mode, onModeChange, onExport, activeTool, onToolChange }) {
  const navigate = useNavigate();

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '8px',
    }}>
      {/* Wordmark + back */}
      <button
        onClick={() => navigate('/')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          cursor: 'pointer',
          padding: '4px 6px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}
      >
        ← session-replay
      </button>

      <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 2px' }} />

      {/* Annotation tools */}
      {['select', 'text', 'arrow', 'rect'].map(tool => (
        <button
          key={tool}
          onClick={() => onToolChange?.(activeTool === tool ? null : tool)}
          style={{
            height: '28px',
            padding: '0 10px',
            border: `1px solid ${activeTool === tool ? 'var(--accent)' : 'transparent'}`,
            borderRadius: 'var(--radius-sm)',
            background: activeTool === tool ? 'rgba(88,166,255,0.1)' : 'transparent',
            color: activeTool === tool ? 'var(--accent)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {tool === 'select' ? '↖' : tool === 'text' ? 'T' : tool === 'arrow' ? '↗' : '▭'}
          {' '}{tool}
        </button>
      ))}

      {/* Mode toggle */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          display: 'flex',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px',
          gap: '2px',
        }}>
          {['preview', 'edit'].map(m => (
            <button
              key={m}
              onClick={() => onModeChange?.(m)}
              style={{
                height: '22px',
                padding: '0 10px',
                borderRadius: '3px',
                border: 'none',
                background: mode === m ? 'var(--accent)' : 'transparent',
                color: mode === m ? 'var(--bg-0)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: mode === m ? 600 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <button
          onClick={onExport}
          style={{
            height: '28px',
            padding: '0 14px',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          ↑ Export
        </button>
      </div>
    </div>
  );
}
