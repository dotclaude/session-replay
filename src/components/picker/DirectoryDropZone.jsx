import React from 'react';
import { resolveSessionsDirectory, verifyReadPermission } from '../../lib/fsAccess';

export default function DirectoryDropZone({ onDirectory, onError }) {
  async function onDrop(event) {
    event.preventDefault();

    const item = event.dataTransfer.items[0];

    if (!item?.getAsFileSystemHandle) {
      onError("Directory drag-and-drop handles are not supported in this browser.");
      return;
    }

    try {
      const handle = await item.getAsFileSystemHandle();

      if (!handle || handle.kind !== "directory") {
        onError("Drop a directory, not a file.");
        return;
      }

      const sessionsDir = await resolveSessionsDirectory(handle);
      const hasPermission = await verifyReadPermission(sessionsDir);

      if (!hasPermission) {
        onError("Read permission was not granted for the dropped directory.");
        return;
      }

      onDirectory(sessionsDir);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      style={{
        padding: '32px',
        margin: '16px',
        border: '2px dashed var(--border)',
        borderRadius: '12px',
        background: 'var(--bg-1)',
        textAlign: 'center',
      }}
    >
      <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
        Or drop your .claude folder here
      </strong>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        Works only in browsers that expose directory handles on drop.
      </span>
    </div>
  );
}
