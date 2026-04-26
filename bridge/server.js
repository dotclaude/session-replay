import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import busboy from 'busboy';

const execFileAsync = promisify(execFile);

const app = express();
const PORT = 3001;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

app.use(cors());
// Only parse JSON on non-encode routes — encode uses multipart (busboy) and
// must not be pre-consumed by the JSON body parser.
app.use((req, res, next) => {
  if (req.path === '/api/encode') return next();
  express.json()(req, res, next);
});

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonLines(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      try { parsed.push(JSON.parse(line)); } catch { }
    }
    return parsed;
  } catch { return []; }
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function isUuidDir(name) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(name);
}

// ---------------------------------------------------------------------------
// Session discovery — handles all three storage formats
//
// Format A: <proj>/<session-uuid>.jsonl                (current)
// Format B: <proj>/sessions-index.json                 (older — index may point to missing files)
// Format C: <proj>/<session-uuid>/subagents/agent-*.jsonl  (sub-agent sessions)
// ---------------------------------------------------------------------------

function discoverSessionFiles(projPath) {
  const results = []; // { id, jsonlPath, indexEntry, isSubAgent, ... }

  let entries;
  try { entries = fs.readdirSync(projPath); } catch { return results; }

  const seenMain = new Set();    // base session UUIDs
  const seenAgent = new Set();   // composite sub-agent IDs

  // Format A: direct *.jsonl files in project root
  for (const f of entries) {
    if (!f.endsWith('.jsonl')) continue;
    const id = path.basename(f, '.jsonl');
    if (!isUuidDir(id)) continue;
    const full = path.join(projPath, f);
    if (fs.existsSync(full)) {
      results.push({ id, jsonlPath: full, indexEntry: null });
      seenMain.add(id);
    }
  }

  // Format B: sessions-index.json
  const indexPath = path.join(projPath, 'sessions-index.json');
  if (fs.existsSync(indexPath)) {
    const index = readJson(indexPath);
    for (const entry of index?.entries || []) {
      if (seenMain.has(entry.sessionId)) {
        // Already have the file — just supplement the existing entry with index metadata
        const existing = results.find(r => r.id === entry.sessionId);
        if (existing) existing.indexEntry = entry;
        continue;
      }
      const candidate = entry.fullPath || path.join(projPath, `${entry.sessionId}.jsonl`);
      results.push({
        id: entry.sessionId,
        jsonlPath: fs.existsSync(candidate) ? candidate : null,
        indexEntry: entry,
      });
      seenMain.add(entry.sessionId);
    }
  }

  // Format C: UUID subdirs containing subagents/agent-*.jsonl
  for (const f of entries) {
    if (!isUuidDir(f)) continue;
    const subDir = path.join(projPath, f, 'subagents');
    if (!fs.existsSync(subDir)) continue;

    const parentHasMainJsonl = seenMain.has(f);

    // If the parent session JSONL is missing, synthesize a virtual session entry
    // from the sub-agent files so the content is still discoverable.
    if (!parentHasMainJsonl) {
      let agentFiles;
      try { agentFiles = fs.readdirSync(subDir); } catch { continue; }
      const substantiveAgents = agentFiles.filter(af =>
        af.endsWith('.jsonl') && !af.includes('.meta.')
      );
      if (substantiveAgents.length === 0) continue;

      // Use the first sub-agent's first prompt as the synthetic summary
      let syntheticSummary = null;
      let syntheticTs = null;
      for (const af of substantiveAgents.slice(0, 1)) {
        const lines = readJsonLines(path.join(subDir, af));
        for (const obj of lines) {
          if (!syntheticTs && obj.timestamp) syntheticTs = obj.timestamp;
          if (obj.type === 'user') {
            const c = obj.message?.content;
            const text = typeof c === 'string' ? c
              : Array.isArray(c) ? (c.find(b => b.type === 'text')?.text || '') : '';
            if (text && text.length > 10) { syntheticSummary = text.slice(0, 160); break; }
          }
        }
      }

      results.push({
        id: f,
        jsonlPath: null,
        indexEntry: null,
        isOrphaned: true,   // parent JSONL gone, but sub-agents exist
        subAgentCount: substantiveAgents.length,
        syntheticSummary,
        syntheticTs,
      });
      seenMain.add(f);
    }

    let agentFiles;
    try { agentFiles = fs.readdirSync(subDir); } catch { continue; }
    for (const af of agentFiles) {
      if (!af.endsWith('.jsonl') || af.includes('.meta.')) continue;
      const agentId = path.basename(af, '.jsonl');
      const compositeId = `${f}__${agentId}`;
      if (seenAgent.has(compositeId)) continue;

      // Read .meta.json if available for agent description
      let agentMeta = null;
      const metaPath = path.join(subDir, `${agentId}.meta.json`);
      if (fs.existsSync(metaPath)) agentMeta = readJson(metaPath);

      results.push({
        id: compositeId,
        jsonlPath: path.join(subDir, af),
        indexEntry: null,
        isSubAgent: true,
        parentSessionId: f,
        agentId,
        agentType: agentMeta?.agentType || null,
        agentDescription: agentMeta?.description || null,
      });
      seenAgent.add(compositeId);
    }
  }

  return results;
}

