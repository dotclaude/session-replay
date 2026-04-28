import { StageCard, CardHeader, timestamp } from './shared.jsx';
import { getCommandIcon, getCommandLabel } from '../../lib/parser/parseLocalCommands.js';

export default function LocalCommand({ step, isCurrent, isSearchMatch = false }) {
  const { commandName, commandArgs, output, timestamp: ts } = step.event;
  const icon = getCommandIcon(commandName);
  const label = getCommandLabel(commandName);

  return (
    <StageCard
      isSearchMatch={isSearchMatch}
      accent="var(--purple)"
      style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.85 }}
    >
      <CardHeader
        icon={icon}
        label={label}
        accent="var(--purple)"
        meta={timestamp(ts)}
      />
      {commandArgs && (
        <div style={{
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap',
          borderTop: '1px solid var(--border)',
        }}>
          {commandArgs}
        </div>
      )}
      {output && (
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-2)',
        }}>
          {output.text}
        </div>
      )}
    </StageCard>
  );
}
