import React from 'react';

export default function ProjectCard({ project, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 16px',
        cursor: 'pointer',
        background: selected ? 'var(--bg-2)' : 'transparent',
        borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-2)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ fontWeight: 500, fontSize: 13, color: selected ? 'var(--text-primary)' : 'var(--text-secondary)', marginBottom: 2 }}>
        {project.label}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}
        {project.firstTs && ` · ${new Date(project.firstTs).toLocaleDateString()}`}
      </div>
    </div>
  );
}
