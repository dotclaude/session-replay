import { useEffect } from 'react';
import { COLLAPSE } from './stageUtils.js';

/**
 * Modal overlay for displaying tool details (Agent prompts, Skill docs, etc.)
 * Prevents UI pollution by keeping expanded content in a popover
 */
export default function ToolModal({ isOpen, onClose, title, sections = [] }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          maxWidth: '800px',
          maxHeight: '80vh',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <h3
            id="modal-title"
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 20,
              cursor: 'pointer',
              padding: '0 8px',
              lineHeight: 1,
            }}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {sections.map((section, idx) => (
            <div key={idx} style={{ marginBottom: idx < sections.length - 1 ? 24 : 0 }}>
              {section.label && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                    letterSpacing: '0.5px',
                  }}
                >
                  {section.label}
                </div>
              )}
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  fontFamily: section.mono ? 'var(--font-mono)' : 'inherit',
                  background: section.mono ? 'var(--bg-2)' : 'transparent',
                  padding: section.mono ? '12px' : 0,
                  borderRadius: section.mono ? 'var(--radius-sm)' : 0,
                  border: section.mono ? '1px solid var(--border)' : 'none',
                  maxHeight: section.maxHeight ?? COLLAPSE.MODAL_SECTION_HEIGHT,
                  overflowY: 'auto',
                }}
              >
                {section.content}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          Press ESC or click outside to close
        </div>
      </div>
    </div>
  );
}
