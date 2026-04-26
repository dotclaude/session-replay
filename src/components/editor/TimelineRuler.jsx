import React from 'react';

function tickIntervalMs(zoom, totalDurationMs, containerWidth) {
  // Aim for roughly one major tick every 80px
  const msPerPixel = totalDurationMs / (containerWidth * zoom);
  const targetIntervalMs = msPerPixel * 80;
  const candidates = [250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
  return candidates.find(c => c >= targetIntervalMs) ?? 60000;
}

export default function TimelineRuler({ totalDurationMs, zoom, scrollMs, containerWidth, trackHeaderWidth }) {
  if (!containerWidth || !totalDurationMs) return (
    <div style={{ height: '22px', background: 'var(--bg-0)', borderBottom: '1px solid var(--border)' }} />
  );

  const intervalMs = tickIntervalMs(zoom, totalDurationMs, containerWidth - trackHeaderWidth);
  const visibleMs = totalDurationMs / zoom;
  const endMs = scrollMs + visibleMs;
  const ticks = [];

  const firstTick = Math.ceil(scrollMs / intervalMs) * intervalMs;
  for (let t = firstTick; t <= endMs + intervalMs; t += intervalMs) {
    const px = ((t - scrollMs) / visibleMs) * (containerWidth - trackHeaderWidth);
    if (px < -20 || px > containerWidth - trackHeaderWidth + 20) continue;
    const isMajor = true; // all ticks are major at this density
    const label = t >= 60000
      ? `${Math.floor(t / 60000)}m${Math.round((t % 60000) / 1000)}s`
      : `${(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}s`;
    ticks.push({ px, label, isMajor });
  }

  return (
    <div style={{ height: '22px', background: 'var(--bg-0)', borderBottom: '1px solid var(--border)', position: 'relative', flexShrink: 0, display: 'flex' }}>
      {/* Track header spacer */}
      <div style={{ width: trackHeaderWidth, flexShrink: 0, borderRight: '1px solid var(--border)' }} />
      {/* Ruler area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {ticks.map(({ px, label }) => (
          <React.Fragment key={px}>
            <div style={{
              position: 'absolute',
              left: px,
              bottom: 0,
              width: '1px',
              height: '8px',
              background: 'var(--bg-3)',
            }} />
            <div style={{
              position: 'absolute',
              left: px + 3,
              bottom: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}>
              {label}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
