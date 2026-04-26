import React from 'react';

export default function ProcessingIndicator({ visible, message = 'Processing...' }) {
  if (!visible) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      margin: '8px 16px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-muted)',
        fontSize: 12,
      }}>
        <div style={{
          display: 'flex',
          gap: 4,
        }}>
          <div className="processing-dot" style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse 1.4s ease-in-out infinite',
            animationDelay: '0s',
          }} />
          <div className="processing-dot" style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse 1.4s ease-in-out infinite',
            animationDelay: '0.2s',
          }} />
          <div className="processing-dot" style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse 1.4s ease-in-out infinite',
            animationDelay: '0.4s',
          }} />
        </div>
        <span>{message}</span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          30% {
            opacity: 1;
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}