function summariseFromIndex(entry) {
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
    fromIndex: true,
  };
}

function summariseSession(lines) {
  let title = null;
  let summary = null;
  let firstTs = null;
  let lastTs = null;
  let cwd = null;
  let gitBranch = null;
  const prLinks = [];
  let turnCount = 0;
  const toolCounts = {};
  let humanTurns = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const obj of lines) {
    if (!firstTs && obj.timestamp) firstTs = obj.timestamp;
    if (obj.timestamp) lastTs = obj.timestamp;
    if (!cwd && obj.cwd) cwd = obj.cwd;
    if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
    if (obj.type === 'custom-title' && !title) title = obj.customTitle;
    if (obj.type === 'system' && obj.subtype === 'away_summary' && !summary) summary = obj.content;
    if (obj.type === 'system' && obj.subtype === 'turn_duration') turnCount++;
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
        if (block.type === 'tool_use') toolCounts[block.name] = (toolCounts[block.name] || 0) + 1;
      }
    }
  }

  return {
    title, summary: summary?.slice(0, 160) || null,
    firstTs, lastTs, cwd, gitBranch, prLinks,
    turnCount, humanTurns, totalInputTokens, totalOutputTokens,
    toolCounts, lineCount: lines.length,
  };
}

function extractCwdFromProject(projDirName, sessionFiles) {
  // Try sessions-index.json first (cheap)
  const indexPath = path.join(PROJECTS_DIR, projDirName, 'sessions-index.json');
  const index = readJson(indexPath);
  if (index?.originalPath) return index.originalPath;
  if (index?.entries?.[0]?.projectPath) return index.entries[0].projectPath;

  // Fall back to reading first available JSONL
  for (const s of sessionFiles) {
    if (!s.jsonlPath) continue;
    const lines = readJsonLines(s.jsonlPath);
    for (const obj of lines) {
      if (obj.cwd) return obj.cwd;
    }
  }

  // Last resort: decode dir name
  return null;
}

function labelFromCwd(cwd, dirName) {
  if (cwd) return path.basename(cwd);
  return dirName.replace(/^-/, '').replace(/-/g, '/');
}


// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/projects
app.get('/api/projects', (req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) return res.json([]);

  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch { return res.json([]); }

  const projects = [];

  for (const dir of dirs) {
    const fullPath = path.join(PROJECTS_DIR, dir);
    try {
      if (!fs.statSync(fullPath).isDirectory()) continue;
    } catch { continue; }

    const sessions = discoverSessionFiles(fullPath);
    if (sessions.length === 0) continue;

    const cwd = extractCwdFromProject(dir, sessions);
    const label = labelFromCwd(cwd, dir);

    let firstTs = null;
    const indexPath = path.join(fullPath, 'sessions-index.json');
    const index = readJson(indexPath);
    if (index?.entries?.length) {
      firstTs = index.entries.reduce((best, e) =>
        (e.modified || e.created || '') > (best || '') ? (e.modified || e.created) : best, null);
    }
    if (!firstTs) {
      for (const s of sessions) {
        if (!s.jsonlPath) continue;
        try {
          const mtime = fs.statSync(s.jsonlPath).mtime.toISOString();
          if (!firstTs || mtime > firstTs) firstTs = mtime;
        } catch { }
      }
    }

    const sessionCount = sessions.filter(s => !s.isSubAgent && (s.jsonlPath || s.isOrphaned)).length;
    const subAgentCount = sessions.filter(s => s.isSubAgent && s.jsonlPath).length;

    // Skip projects with nothing replayable at all
    if (sessionCount === 0 && subAgentCount === 0) continue;

    projects.push({ id: dir, label, cwd, sessionCount, subAgentCount, firstTs });
  }

  projects.sort((a, b) => (b.firstTs || '').localeCompare(a.firstTs || ''));
  res.json(projects);
});

