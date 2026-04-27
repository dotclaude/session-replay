// Session metadata extraction (ported from bridge server.js L180-244)

export interface SessionSummary {
  title: string | null;
  summary: string | null;
  firstTs: string | null;
  lastTs: string | null;
  cwd: string | null;
  gitBranch: string | null;
  prLinks: Array<{ url: string; number: number; repo: string }>;
  turnCount: number;
  humanTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCounts: Record<string, number>;
  lineCount: number;
  subAgentCount: number;
  compactionCount: number;
  errorCount: number;
  fromIndex?: boolean;
}

export function summariseFromIndex(entry: any): SessionSummary {
  return {
    title: entry.summary || null,
    summary: entry.firstPrompt !== 'No prompt' ? entry.firstPrompt?.slice(0, 160) : null,
    firstTs: entry.created || null,
    lastTs: entry.modified || null,
    cwd: entry.projectPath || null,
    gitBranch: entry.gitBranch || null,
    prLinks: [],
    turnCount: 0,
    humanTurns: Math.max(0, (entry.messageCount || 0) - 1),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    toolCounts: {},
    lineCount: entry.messageCount || 0,
    subAgentCount: 0,
    compactionCount: 0,
    errorCount: 0,
    fromIndex: true,
  };
}

export function summariseSession(lines: any[]): SessionSummary {
  let title: string | null = null;
  let summary: string | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  const prLinks: Array<{ url: string; number: number; repo: string }> = [];
  let turnCount = 0;
  const toolCounts: Record<string, number> = {};
  let humanTurns = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let subAgentCount = 0;
  let compactionCount = 0;
  let errorCount = 0;

  for (const obj of lines) {
    if (!firstTs && obj.timestamp) firstTs = obj.timestamp;
    if (obj.timestamp) lastTs = obj.timestamp;
    if (!cwd && obj.cwd) cwd = obj.cwd;
    if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
    if (obj.type === 'custom-title' && !title) title = obj.customTitle;
    if (obj.type === 'system' && obj.subtype === 'away_summary' && !summary) summary = obj.content;
    if (obj.type === 'system' && obj.subtype === 'turn_duration') turnCount++;
    if (obj.type === 'system' && obj.subtype === 'compact_boundary') compactionCount++;
    if (obj.type === 'system' && obj.subtype === 'api_error') errorCount++;
    if (obj.type === 'pr-link') prLinks.push({ url: obj.prUrl, number: obj.prNumber, repo: obj.prRepository });
    if (obj.type === 'user') {
      const content = obj.message?.content;
      if (typeof content === 'string') humanTurns++;
    }
    if (obj.type === 'assistant') {
      const usage = obj.message?.usage;
      if (usage) {
        totalInputTokens += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
        totalOutputTokens += usage.output_tokens || 0;
      }
      for (const block of obj.message?.content || []) {
        if (block.type === 'tool_use') {
          toolCounts[block.name] = (toolCounts[block.name] || 0) + 1;
          // Count Agent tool uses as sub-agents
          if (block.name === 'Agent') subAgentCount++;
        }
      }
    }
  }

  return {
    title,
    summary: summary?.slice(0, 160) || null,
    firstTs,
    lastTs,
    cwd,
    gitBranch,
    prLinks,
    turnCount,
    humanTurns,
    totalInputTokens,
    totalOutputTokens,
    toolCounts,
    lineCount: lines.length,
    subAgentCount,
    compactionCount,
    errorCount,
  };
}
