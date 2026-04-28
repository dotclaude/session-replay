import { useState } from 'react';
import { estimateCost } from '../../lib/stats/computeSessionStats.js';

const MODEL_SHORT = (m) => m
  ? m.replace('claude-', '').replace(/-\d{8}$/, '').replace(/-20\d{6}$/, '')
  : null;

const MODEL_COLOR = (m) => {
  if (!m) return 'var(--text-muted)';
  if (m.includes('opus'))   return '#ffa657';
  if (m.includes('sonnet')) return '#58a6ff';
  if (m.includes('haiku'))  return '#3fb950';
  return '#8b949e';
};

function ModelPill({ model }) {
  if (!model) return null;
  return (
    <span style={{
      fontSize: 9, padding: '1px 5px', borderRadius: 8, fontWeight: 600,
      background: `${MODEL_COLOR(model)}22`,
      color: MODEL_COLOR(model),
      fontFamily: 'var(--font-mono)',
    }}>
      {MODEL_SHORT(model)}
    </span>
  );
}

function TurnCard({ turn, total, maxTurnTokens, isCurrentTurn, onScrubTo }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onScrubTo(turn.humanStepIndex)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        marginBottom: 6,
        cursor: 'pointer',
        padding: '6px 8px',
        borderRadius: 4,
        background: isCurrentTurn ? 'rgba(88,166,255,0.1)' : hovered ? 'var(--bg-2)' : 'var(--bg-0)',
        border: `1px solid ${isCurrentTurn ? 'var(--accent)' : hovered ? 'var(--border)' : 'transparent'}`,
        transition: 'background 0.1s, border-color 0.1s',
        userSelect: 'none',
      }}
    >
      {/* Compaction marker */}
      {turn.hasCompactionBefore && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#8b949e' }}>◎</span> context compacted before this turn
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            color: isCurrentTurn ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 10,
          }}>
            T{turn.turnIndex + 1}
          </span>
          {isCurrentTurn && (
            <span style={{ fontSize: 9, color: 'var(--accent)', background: 'rgba(88,166,255,0.15)', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>
              NOW
            </span>
          )}
          {/* Model pills — show all models used in this turn */}
          {turn.models.map(m => <ModelPill key={m} model={m} />)}
          {/* Multi-model indicator */}
          {turn.models.length > 1 && (
            <span style={{ fontSize: 9, color: 'var(--yellow)' }} title="Model switched within this turn">⇄</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {fmt(total)}{turn.durationMs ? ` · ${fmtMs(turn.durationMs)}` : ''}
          </span>
          {hovered && !isCurrentTurn && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>jump ↵</span>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {turn.humanText || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>no prompt</span>}
      </div>
      <Bar value={total} max={maxTurnTokens} color={isCurrentTurn ? 'var(--accent)' : 'var(--accent-dim)'} />
    </div>
  );
}

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtMs(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtCost(n) {
  if (n == null) return null;
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(3)}`;
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', background: 'none', border: 'none',
          color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em', cursor: 'pointer',
        }}
      >
        {title}
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
    </div>
  );
}

function Bar({ value, max, color = 'var(--accent)' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: 'var(--bg-3)', borderRadius: 2, height: 4, overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function Row({ label, value, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, cursor: onClick ? 'pointer' : 'default', padding: onClick ? '2px 0' : 0 }}
    >
      <span style={{ fontSize: 12, color: onClick ? 'var(--accent)' : 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
        {value}
        {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</div>}
      </span>
    </div>
  );
}

export default function StatsPanel({ stats, isOpen, onClose, onScrubTo, currentStep }) {
  if (!stats) return null;

  const totalCacheTokens = stats.totalCacheReadTokens + stats.totalCacheCreationTokens;
  const cacheHitPct = totalCacheTokens > 0 ? Math.round(stats.cacheHitRate * 100) : null;

  // Total cost estimate
  let totalCost = null;
  for (const [modelId, usage] of Object.entries(stats.modelUsage)) {
    const c = estimateCost(modelId, usage.inputTokens, usage.outputTokens);
    if (c != null) totalCost = (totalCost || 0) + c;
  }

  const maxToolCount = Math.max(...Object.values(stats.toolUsage).map(t => t.count), 1);
  const maxTurnTokens = Math.max(...stats.turns.map(t => t.inputTokens + t.outputTokens), 1);

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0,
      width: 320,
      background: 'var(--bg-1)',
      borderLeft: '1px solid var(--border)',
      overflowY: 'auto',
      transform: isOpen ? 'translateX(0)' : 'translateX(320px)',
      transition: 'transform 0.2s ease',
      zIndex: 20,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Session Stats</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Token Summary */}
      <Section title="Tokens">
        <Row label="Input" value={fmt(stats.totalInputTokens)} />
        <Row label="Output" value={fmt(stats.totalOutputTokens)} />
        <Row label="Cache read" value={fmt(stats.totalCacheReadTokens)} />
        <Row label="Cache write" value={fmt(stats.totalCacheCreationTokens)} />
        {cacheHitPct != null && <Row label="Cache hit rate" value={`${cacheHitPct}%`} />}
        {totalCost != null && <Row label="Est. cost" value={fmtCost(totalCost)} />}
      </Section>

      {/* Cache efficiency bar */}
      {totalCacheTokens > 0 && (
        <Section title="Cache Efficiency" defaultOpen={false}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            Read: {fmt(stats.totalCacheReadTokens)} · Write: {fmt(stats.totalCacheCreationTokens)}
          </div>
          <div style={{ background: 'var(--bg-3)', borderRadius: 3, height: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', height: '100%' }}>
              <div style={{ width: `${cacheHitPct}%`, background: 'var(--green)', transition: 'width 0.3s' }} />
              <div style={{ flex: 1, background: 'var(--yellow)', opacity: 0.6 }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            <span style={{ color: 'var(--green)' }}>read (cheaper)</span>
            <span style={{ color: 'var(--yellow)' }}>creation</span>
          </div>
        </Section>
      )}

      {/* Model breakdown */}
      {Object.keys(stats.modelUsage).length > 0 && (
        <Section title="Models" defaultOpen={false}>
          {Object.entries(stats.modelUsage)
            .sort((a, b) => b[1].inputTokens - a[1].inputTokens)
            .map(([model, usage]) => {
              const cost = estimateCost(model, usage.inputTokens, usage.outputTokens);
              const maxModelTokens = Math.max(...Object.values(stats.modelUsage).map(u => u.inputTokens + u.outputTokens), 1);
              return (
                <div key={model} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ModelPill model={model} />
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {usage.turns} turn{usage.turns !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {cost != null && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {fmtCost(cost)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                    {fmt(usage.inputTokens)} in · {fmt(usage.outputTokens)} out
                  </div>
                  <Bar value={usage.inputTokens + usage.outputTokens} max={maxModelTokens} color={MODEL_COLOR(model)} />
                </div>
              );
            })}
          {stats.compactionEvents.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, padding: '5px 8px', background: 'var(--bg-2)', borderRadius: 4 }}>
              ◎ {stats.compactionEvents.length} compaction{stats.compactionEvents.length !== 1 ? 's' : ''} — context was reset; token counts after each compaction restart from a smaller base
            </div>
          )}
        </Section>
      )}

      {/* Per-turn breakdown */}
      {stats.turns.length > 0 && (
        <Section title={`Turns (${stats.turns.length}) — click to jump`} defaultOpen={false}>
          {stats.turns.map(turn => {
            const total = turn.inputTokens + turn.outputTokens;
            // Exclusive range: a turn owns [humanStepIndex, nextHumanStepIndex - 1]
            const isCurrentTurn = currentStep >= turn.stepRange[0] && currentStep <= turn.stepRange[1];
            return (
              <TurnCard
                key={turn.turnIndex}
                turn={turn}
                total={total}
                maxTurnTokens={maxTurnTokens}
                isCurrentTurn={isCurrentTurn}
                onScrubTo={onScrubTo}
              />
            );
          })}
        </Section>
      )}

      {/* Tool heatmap */}
      {Object.keys(stats.toolUsage).length > 0 && (
        <Section title="Tools" defaultOpen={false}>
          {Object.entries(stats.toolUsage)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, usage]) => (
              <div key={name} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span
                    onClick={() => usage.stepIndices[0] != null && onScrubTo(usage.stepIndices[0])}
                    style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}>{name}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>×{usage.count}</span>
                </div>
                <Bar value={usage.count} max={maxToolCount} color="var(--cyan)" />
              </div>
            ))}
        </Section>
      )}

      {/* Hooks */}
      {stats.hookEvents.length > 0 && (
        <Section title={`Hooks (${stats.hookEvents.length})`} defaultOpen={false}>
          {Object.entries(stats.hooksFrequency)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span
                  onClick={() => { const e = stats.hookEvents.find(h => h.hookName === name); e && onScrubTo(e.stepIndex); }}
                  style={{ fontSize: 11, color: 'var(--yellow)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>×{count}</span>
              </div>
            ))}
        </Section>
      )}

      {/* Compaction events */}
      {stats.compactionEvents.length > 0 && (
        <Section title={`Compactions (${stats.compactionEvents.length})`} defaultOpen={false}>
          {stats.compactionEvents.map((e, i) => (
            <div key={i} onClick={() => onScrubTo(e.stepIndex)}
              style={{ marginBottom: 8, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-primary)' }}>{e.preTokens ? e.preTokens.toLocaleString() : '?'} tokens</span>
              {e.trigger && <span className="tag" style={{ marginLeft: 6 }}>{e.trigger}</span>}
              {e.preCompactDiscoveredTools?.length > 0 && (
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{e.preCompactDiscoveredTools.length} tools in scope</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Agent calls */}
      {stats.agentCalls.length > 0 && (
        <Section title={`Agents (${stats.agentCalls.length})`} defaultOpen={false}>
          {stats.agentCalls.map((a, i) => (
            <div key={i} onClick={() => onScrubTo(a.stepIndex)}
              style={{ marginBottom: 8, cursor: 'pointer', fontSize: 11 }}>
              <div style={{ color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>{(a.agentId || '').slice(0, 16) || 'sub-agent'}</div>
              {a.prompt && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{a.prompt.slice(0, 80)}…</div>}
            </div>
          ))}
        </Section>
      )}

      {/* Background tasks */}
      {stats.backgroundTaskTiming.taskCount > 0 && (
        <Section title="Background Tasks" defaultOpen={false}>
          <Row label="Tasks" value={String(stats.backgroundTaskTiming.taskCount)} />
          <Row label="Total time" value={fmtMs(stats.backgroundTaskTiming.totalMs)} />
        </Section>
      )}

      {/* Errors */}
      {stats.errorEvents.length > 0 && (
        <Section title={`Errors (${stats.errorEvents.length})`} defaultOpen={false}>
          {stats.errorEvents.map((e, i) => (
            <div key={i} onClick={() => onScrubTo(e.stepIndex)}
              style={{ marginBottom: 8, cursor: 'pointer', fontSize: 11, color: 'var(--red)' }}>
              {e.error?.slice(0, 100)}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