// GET /api/projects/:id/sessions
app.get('/api/projects/:id/sessions', (req, res) => {
  const projId = req.params.id;

  const projPath = path.join(PROJECTS_DIR, projId);
  if (!fs.existsSync(projPath)) return res.status(404).json({ error: 'Project not found' });

  const sessions = discoverSessionFiles(projPath);
  const results = [];

  for (const s of sessions) {
    // Orphaned session: parent JSONL gone but sub-agents exist — show as browseable
    if (s.isOrphaned) {
      results.push({
        id: s.id,
        projectId: req.params.id,
        isSubAgent: false,
        isOrphaned: true,
        title: null,
        summary: s.syntheticSummary,
        firstTs: s.syntheticTs,
        lastTs: s.syntheticTs,
        cwd: null,
        gitBranch: null,
        prLinks: [],
        turnCount: 0,
        humanTurns: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCounts: {},
        lineCount: 0,
        subAgentCount: s.subAgentCount,
      });
      continue;
    }

    // Skip sessions with no JSONL on disk and not orphaned — nothing to show
    if (!s.jsonlPath) continue;

    const lines = readJsonLines(s.jsonlPath);
    if (lines.length === 0) continue;

    const meta = summariseSession(lines);

    // Supplement with index entry metadata where JSONL lacks it
    if (s.indexEntry) {
      if (!meta.summary && s.indexEntry.firstPrompt !== 'No prompt') meta.summary = s.indexEntry.firstPrompt?.slice(0, 160);
      if (!meta.title && s.indexEntry.summary) meta.title = s.indexEntry.summary;
    }

    results.push({
      id: s.id,
      projectId: req.params.id,
      isSubAgent: s.isSubAgent || false,
      parentSessionId: s.parentSessionId || null,
      agentId: s.agentId || null,
      ...meta,
    });
  }

  results.sort((a, b) => (b.firstTs || '').localeCompare(a.firstTs || ''));
  res.json(results);
});

// GET /api/sessions/:id — raw lines (handles composite IDs for sub-agents)
app.get('/api/sessions/:id', (req, res) => {
  const sessionId = req.params.id;
  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch { return res.status(500).json({ error: 'Cannot read projects dir' }); }

  // Handle composite sub-agent ID: "parentUuid__agentId"
  if (sessionId.includes('__')) {
    const [parentUuid, agentId] = sessionId.split('__');
    for (const dir of dirs) {
      const candidate = path.join(PROJECTS_DIR, dir, parentUuid, 'subagents', `${agentId}.jsonl`);
      if (fs.existsSync(candidate)) {
        return res.json(readJsonLines(candidate));
      }
    }
    return res.status(404).json({ error: 'Sub-agent session not found' });
  }

  // Format A: direct .jsonl
  for (const dir of dirs) {
    const candidate = path.join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return res.json(readJsonLines(candidate));
    }
  }

  // Format B: sessions-index.json → fullPath
  for (const dir of dirs) {
    const indexPath = path.join(PROJECTS_DIR, dir, 'sessions-index.json');
    const index = readJson(indexPath);
    const entry = index?.entries?.find(e => e.sessionId === sessionId);
    if (entry?.fullPath && fs.existsSync(entry.fullPath)) {
      return res.json(readJsonLines(entry.fullPath));
    }
  }

  // Orphaned session: no root JSONL but subagents dir exists — synthesize from sub-agents
  for (const dir of dirs) {
    const subDir = path.join(PROJECTS_DIR, dir, sessionId, 'subagents');
    if (!fs.existsSync(subDir)) continue;

    let agentFiles;
    try { agentFiles = fs.readdirSync(subDir); } catch { continue; }
    const jsonlFiles = agentFiles
      .filter(f => f.endsWith('.jsonl') && !f.includes('.meta.'))
      .sort();

    if (jsonlFiles.length === 0) continue;

    // Concatenate all sub-agent lines, injecting a synthetic agent-name entry between each
    const allLines = [];
    for (const af of jsonlFiles) {
      const agentId = path.basename(af, '.jsonl');
      const metaPath = path.join(subDir, `${agentId}.meta.json`);
      const meta = fs.existsSync(metaPath) ? readJson(metaPath) : {};

      // Inject synthetic agent-name separator so the replay knows which agent is starting
      allLines.push({
        type: 'agent-name',
        agentName: meta?.description || meta?.agentType || agentId,
        agentType: meta?.agentType || null,
        sessionId,
        isSubAgentSection: true,
        subAgentId: agentId,
      });

      allLines.push(...readJsonLines(path.join(subDir, af)));
    }

    return res.json(allLines);
  }

  res.status(404).json({ error: 'Session not found' });
});

