import React from 'react';
import { StageCard, CardHeader, timestamp } from './shared.jsx';

const STATUS_COLORS = {
  completed: 'var(--green)',
  in_progress: 'var(--yellow)',
  pending: 'var(--text-muted)',
  deleted: 'var(--red)',
};

export default function ToolTask({ step, isCurrent, isSearchMatch = false }) {
  const { toolInput, toolName, timestamp: ts } = step.event;
  const isCreate = toolName === 'TaskCreate';
  const isUpdate = toolName === 'TaskUpdate';
  const status = toolInput.status;
  const statusColor = STATUS_COLORS[status] || 'var(--text-muted)';

  return (
    <StageCard isSearchMatch={isSearchMatch} accent="var(--text-muted)" style={{ margin: '3px 16px', opacity: isCurrent ? 1 : 0.75 }}>
      <CardHeader icon="✓" label={isCreate ? 'task created' : isUpdate ? 'task updated' : 'task'} accent="var(--text-secondary)" meta={timestamp(ts)} />
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {isCreate && <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{toolInput.subject}</span>}
        {isUpdate && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{toolInput.taskId}</span>
            {status && <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>→ {status}</span>}
          </>
        )}
      </div>
    </StageCard>
  );
}
