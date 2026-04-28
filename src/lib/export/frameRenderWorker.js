// Self-contained worker — no imports. All rendering logic inlined from renderFrameToCanvas.js.

const BG0      = '#0d1117';
const BG1      = '#161b22';
const BG2      = '#21262d';
const BORDER   = '#444c56';
const TEXT_PRI = '#e6edf3';
const TEXT_MUT = '#6e7681';
const ACCENT   = '#58a6ff';
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
  'tool-generic':     { accent: '#444c56', icon: '⬡',  label: 'tool' },
  'hook-event':       { accent: '#d29922', icon: '⚡', label: 'hook' },
  'agent-progress':   { accent: '#ffa657', icon: '◈',  label: 'agent reasoning' },
  'compaction-event': { accent: '#8b949e', icon: '◎',  label: 'context compact' },
  'error-event':      { accent: '#f85149', icon: '✕',  label: 'api error' },
  'turn-summary':     { accent: '#3fb950', icon: '◎',  label: 'summary' },
  'pr-link':          { accent: '#bc8cff', icon: '⎇',  label: 'pull request' },
  'session-header':   { accent: '#58a6ff', icon: '◆',  label: 'session' },
};

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

function extractBodyText(step, revealFraction = 1) {
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
    const lastSpace = text.lastIndexOf(' ');
    if (lastSpace > text.length * 0.8) text = text.slice(0, lastSpace);
    text += '▌';
  }
  return text;
}

function measureCardHeight(ctx, step, revealFraction, cardW) {
  const BAR_W = 3;
  const HEADER_H = 32;
  const BODY_PAD = 12;
  const isCode = ['tool-bash', 'tool-write', 'tool-edit', 'tool-read'].includes(step.kind);
  const lineH = isCode ? 17 : 19;
  const textW = cardW - BAR_W - BODY_PAD * 2;

  ctx.font = isCode ? `11px ${MONO}` : `12px ${SANS}`;
  const bodyText = extractBodyText(step, revealFraction);
  const lines = bodyText ? wrapText(ctx, bodyText, textW) : [];
  const maxBodyLines = 8;
  const shownLines = Math.min(lines.length, maxBodyLines);

  return HEADER_H + (shownLines > 0 ? BODY_PAD + shownLines * lineH + BODY_PAD : BODY_PAD);
}

function drawCard(ctx, step, revealFraction, x, y, cardW, isCurrent, currentFraction = 1) {
  const BAR_W = 3;
  const HEADER_H = 32;
  const BODY_PAD = 12;
  const isCode = ['tool-bash', 'tool-write', 'tool-edit', 'tool-read'].includes(step.kind);
  const lineH = isCode ? 17 : 19;
  const textW = cardW - BAR_W - BODY_PAD * 2;
  const maxBodyLines = 8;

  ctx.font = isCode ? `11px ${MONO}` : `12px ${SANS}`;
  const bodyText = extractBodyText(step, revealFraction);
  const lines = bodyText ? wrapText(ctx, bodyText, textW) : [];
  const shownLines = Math.min(lines.length, maxBodyLines);
  const cardH = HEADER_H + (shownLines > 0 ? BODY_PAD + shownLines * lineH + BODY_PAD : BODY_PAD);

  const meta = KIND_META[step.kind] || { accent: BORDER, icon: '·', label: step.kind };

  ctx.fillStyle = BG1;
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, cardH, 6);
  ctx.fill();

  if (isCurrent) {
    const hexAlpha = Math.round(currentFraction * 0x55).toString(16).padStart(2, '0');
    ctx.strokeStyle = meta.accent + hexAlpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 6);
    ctx.stroke();
  }

  ctx.fillStyle = meta.accent;
  ctx.beginPath();
  ctx.roundRect(x, y, BAR_W, cardH, [6, 0, 0, 6]);
  ctx.fill();

  ctx.fillStyle = BG2;
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, HEADER_H, [6, 6, 0, 0]);
  ctx.fill();

  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + HEADER_H);
  ctx.lineTo(x + cardW, y + HEADER_H);
  ctx.stroke();

  ctx.font = `bold 12px ${SANS}`;
  ctx.fillStyle = meta.accent;
  ctx.fillText(meta.icon, x + BAR_W + 10, y + HEADER_H / 2 + 4);

  ctx.font = `bold 10px ${SANS}`;
  ctx.fillStyle = meta.accent;
  const iconW = ctx.measureText(meta.icon).width;
  ctx.fillText(meta.label.toUpperCase(), x + BAR_W + 10 + iconW + 7, y + HEADER_H / 2 + 4);

  const ts = step.event?.timestamp || step.timestamp;
  if (ts) {
    const tsStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.font = `9px ${MONO}`;
    ctx.fillStyle = TEXT_MUT;
    const tsW = ctx.measureText(tsStr).width;
    ctx.fillText(tsStr, x + cardW - 10 - tsW, y + HEADER_H / 2 + 4);
  }

  if (shownLines > 0) {
    ctx.font = isCode ? `11px ${MONO}` : `12px ${SANS}`;
    ctx.fillStyle = step.kind === 'error-event' ? '#f85149' : TEXT_PRI;
    lines.slice(0, maxBodyLines).forEach((line, i) => {
      ctx.fillText(line, x + BAR_W + BODY_PAD, y + HEADER_H + BODY_PAD + (i + 1) * lineH);
    });
    if (lines.length > maxBodyLines) {
      ctx.font = `10px ${SANS}`;
      ctx.fillStyle = TEXT_MUT;
      ctx.fillText(`… +${lines.length - maxBodyLines} more lines`, x + BAR_W + BODY_PAD, y + HEADER_H + BODY_PAD + (maxBodyLines + 1) * lineH);
    }
  }

  return cardH;
}

