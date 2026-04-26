/**
 * renderFrameToCanvas
 *
 * Draws a single step onto an HTMLCanvasElement using the 2D API.
 * No DOM capture, no html2canvas — ~2ms per frame instead of ~500ms.
 *
 * Visual style matches the app's dark theme. Each step renders as:
 *   [colored left bar] [header row: icon + label + timestamp]
 *   [body: wrapped text or key/value pairs]
 *
 * Long text is truncated at textRevealFraction (0..1) for the streaming effect.
 */

const BG0      = '#0d1117';
const BG1      = '#161b22';
const BG2      = '#21262d';
const BORDER   = '#30363d';
const TEXT_PRI = '#e6edf3';
const TEXT_SEC = '#8b949e';
const TEXT_MUT = '#484f58';
const MONO     = "'Cascadia Code', 'Fira Code', 'Consolas', monospace";
const SANS     = "'Inter', 'Segoe UI', system-ui, sans-serif";

const KIND_META = {
  'human':            { accent: '#58a6ff', icon: '▸', label: 'You' },
  'assistant-text':   { accent: '#3fb950', icon: '◆', label: 'Claude' },
  'tool-bash':        { accent: '#39d353', icon: '$',  label: 'bash' },
  'tool-write':       { accent: '#58a6ff', icon: '✎',  label: 'write' },
  'tool-edit':        { accent: '#d29922', icon: '✎',  label: 'edit' },
  'tool-read':        { accent: '#8b949e', icon: '◉',  label: 'read' },
  'tool-agent':       { accent: '#ffa657', icon: '◈',  label: 'agent' },
  'tool-web':         { accent: '#bc8cff', icon: '⊕',  label: 'web' },
  'tool-task':        { accent: '#8b949e', icon: '☐',  label: 'task' },
  'tool-generic':     { accent: '#30363d', icon: '⬡',  label: 'tool' },
  'hook-event':       { accent: '#d29922', icon: '⚡', label: 'hook' },
  'agent-progress':   { accent: '#ffa657', icon: '◈',  label: 'agent reasoning' },
  'compaction-event': { accent: '#8b949e', icon: '◎',  label: 'context compact' },
  'error-event':      { accent: '#f85149', icon: '✕',  label: 'api error' },
  'turn-summary':     { accent: '#3fb950', icon: '◎',  label: 'summary' },
  'pr-link':          { accent: '#bc8cff', icon: '⎇',  label: 'pull request' },
  'session-header':   { accent: '#58a6ff', icon: '◆',  label: 'session' },
};

// Wrap text into lines that fit within maxWidth pixels at the given font.
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function extractBodyText(step, revealFraction) {
  let text = '';

  switch (step.kind) {
    case 'human':
    case 'assistant-text':
    case 'turn-summary':
      text = step.event?.text || step.event?.summary || '';
      break;
    case 'tool-bash':
      text = step.event?.toolInput?.command || '';
      if (step.event?.result?.text) text += '\n\n' + step.event.result.text.slice(0, 800);
      break;
    case 'tool-write':
      text = (step.event?.toolInput?.file_path || '') + '\n' + (step.event?.toolInput?.content || '');
      break;
    case 'tool-edit':
      text = (step.event?.toolInput?.file_path || '') + '\n' + (step.event?.toolInput?.old_string?.slice(0, 200) || '');
      break;
    case 'tool-read':
      text = step.event?.toolInput?.file_path || '';
      break;
    case 'tool-agent':
      text = step.event?.toolInput?.description || step.event?.toolInput?.prompt?.slice(0, 300) || '';
      break;
    case 'tool-web':
      text = step.event?.toolInput?.url || '';
      break;
    case 'hook-event':
      text = `${step.event?.hookName || ''} · ${step.event?.hookEvent || ''}\n${step.event?.command || ''}`;
      break;
    case 'compaction-event':
      text = `${step.event?.preTokens?.toLocaleString() || '?'} tokens → compact boundary`;
      if (step.event?.trigger) text += ` (${step.event.trigger})`;
      break;
    case 'error-event':
      text = step.event?.error || '';
      break;
    case 'pr-link':
      text = step.event?.prUrl || '';
      break;
    default:
      text = step.description || '';
  }

  if (revealFraction < 1 && text.length > 0) {
    text = text.slice(0, Math.ceil(text.length * revealFraction));
    // Don't cut mid-word
    const lastSpace = text.lastIndexOf(' ');
    if (lastSpace > text.length * 0.8) text = text.slice(0, lastSpace);
    text += '▌'; // cursor
  }

  return text;
}

