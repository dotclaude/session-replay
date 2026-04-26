import React from 'react';

function formatElapsed(ms) {
  if (!ms && ms !== 0) return '--:--';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `T+${h}:${mm}:${ss}` : `T+${mm}:${ss}`;
}

export default function SessionClock({ elapsedMs }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--text-muted)',
      letterSpacing: '0.04em',
      flexShrink: 0,
    }}>
      {formatElapsed(elapsedMs)}
    </div>
  );
}
