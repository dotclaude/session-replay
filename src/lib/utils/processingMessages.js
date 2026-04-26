/**
 * Maps step kinds to user-friendly processing messages
 * Used by ProcessingIndicator to show context-aware status
 */

export function getProcessingMessage(stepKind) {
  const messages = {
    // Assistant responses
    'assistant-text': 'Claude is thinking...',
    'turn-summary': 'Summarizing turn...',

    // File operations
    'tool-read': 'Reading file...',
    'tool-write': 'Writing file...',
    'tool-edit': 'Editing file...',

    // Command execution
    'tool-bash': 'Running command...',

    // Tools and agents
    'tool-agent': 'Running agent...',
    'tool-skill': 'Using skill...',
    'tool-web': 'Fetching data...',
    'tool-task': 'Managing tasks...',
    'tool-generic': 'Using tool...',

    // User interactions
    'human': 'Awaiting user input...',

    // System events
    'hook-event': 'Executing hook...',
    'agent-progress': 'Agent working...',
    'compaction-event': 'Compacting context...',
    'error-event': 'Processing error...',
    'local-command': 'Running command...',
    'local-command-output': 'Command output...',
    'pr-link': 'Processing PR...',

    // Session management
    'session-header': 'Starting session...',

    // Default fallback
    'default': 'Processing...',
  };

  return messages[stepKind] || messages.default;
}
