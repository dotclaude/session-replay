/**
 * Parse local command XML tags from user messages
 * These are CLI commands the user runs (like /model, /dispatch, /compact)
 */

export function parseLocalCommand(content) {
  if (typeof content !== 'string') return null;

  // Extract command-name
  const nameMatch = content.match(/<command-name>([^<]+)<\/command-name>/);
  // Extract command-message (often same as name without /)
  const messageMatch = content.match(/<command-message>([^<]+)<\/command-message>/);
  // Extract command-args
  const argsMatch = content.match(/<command-args>([^<]*)<\/command-args>/);

  if (!nameMatch) return null;

  return {
    type: 'local-command',
    commandName: nameMatch[1].trim(),
    commandMessage: messageMatch ? messageMatch[1].trim() : nameMatch[1].replace('/', ''),
    commandArgs: argsMatch ? argsMatch[1].trim() : '',
  };
}

export function parseLocalCommandOutput(content) {
  if (typeof content !== 'string') return null;

  const match = content.match(/<local-command-stdout>([^<]*)<\/local-command-stdout>/);
  if (!match) return null;

  // Strip ANSI codes
  const text = match[1].replace(/\[\d+m/g, '');

  return {
    type: 'local-command-output',
    text: text.trim(),
  };
}

// Built-in commands (not skills) with their icons
const BUILTIN_COMMANDS = {
  '/model': '🤖',
  '/compact': '🗜️',
  '/help': '❓',
  '/config': '⚙️',
  '/clear': '🧹',
  '/reset': '🔄',
  '/undo': '↩️',
  '/fast': '⚡',
  '/cost': '💰',
  '/tasks': '✅',
  '/plan': '📋',
  '/commit': '📦',
  '/pr': '🔀',
  '/review': '👀',
  '/search': '🔍',
  '/find': '🔎',
  '/logs': '📜',
  '/status': '📊',
  '/diff': '📝',
};

// Detect if a command is a skill (has namespace:name pattern or not in built-in list)
export function isSkill(commandName) {
  // Remove leading slash for comparison
  const normalized = commandName.startsWith('/') ? commandName : `/${commandName}`;

  // Skills have : separator (e.g., /ux-product:journey, /dispatch-work)
  if (commandName.includes(':')) return true;

  // Or it's not a known built-in command
  return !BUILTIN_COMMANDS[normalized];
}

export function getCommandIcon(commandName) {
  const normalized = commandName.startsWith('/') ? commandName : `/${commandName}`;

  // Check if it's a skill first
  if (isSkill(commandName)) {
    return '🎯'; // Generic skill icon
  }

  return BUILTIN_COMMANDS[normalized] || '▶️';
}

export function getCommandLabel(commandName) {
  // Remove leading slash if present
  return commandName.startsWith('/') ? commandName.substring(1) : commandName;
}
