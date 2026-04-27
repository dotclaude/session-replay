import React, { useState } from 'react';
import { getHiddenFolderHint } from '../../lib/platformHints';
import { supportsFileSystemAccess } from '../../lib/fsAccess';
import { resolveSessionsDirectory } from '../../lib/fsAccess';

export default function ConnectSessionsModal({
  open,
  busy = false,
  error = null,
  onConnect,
  onDirectory,
  onError,
  onClose = null
}) {
  if (!open) return null;

  const supported = supportsFileSystemAccess();
  const [dragging, setDragging] = useState(false);

  async function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (!onDirectory) return;
    const item = e.dataTransfer.items[0];
    if (!item?.getAsFileSystemHandle) {
      onError?.("Directory drag-and-drop is not supported in this browser.");
      return;
    }
    try {
      const handle = await item.getAsFileSystemHandle();
      if (!handle || handle.kind !== 'directory') {
        onError?.("Drop a directory, not a file.");
        return;
      }
      const sessionsDir = await resolveSessionsDirectory(handle);
      onDirectory(sessionsDir);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={handleDrop}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        background: dragging ? 'rgba(88, 166, 255, 0.08)' : 'rgba(10, 15, 25, 0.75)',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
        transition: 'background 0.15s',
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
          This app runs entirely in your browser — nothing leaves your machine.
          Connect your <code style={{ padding: '2px 6px', background: 'var(--bg-2)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>.claude</code> folder using either method below.
        </p>

        {/* Primary: drag and drop */}
        {onDirectory && (
          <div style={{ marginBottom: '16px' }}>
            <DirectoryDropZone dragging={dragging} />
          </div>
        )}

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>or use the file picker</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>

        {/* Hidden folder hint for file picker */}
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '12px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>Tip: </strong>
          {getHiddenFolderHint()}
          {' '}You can also select your home folder — the app will find <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>.claude</code> inside it automatically.
        </div>

        {!supported && (
          <div
            style={{
              padding: '12px',
              background: 'rgba(88, 166, 255, 0.1)',
              border: '1px solid rgba(88, 166, 255, 0.3)',
              borderRadius: '8px',
              marginBottom: '12px',
            }}
          >
            <strong style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
              Firefox/Safari user?
            </strong>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Your browser uses a fallback mode. You'll need to re-select your folder after page refresh, but all features work normally.
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
              marginBottom: '12px',
              color: 'var(--red)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            disabled={busy}
            onClick={onConnect}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              borderRadius: '8px',
              background: busy ? 'var(--bg-3)' : 'var(--accent)',
              border: 'none',
              color: busy ? 'var(--text-muted)' : 'white',
            }}
          >
            {busy ? 'Loading...' : (supported ? 'Select .claude folder' : 'Import .claude folder')}
          </button>
        </div>
      </section>
    </div>
  );
}
