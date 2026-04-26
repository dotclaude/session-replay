/**
 * computeSessionStats
 *
 * Pure function — call once after buildSteps. Never recomputed during playback.
 * Returns a SessionStats object used by StatsPanel and the SessionClock.
 */

const PRICE_PER_M = {
  'claude-opus-4':   { input: 15,   output: 75 },
  'claude-sonnet-4': { input: 3,    output: 15 },
  'claude-haiku-4':  { input: 0.8,  output: 4  },
};

export function estimateCost(modelId, inputTokens, outputTokens) {
  if (!modelId) return null;
  const key = Object.keys(PRICE_PER_M).find(k => modelId.includes(k));
  if (!key) return null;
  const p = PRICE_PER_M[key];
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

export function computeSessionStats(steps) {
  const stats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    turns: [],
    modelUsage: {},
    toolUsage: {},
    cacheHitRate: null,
    hooksFrequency: {},
    hookEvents: [],
    compactionEvents: [],
    agentCalls: [],
    errorEvents: [],
    backgroundTaskTiming: { totalMs: 0, taskCount: 0 },
  };

  let currentTurn = null;

  function flushTurn() {
    if (!currentTurn) return;
    currentTurn.models = [...new Set(currentTurn.models)];
    // Count turns per model here, once per flush, so multi-model turns don't double-count
    for (const model of currentTurn.models) {
      if (stats.modelUsage[model]) stats.modelUsage[model].turns++;
    }
    stats.turns.push(currentTurn);
    currentTurn = null;
  }

  function ensureTurn(humanStep) {
    flushTurn();
    currentTurn = {
      turnIndex: stats.turns.length,
      humanText: humanStep.event.text?.slice(0, 80) || '',
      humanStepIndex: humanStep.index,
      durationMs: humanStep.event.turnDurationMs || null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      models: [],
      toolCounts: {},
      stepRange: [humanStep.index, humanStep.index],
    };
  }

  for (const step of steps) {
    const { kind, event, index } = step;

    if (kind === 'session-header') continue;

    if (kind === 'human') {
      ensureTurn(step);
      continue;
    }

    // Update stepRange after handling human (so new turn owns its own start)
    if (currentTurn) currentTurn.stepRange[1] = index;

    if (kind === 'assistant-text' || kind === 'tool-bash' || kind === 'tool-write' ||
        kind === 'tool-edit' || kind === 'tool-read' || kind === 'tool-agent' ||
        kind === 'tool-web' || kind === 'tool-task' || kind === 'tool-generic') {

      const usage = event.usage || {};
      const inp = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
      const out = usage.output_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheCreate = usage.cache_creation_input_tokens || 0;

      stats.totalInputTokens += inp;
      stats.totalOutputTokens += out;
      stats.totalCacheReadTokens += cacheRead;
      stats.totalCacheCreationTokens += cacheCreate;

      if (currentTurn) {
        currentTurn.inputTokens += inp;
        currentTurn.outputTokens += out;
        currentTurn.cacheReadTokens += cacheRead;
        currentTurn.cacheCreationTokens += cacheCreate;
      }

      // Model tracking — skip synthetic (compaction-injected) messages
      const model = event.model;
      if (model && model !== '<synthetic>') {
        if (!stats.modelUsage[model]) stats.modelUsage[model] = { turns: 0, inputTokens: 0, outputTokens: 0 };
        stats.modelUsage[model].inputTokens += inp;
        stats.modelUsage[model].outputTokens += out;
        if (currentTurn && !currentTurn.models.includes(model)) {
          currentTurn.models.push(model);
          // Only count turns once per model (at flush time below)
        }
      }

      // Tool usage
      const toolName = event.toolName;
      if (toolName) {
        if (!stats.toolUsage[toolName]) stats.toolUsage[toolName] = { count: 0, stepIndices: [] };
        stats.toolUsage[toolName].count++;
        stats.toolUsage[toolName].stepIndices.push(index);
        if (currentTurn) {
          currentTurn.toolCounts[toolName] = (currentTurn.toolCounts[toolName] || 0) + 1;
        }
      }
      continue;
    }

    if (kind === 'hook-event') {
      const name = event.hookName || 'unknown';
      stats.hooksFrequency[name] = (stats.hooksFrequency[name] || 0) + 1;
      stats.hookEvents.push({ hookName: name, hookEvent: event.hookEvent, command: event.command, timestamp: event.timestamp, stepIndex: index });
      continue;
    }

    if (kind === 'compaction-event') {
      stats.compactionEvents.push({ preTokens: event.preTokens, trigger: event.trigger, preCompactDiscoveredTools: event.preCompactDiscoveredTools, timestamp: event.timestamp, stepIndex: index });
      // Mark next turn as post-compaction so the UI can flag it
      if (currentTurn) currentTurn.hasCompactionBefore = true;
      continue;
    }

    if (kind === 'agent-progress') {
      stats.agentCalls.push({ agentId: event.agentId, prompt: event.prompt, stepIndex: index, timestamp: event.timestamp });
      continue;
    }

    if (kind === 'error-event') {
      stats.errorEvents.push({ error: event.error, timestamp: event.timestamp, stepIndex: index });
      continue;
    }

    if (kind === 'queue-op' && event.operation === 'enqueue') {
      stats.backgroundTaskTiming.taskCount++;
      stats.backgroundTaskTiming.totalMs += event.durationMs || 0;
      continue;
    }
  }

  flushTurn();

  // Cache hit rate
  const totalCache = stats.totalCacheReadTokens + stats.totalCacheCreationTokens;
  if (totalCache > 0) {
    stats.cacheHitRate = stats.totalCacheReadTokens / totalCache;
  }

  return stats;
}
