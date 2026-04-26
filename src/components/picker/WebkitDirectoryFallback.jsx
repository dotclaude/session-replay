import React from 'react';

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export default function WebkitDirectoryFallback({ onCache }) {
  async function onChange(event) {
    const files = Array.from(event.currentTarget.files ?? []);

    const cachedFiles = [];

    for (const file of files) {
      const path = file.webkitRelativePath || file.name;

      if (
        !path.includes(".claude/") &&
        !path.startsWith(".claude/") &&
        !path.includes("\\.claude\\")
      ) {
        continue;
      }

      const lower = file.name.toLowerCase();

      if (
        !lower.endsWith(".json") &&
        !lower.endsWith(".jsonl") &&
        !lower.endsWith(".txt") &&
        !lower.endsWith(".md") &&
        !lower.endsWith(".log")
      ) {
        continue;
      }

      const text = await file.text();

      cachedFiles.push({
        path,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        mimeType: file.type,
        textPreview: text.slice(0, 12_000),
        parsed: lower.endsWith(".json") ? safeJsonParse(text) : undefined
      });
    }

    cachedFiles.sort((a, b) => b.lastModified - a.lastModified);

    onCache({
      generatedAt: new Date().toISOString(),
      files: cachedFiles
    });
  }

  return (
    <div style={{
      padding: '24px',
      margin: '16px',
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
        Fallback import
      </div>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
        Import folder snapshot
      </h3>

      <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Use this when persistent folder access is unavailable. You will need to
        re-import when files change.
      </p>

      <input
        type="file"
        webkitdirectory=""
        multiple
        onChange={onChange}
        style={{
          fontSize: '13px',
          padding: '8px',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}