function drawProcessingIndicator(ctx, message, x, y, cardW, animT = 0) {
  const H = 36;
  ctx.fillStyle = BG1;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, H, 4);
  ctx.fill();
  ctx.stroke();

  const DELAYS = [0, 200, 400];
  const dotY = y + H / 2;
  const dotX0 = x + 14;
  for (let d = 0; d < 3; d++) {
    const phase = ((animT + DELAYS[d]) % 1400) / 1400;
    const opacity = 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * phase), 2);
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(dotX0 + d * 10, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.font = `11px ${SANS}`;
  ctx.fillStyle = TEXT_MUT;
  ctx.fillText(message, dotX0 + 36, dotY + 4);

  return H;
}

function renderScrollMode(ctx, W, H, history, processingMessage, lastRevealFraction, animT = 0) {
  const PAD_X = 24;
  const PAD_Y = 24;
  const GAP = 6;
  const cardW = W - PAD_X * 2;
  const currentFraction = Math.min(animT / 200, 1);

  const heights = history.map((step, i) => {
    const frac = i === history.length - 1 ? lastRevealFraction : 1;
    return measureCardHeight(ctx, step, frac, cardW);
  });
  const indicatorH = processingMessage ? 36 + GAP : 0;
  const totalH = heights.reduce((a, b) => a + b, 0) + GAP * history.length + indicatorH;

  const scrollY = Math.min(0, H - totalH - PAD_Y);
  let y = PAD_Y + scrollY;

  for (let i = 0; i < history.length; i++) {
    const step = history[i];
    const frac = i === history.length - 1 ? lastRevealFraction : 1;
    const isCurrent = i === history.length - 1;
    const cardCurrentFraction = isCurrent ? currentFraction : 1;
    if (y + heights[i] > 0 && y < H) {
      drawCard(ctx, step, frac, PAD_X, y, cardW, isCurrent, cardCurrentFraction);
    }
    y += heights[i] + GAP;
  }

  if (processingMessage) {
    drawProcessingIndicator(ctx, processingMessage, PAD_X, y, cardW, animT);
  }
}

