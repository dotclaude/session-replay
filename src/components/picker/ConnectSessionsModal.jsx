import React from 'react';
import { getHiddenFolderHint } from '../../lib/platformHints';
import { supportsFileSystemAccess } from '../../lib/fsAccess';

export default function ConnectSessionsModal({
  open,
  busy = false,
  error = null,
  onConnect,
  onClose = null
}) {
  if (!open) return null;

  const supported = supportsFileSystemAccess();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        background: 'rgba(10, 15, 25, 0.75)',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-sessions-title"
        style={{
          width: 'min(600px, 100%)',
          padding: '24px',
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Local-first setup
            </div>
            <h2 id="connect-sessions-title" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Connect your .claude folder
            </h2>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              Close
            </button>
          )}
        </div>

        <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          This app runs entirely in your browser. To read local sessions, choose
          your <code style={{ padding: '2px 6px', background: 'var(--bg-2)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>.claude</code> directory when the native picker opens.
        </p>

        <div
          style={{
            padding: '12px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '12px',
          }}
        >
          <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Hidden folder hint:</strong>{' '}
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{getHiddenFolderHint()}</span>
        </div>

        <div
          style={{
            padding: '12px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            You may select <code style={{ padding: '2px 6px', background: 'var(--bg-3)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>.claude</code> directly. You may also select
            your home folder if it contains <code style={{ padding: '2px 6px', background: 'var(--bg-3)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>.claude</code>.
          </span>
        </div>

        {!supported && (
          <div
            style={{
              padding: '12px',
              background: 'rgba(255, 180, 0, 0.1)',
              border: '1px solid rgba(255, 180, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              Your browser does not support <code style={{ fontFamily: 'var(--font-mono)' }}>showDirectoryPicker()</code>.
              Use a Chromium-based browser (Chrome, Edge, Brave) for the best experience.
            </span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '12px',
              background: 'rgba(255, 68, 68, 0.1)',
              border: '1px solid rgba(255, 68, 68, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              color: 'var(--red)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            disabled={!supported || busy}
            onClick={onConnect}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: supported && !busy ? 'pointer' : 'not-allowed',
              borderRadius: '8px',
              background: supported && !busy ? 'var(--accent)' : 'var(--bg-3)',
              border: 'none',
              color: supported && !busy ? 'white' : 'var(--text-muted)',
            }}
          >
            {busy ? 'Connecting...' : 'Select .claude folder'}
          </button>
        </div>
      </section>
    </div>
  );
}