export function renderFrameToCanvas(canvas, step, revealFraction = 1) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG0;
  ctx.fillRect(0, 0, W, H);

  const meta = KIND_META[step.kind] || { accent: BORDER, icon: '·', label: step.kind };
  const PAD = 20;
  const CARD_X = PAD;
  const CARD_W = W - PAD * 2;
  const BAR_W = 3;
  const HEADER_H = 36;
  const BODY_PAD = 14;

  // Card background
  ctx.fillStyle = BG1;
  ctx.beginPath();
  ctx.roundRect(CARD_X, PAD, CARD_W, H - PAD * 2, 6);
  ctx.fill();

  // Left accent bar
  ctx.fillStyle = meta.accent;
  ctx.beginPath();
  ctx.roundRect(CARD_X, PAD, BAR_W, H - PAD * 2, [6, 0, 0, 6]);
  ctx.fill();

  // Header row background
  ctx.fillStyle = BG2;
  ctx.beginPath();
  ctx.roundRect(CARD_X, PAD, CARD_W, HEADER_H, [6, 6, 0, 0]);
  ctx.fill();

  // Header bottom border
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CARD_X, PAD + HEADER_H);
  ctx.lineTo(CARD_X + CARD_W, PAD + HEADER_H);
  ctx.stroke();

  // Icon
  ctx.font = `bold 13px ${SANS}`;
  ctx.fillStyle = meta.accent;
  ctx.fillText(meta.icon, CARD_X + BAR_W + 12, PAD + HEADER_H / 2 + 5);

  // Label
  ctx.font = `bold 11px ${SANS}`;
  ctx.fillStyle = meta.accent;
  const iconW = ctx.measureText(meta.icon).width;
  ctx.fillText(meta.label.toUpperCase(), CARD_X + BAR_W + 12 + iconW + 8, PAD + HEADER_H / 2 + 5);

  // Timestamp (right-aligned)
  const ts = step.event?.timestamp || step.timestamp;
  if (ts) {
    const tsStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = TEXT_MUT;
    const tsW = ctx.measureText(tsStr).width;
    ctx.fillText(tsStr, CARD_X + CARD_W - 12 - tsW, PAD + HEADER_H / 2 + 4);
  }

  // Body text
  const bodyText = extractBodyText(step, revealFraction);
  if (bodyText) {
    const isCode = ['tool-bash', 'tool-write', 'tool-edit', 'tool-read'].includes(step.kind);
    ctx.font = isCode ? `12px ${MONO}` : `13px ${SANS}`;
    ctx.fillStyle = step.kind === 'error-event' ? '#f85149' : TEXT_PRI;

    const textX = CARD_X + BAR_W + BODY_PAD;
    const textW = CARD_W - BAR_W - BODY_PAD * 2;
    const lineH = isCode ? 18 : 20;
    const lines = wrapText(ctx, bodyText, textW);
    const maxLines = Math.floor((H - PAD * 2 - HEADER_H - BODY_PAD * 2) / lineH);

    lines.slice(0, maxLines).forEach((line, i) => {
      ctx.fillText(line, textX, PAD + HEADER_H + BODY_PAD + (i + 1) * lineH);
    });

    if (lines.length > maxLines) {
      ctx.font = `11px ${SANS}`;
      ctx.fillStyle = TEXT_MUT;
      ctx.fillText(`… +${lines.length - maxLines} more lines`, textX, PAD + HEADER_H + BODY_PAD + (maxLines + 1) * lineH);
    }
  }
}

export function makeCanvas(width = 900, height = 600) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