// POST /api/encode
// Multipart form: fields format/fps/width + file fields frame0, frame1, ... (PNG blobs)
// Returns: binary video file
app.post('/api/encode', (req, res) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-replay-'));
  const fields = { format: 'mp4', fps: '10', width: '900' };
  const frameWriters = [];
  let frameCount = 0;

  const bb = busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } });

  bb.on('field', (name, val) => { fields[name] = val; });

  bb.on('file', (name, stream) => {
    const idx = frameCount++;
    const filePath = path.join(tmpDir, `f${String(idx).padStart(5, '0')}.png`);
    const writer = fs.createWriteStream(filePath);
    frameWriters.push(new Promise((resolve, reject) => {
      stream.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    }));
  });

  bb.on('finish', async () => {
    try {
      await Promise.all(frameWriters);

      if (frameCount === 0) return res.status(400).json({ error: 'no frames received' });

      const { format, fps, width } = fields;
      const outFile = path.join(tmpDir, `out.${format}`);
      const framePattern = path.join(tmpDir, 'f%05d.png');
      const scaleW = parseInt(width) % 2 === 0 ? width : String(parseInt(width) + 1);

      if (format === 'gif') {
        const palette = path.join(tmpDir, 'palette.png');
        await execFileAsync('ffmpeg', ['-framerate', fps, '-i', framePattern, '-vf', `scale=${scaleW}:-1:flags=lanczos,palettegen`, palette]);
        await execFileAsync('ffmpeg', ['-framerate', fps, '-i', framePattern, '-i', palette, '-lavfi', `scale=${scaleW}:-1:flags=lanczos[x];[x][1:v]paletteuse`, '-y', outFile]);
        res.setHeader('Content-Type', 'image/gif');
      } else if (format === 'webm') {
        await execFileAsync('ffmpeg', ['-framerate', fps, '-i', framePattern, '-vf', `scale=${scaleW}:-2`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-y', outFile]);
        res.setHeader('Content-Type', 'video/webm');
      } else {
        await execFileAsync('ffmpeg', ['-framerate', fps, '-i', framePattern, '-vf', `scale=${scaleW}:-2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-y', outFile]);
        res.setHeader('Content-Type', 'video/mp4');
      }

      res.setHeader('Content-Disposition', `attachment; filename="export.${format}"`);
      res.send(fs.readFileSync(outFile));
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message || String(e) });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  bb.on('error', e => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (!res.headersSent) res.status(500).json({ error: e.message });
  });

  req.pipe(bb);
});

// GET /api/sessions/:id/meta
app.get('/api/sessions/:id/meta', (req, res) => {
  const sessionId = req.params.id;
  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch { return res.status(500).json({ error: 'Cannot read projects dir' }); }

  for (const dir of dirs) {
    const candidate = path.join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return res.json(summariseSession(readJsonLines(candidate)));
    }
  }
  res.status(404).json({ error: 'Session not found' });
});

const server = app.listen(PORT, () => {
  console.log(`Bridge server running on http://localhost:${PORT}`);
  console.log(`Reading from ${CLAUDE_DIR}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Kill it with: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  } else {
    throw err;
  }
});
