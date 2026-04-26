/**
 * buildSearchIndex + searchIndex
 *
 * Linear-scan search over a pre-built text index. Fast enough for session sizes
 * (hundreds to low thousands of steps). No external library needed.
 */

function extractText(step) {
  const { kind, event } = step;
  const inp = event?.toolInput || {};
  const result = event?.result?.text || '';

  switch (kind) {
    case 'human':
    case 'assistant-text':
    case 'turn-summary':
      return {
        primary: event.text || '',
        secondary: '',
      };

    case 'tool-bash':
      return {
        primary: `${inp.command || ''} ${inp.description || ''}`,
        secondary: result.slice(0, 500),
      };

    case 'tool-write':
      return {
        primary: inp.file_path || '',
        secondary: (inp.content || '').slice(0, 1000),
      };

    case 'tool-edit':
      return {
        primary: inp.file_path || '',
        secondary: `${(inp.old_string || '').slice(0, 300)} ${(inp.new_string || '').slice(0, 300)}`,
      };

    case 'tool-read':
      return {
        primary: inp.file_path || '',
        secondary: result.slice(0, 500),
      };

    case 'tool-agent':
      return {
        primary: `${inp.description || ''} ${(inp.prompt || '').slice(0, 500)}`,
        secondary: result.slice(0, 200),
      };

    case 'tool-web':
      return {
        primary: inp.url || inp.query || '',
        secondary: result.slice(0, 300),
      };

    case 'hook-event':
      return {
        primary: `${event.hookName || ''} ${event.hookEvent || ''} ${event.command || ''}`,
        secondary: '',
      };

    case 'agent-progress': {
      const inner = event.innerMessage?.message?.content;
      const innerText = Array.isArray(inner)
        ? inner.find(b => b.type === 'text')?.text || ''
        : typeof inner === 'string' ? inner : '';
      return {
        primary: (event.prompt || '').slice(0, 300),
        secondary: innerText.slice(0, 300),
      };
    }

    case 'compaction-event':
      return {
        primary: `compaction ${event.trigger || ''} ${event.preTokens || ''}`,
        secondary: (event.preCompactDiscoveredTools || []).join(' '),
      };

    case 'error-event':
      return {
        primary: event.error || '',
        secondary: '',
      };

    default:
      return { primary: step.description || '', secondary: '' };
  }
}

export function buildSearchIndex(steps) {
  return steps.map(step => {
    const { primary, secondary } = extractText(step);
    const text = `${step.description} ${primary} ${secondary}`.toLowerCase();
    return {
      stepIndex: step.index,
      kind: step.kind,
      text,
      highlights: {
        description: step.description,
        primary,
        secondary,
      },
    };
  });
}

export function searchIndex(index, query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return index.filter(r => r.text.includes(q)).map(r => r.stepIndex);
}