function renderStreamMode(ctx, W, H, history, processingMessage, lastRevealFraction, animT = 0) {
  const PAD_X = 24;
  const PAD_Y = 24;
  const cardW = W - PAD_X * 2;
  const current = history[history.length - 1];
  if (!current) return;

  const BAR_W = 3;
  const HEADER_H = 36;
  const BODY_PAD = 14;
  const isCode = ['tool-bash', 'tool-write', 'tool-edit', 'tool-read'].includes(current.kind);
  const lineH = isCode ? 18 : 20;

  ctx.font = isCode ? `12px ${MONO}` : `13px ${SANS}`;
  const bodyText = extractBodyText(current, lastRevealFraction);
  const textW = cardW - BAR_W - BODY_PAD * 2;
  const lines = bodyText ? wrapText(ctx, bodyText, textW) : [];
  const indicatorH = processingMessage ? 44 : 0;
  const availH = H - PAD_Y * 2 - indicatorH;
  const maxLines = Math.max(1, Math.floor((availH - HEADER_H - BODY_PAD * 2) / lineH));

  const cardH = availH;
  const meta = KIND_META[current.kind] || { accent: BORDER, icon: '·', label: current.kind };

  ctx.fillStyle = BG1;
  ctx.beginPath();
  ctx.roundRect(PAD_X, PAD_Y, cardW, cardH, 6);
  ctx.fill();

  const currentFraction = Math.min(animT / 200, 1);
  const hexAlpha = Math.round(currentFraction * 0x55).toString(16).padStart(2, '0');
  ctx.strokeStyle = meta.accent + hexAlpha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(PAD_X, PAD_Y, cardW, cardH, 6);
  ctx.stroke();

  ctx.fillStyle = meta.accent;
  ctx.beginPath();
  ctx.roundRect(PAD_X, PAD_Y, BAR_W, cardH, [6, 0, 0, 6]);
  ctx.fill();

  ctx.fillStyle = BG2;
  ctx.beginPath();
  ctx.roundRect(PAD_X, PAD_Y, cardW, HEADER_H, [6, 6, 0, 0]);
  ctx.fill();

  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X, PAD_Y + HEADER_H);
  ctx.lineTo(PAD_X + cardW, PAD_Y + HEADER_H);
  ctx.stroke();

  ctx.font = `bold 14px ${SANS}`;
  ctx.fillStyle = meta.accent;
  ctx.fillText(meta.icon, PAD_X + BAR_W + 12, PAD_Y + HEADER_H / 2 + 5);

  ctx.font = `bold 12px ${SANS}`;
  const iconW = ctx.measureText(meta.icon).width;
  ctx.fillStyle = meta.accent;
  ctx.fillText(meta.label.toUpperCase(), PAD_X + BAR_W + 12 + iconW + 8, PAD_Y + HEADER_H / 2 + 5);

  const ts = current.event?.timestamp || current.timestamp;
  if (ts) {
    const tsStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = TEXT_MUT;
    const tsW = ctx.measureText(tsStr).width;
    ctx.fillText(tsStr, PAD_X + cardW - 12 - tsW, PAD_Y + HEADER_H / 2 + 5);
  }

  if (lines.length > 0) {
    ctx.font = isCode ? `12px ${MONO}` : `13px ${SANS}`;
    ctx.fillStyle = current.kind === 'error-event' ? '#f85149' : TEXT_PRI;
    lines.slice(0, maxLines).forEach((line, i) => {
      ctx.fillText(line, PAD_X + BAR_W + BODY_PAD, PAD_Y + HEADER_H + BODY_PAD + (i + 1) * lineH);
    });
    if (lines.length > maxLines) {
      ctx.font = `11px ${SANS}`;
      ctx.fillStyle = TEXT_MUT;
      ctx.fillText(`… +${lines.length - maxLines} more lines`, PAD_X + BAR_W + BODY_PAD, PAD_Y + HEADER_H + BODY_PAD + (maxLines + 1) * lineH);
    }
  }

  if (processingMessage) {
    drawProcessingIndicator(ctx, processingMessage, PAD_X, PAD_Y + cardH + 6, cardW, animT);
  }
}

function renderFocusedMode(ctx, W, H, history, processingMessage, lastRevealFraction, animT = 0) {
  const PAD_X = 24;
  const PAD_Y = 24;
  const GAP = 8;
  const cardW = W - PAD_X * 2;
  const indicatorH = processingMessage ? 44 + GAP : 0;

  const current = history[history.length - 1];
  if (!current) return;

  const currentH = measureCardHeight(ctx, current, lastRevealFraction, cardW);

  const priorCount = Math.min(2, history.length - 1);
  const priorSteps = history.slice(history.length - 1 - priorCount, history.length - 1);

  const bottomY = H - PAD_Y - indicatorH - currentH - GAP;
  let y = PAD_Y;

  if (priorSteps.length > 0) {
    const priorH = Math.min(bottomY / priorSteps.length - GAP, 80);
    y = bottomY - priorSteps.length * (priorH + GAP);

    ctx.save();
    ctx.globalAlpha = 0.35;
    for (const step of priorSteps) {
      drawCard(ctx, step, 1, PAD_X, y, cardW, false);
      y += priorH + GAP;
    }
    ctx.restore();
  }

  const currentY = H - PAD_Y - indicatorH - currentH;
  const currentFraction = Math.min(animT / 200, 1);
  drawCard(ctx, current, lastRevealFraction, PAD_X, currentY, cardW, true, currentFraction);

  if (processingMessage) {
    drawProcessingIndicator(ctx, processingMessage, PAD_X, H - PAD_Y - indicatorH + GAP, cardW, animT);
  }
}

function renderHistoryToCanvas(canvas, history, processingMessage, lastRevealFraction = 1, renderMode = 'scroll', animT = 0) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG0;
  ctx.fillRect(0, 0, W, H);

  if (!history || history.length === 0) return;

  if (renderMode === 'stream') {
    renderStreamMode(ctx, W, H, history, processingMessage, lastRevealFraction, animT);
  } else if (renderMode === 'focused') {
    renderFocusedMode(ctx, W, H, history, processingMessage, lastRevealFraction, animT);
  } else {
    renderScrollMode(ctx, W, H, history, processingMessage, lastRevealFraction, animT);
  }
}

// Worker state — initialized on first 'init' message
let canvas = null;
let ctx = null;

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    canvas = new OffscreenCanvas(data.W, data.H);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    return;
  }

  if (data.type === 'render') {
    const { frameIndex, history, processingMsg, revealFraction, renderMode, animT } = data;
    renderHistoryToCanvas(canvas, history, processingMsg, revealFraction, renderMode, animT);
    // getImageData forces the 2D context to flush all pending draw calls,
    // same as on the main thread.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    // Transfer the buffer — zero-copy ownership hand-off to main thread
    self.postMessage({ frameIndex, pixels }, [pixels.buffer]);
  }
};
