# Bridge Capabilities Catalog

Comprehensive itemization of what the bridge server does and how to replicate each capability client-side.

---

## Category 1: Session Discovery & Enumeration

### 1.1 Project Directory Scanning
**Bridge code:** `server.js:277-325`  
**What it does:** Lists all project directories in `~/.claude/projects/`, counts sessions per project  
**Client replacement:** `FileSystemDirectoryHandle.entries()` → filter directories → recursive scan  
**Complexity:** Low  
**Status:** ✅ Directly portable

### 1.2 Multi-Format Session Detection
**Bridge code:** `server.js:62-178` (`discoverSessionFiles()`)  
**What it does:** Discovers sessions across 3 storage formats:
- **Format A** (current): `<proj>/<uuid>.jsonl` files in project root
- **Format B** (legacy): `<proj>/sessions-index.json` with file path references
- **Format C** (sub-agents): `<proj>/<uuid>/subagents/agent-*.jsonl` hierarchy

**Client replacement:** Port same traversal logic using:
- `dirHandle.entries()` for directory iteration
- `dirHandle.getFileHandle()` for file reads
- `dirHandle.getDirectoryHandle()` for subdirectory access

**Complexity:** Medium (nested async iteration)  
**Status:** ✅ Directly portable

### 1.3 UUID Validation
**Bridge code:** `server.js:50-52` (`isUuidDir()`)  
**What it does:** Regex check for valid session UUID format  
**Client replacement:** Copy function exactly  
**Complexity:** Trivial  
**Status:** ✅ Direct copy

### 1.4 Orphaned Session Synthesis
**Bridge code:** `server.js:114-147`  
**What it does:** When parent session JSONL is missing but `subagents/` dir exists:
- Reads first sub-agent file
- Extracts first user prompt as synthetic summary
- Creates virtual session entry so sub-agents remain discoverable

**Client replacement:** Same logic with file system handles  
**Complexity:** Medium (requires conditional directory checks)  
**Status:** ✅ Directly portable

### 1.5 Project Label Extraction
**Bridge code:** `server.js:246-269` (`extractCwdFromProject()`, `labelFromCwd()`)  
**What it does:** 
1. Check `sessions-index.json` for `originalPath` or first entry's `projectPath`
2. Fall back to reading first JSONL for `cwd` field
3. Last resort: decode hyphenated directory name

**Client replacement:** Same waterfall strategy  
**Complexity:** Low  
**Status:** ✅ Directly portable

---

## Category 2: Session Content Reading

### 2.1 JSONL File Parsing
**Bridge code:** `server.js:35-44` (`readJsonLines()`)  
**What it does:** 
- Read file as UTF-8
- Split on `\n`
- Parse each line as JSON
- Skip invalid lines silently

**Client replacement:**
```ts
const file = await fileHandle.getFile();
const text = await file.text();
const lines = text.split('\n').filter(Boolean);
const parsed = lines.map(line => {
  try { return JSON.parse(line); }
  catch { return null; }
}).filter(Boolean);
```

**Complexity:** Trivial  
**Status:** ✅ Direct port

### 2.2 Session Metadata Extraction
**Bridge code:** `server.js:199-244` (`summariseSession()`)  
**What it does:** Single-pass scan of JSONL to extract:
- `title` — From `custom-title` event
- `summary` — From `away_summary` event
- `firstTs` / `lastTs` — First/last timestamp
- `cwd` / `gitBranch` — Project context
- `prLinks` — Array of PR references
- `turnCount` — Count of `turn_duration` events
- `humanTurns` — Count of user messages
- `totalInputTokens` / `totalOutputTokens` — Sum from `usage` fields
- `toolCounts` — Frequency map of tool names

**Client replacement:** Port function exactly (operates on already-parsed array)  
**Complexity:** Low  
**Status:** ✅ Direct port (pure function, no I/O)

### 2.3 Index-Based Metadata
**Bridge code:** `server.js:180-197` (`summariseFromIndex()`)  
**What it does:** When JSONL unavailable, extract metadata from `sessions-index.json` entry:
- `summary` → `firstPrompt`
- `title` → `summary`
- `firstTs` → `created`
- `lastTs` → `modified`
- `cwd` → `projectPath`

**Client replacement:** Port function exactly  
**Complexity:** Trivial  
**Status:** ✅ Direct port (pure function)

### 2.4 Sub-Agent Metadata Loading
**Bridge code:** `server.js:159-172`  
**What it does:** Reads `.meta.json` file next to sub-agent JSONL:
```json
{
  "agentType": "Explore",
  "description": "Search codebase for X"
}
```

**Client replacement:** `getFileHandle('agent-123.meta.json')` → `file.text()` → `JSON.parse()`  
**Complexity:** Low  
**Status:** ✅ Directly portable

### 2.5 Sub-Agent Concatenation
**Bridge code:** `server.js:440-460`  
**What it does:** For orphaned sessions, concatenate all sub-agent files:
1. Sort `subagents/*.jsonl` files
2. For each file:
   - Inject synthetic `agent-name` separator event
   - Append all JSONL lines
3. Return concatenated array

**Client replacement:** Same logic with async file reads  
**Complexity:** Medium (nested async iteration)  
**Status:** ✅ Directly portable

---

## Category 3: Video Encoding

### 3.1 Frame Upload & ffmpeg Orchestration
**Bridge code:** `server.js:469-529` (`POST /api/encode`)  
**What it does:**
1. Accept multipart form with fields `format`, `fps`, `width`
2. Accept file fields `frame0`, `frame1`, ... (PNG blobs)
3. Write frames to temp directory as `f00000.png`, `f00001.png`, ...
4. Spawn system `ffmpeg` with format-specific args:
   - **GIF:** Two-pass palette generation
   - **WebM:** libvpx-vp9 with CRF 30
   - **MP4:** libx264 with yuv420p
5. Stream binary video file back
6. Clean up temp directory

**Client replacement options:**

#### Option A: WebAssembly ffmpeg (@ffmpeg/ffmpeg)
```ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
const ffmpeg = new FFmpeg();
await ffmpeg.load(); // 30MB WASM download

for (let i = 0; i < frames.length; i++) {
  await ffmpeg.writeFile(`f${i}.png`, frames[i]);
}

await ffmpeg.exec([
  '-framerate', fps,
  '-i', 'f%d.png',
  '-c:v', 'libx264',
  'out.mp4'
]);

const data = await ffmpeg.readFile('out.mp4');
```

**Pros:** Same formats, offline capable  
**Cons:** 30MB bundle, 5-10x slower, requires COOP/COEP headers  
**Complexity:** Medium

#### Option B: Frame export as ZIP
```ts
import JSZip from 'jszip';

const zip = new JSZip();
frames.forEach((blob, i) => {
  zip.file(`frame-${i.toString().padStart(5, '0')}.png`, blob);
});

zip.file('encode.sh', `#!/bin/bash
ffmpeg -framerate ${fps} -i frame-%05d.png -c:v libx264 output.mp4
`);

return await zip.generateAsync({ type: 'blob' });
```

**Pros:** Lightweight, user controls quality  
**Cons:** Manual extra step  
**Complexity:** Low

#### Option C: Drop video formats
Keep GIF export only (already works via gif.js worker).

**Recommendation:** Start with Option B, upgrade to Option A if demanded.

**Complexity:** Medium (Option A) / Low (Option B) / None (Option C)  
**Status:** 🔄 Needs decision

---

## Category 4: HTTP Scaffolding

### 4.1 CORS Configuration
**Bridge code:** `server.js:17` (`app.use(cors())`)  
**What it does:** Allow cross-origin requests from Vite dev server  
**Client replacement:** N/A (no server)  
**Status:** ✅ Obsolete

### 4.2 COOP/COEP Headers
**Bridge code:** `server.js:25-29`  
**What it does:** Set SharedArrayBuffer-enabling headers (needed for ffmpeg WASM)  
**Client replacement:** Add to GitHub Pages headers or Netlify config if using WASM ffmpeg  
**Status:** 🔄 Only needed if choosing WASM export

### 4.3 Body Parser Exclusion
**Bridge code:** `server.js:20-23`  
**What it does:** Skip JSON parsing for `/api/encode` (uses multipart)  
**Client replacement:** N/A  
**Status:** ✅ Obsolete

### 4.4 Port Conflict Detection
**Bridge code:** `server.js:551-559`  
**What it does:** Detect EADDRINUSE error, suggest `lsof` command  
**Client replacement:** N/A  
**Status:** ✅ Obsolete

---

## Category 5: Data Structures

### 5.1 Project Summary Object
**Bridge output:**
```ts
{
  id: string;              // Encoded directory name
  label: string;           // Human-readable (from cwd or decoded)
  cwd: string | null;      // Absolute path from JSONL
  sessionCount: number;    // Main sessions
  subAgentCount: number;   // Sub-agent sessions
  firstTs: string | null;  // ISO timestamp of newest session
}
```

**Client replacement:** Build identical object structure  
**Status:** ✅ Schema preserved

### 5.2 Session Metadata Object
**Bridge output:**
```ts
{
  id: string;
  projectId: string;
  isSubAgent: boolean;
  parentSessionId?: string;
  agentId?: string;
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
  // Optional for orphaned sessions:
  isOrphaned?: boolean;
  subAgentCount?: number;
}
```

**Client replacement:** Build identical object structure  
**Status:** ✅ Schema preserved

### 5.3 Raw Session JSONL Array
**Bridge output:** `Array<unknown>` (parsed JSON objects)  
**Client replacement:** Same array from `text.split('\n').map(JSON.parse)`  
**Status:** ✅ Format preserved

---

## Category 6: Error Handling

### 6.1 Missing Directory Handling
**Bridge behavior:** Return empty array if `~/.claude/projects` missing  
**Client replacement:** Show "No .claude directory selected" modal  
**Status:** 🔄 Different UX flow (can't auto-detect)

### 6.2 Malformed JSONL Tolerance
**Bridge behavior:** `readJsonLines()` silently skips unparseable lines  
**Client replacement:** Same try/catch pattern  
**Status:** ✅ Directly portable

### 6.3 Missing File References
**Bridge behavior:** `sessions-index.json` may reference missing files → skip entry  
**Client replacement:** Same check with `try/catch` on `getFileHandle()`  
**Status:** ✅ Directly portable

### 6.4 ffmpeg Spawn Failures
**Bridge behavior:** Return 500 error with `e.message`  
**Client replacement:** Depends on chosen export option  
**Status:** 🔄 TBD

---

## Capability Priority Tiers

### Tier 1: Must-have for MVP ⭐⭐⭐
- [x] Project listing
- [x] Session listing
- [x] Session content loading
- [x] Metadata extraction
- [x] Sub-agent discovery
- [x] First-run directory picker
- [x] IndexedDB handle persistence

### Tier 2: Important for UX ⭐⭐
- [x] Orphaned session synthesis
- [x] Project label decoding
- [x] Permission re-request flow
- [x] Cache invalidation / refresh
- [x] GIF export (already works)
- [ ] Video export (needs decision)

### Tier 3: Nice-to-have ⭐
- [ ] Drag-and-drop directory picker
- [ ] webkitdirectory fallback
- [ ] Hidden folder platform hints
- [ ] Mobile graceful degradation

---

## What You DON'T Need to Port

These parts of the bridge are HTTP plumbing, not domain logic:

- Express app setup
- Route definitions (`app.get()`, `app.post()`)
- Multipart parsing (busboy)
- Temp directory management
- Process spawning (`execFile`)
- Response streaming
- Error middleware
- Port binding

**Key insight:** ~450 lines of bridge code → ~200 lines of client logic. The rest is HTTP scaffolding.

---

## Implementation Order

1. **Session reading** (no bridge equivalent needed — just file.text())
2. **Discovery logic** (port `discoverSessionFiles` → client walker)
3. **Metadata extraction** (copy pure functions)
4. **IndexedDB caching** (new, but scaffolding provides pattern)
5. **PickerPage integration** (replace fetch calls)
6. **Export pivot** (decide Option A/B/C first)
7. **First-run UX** (modal + picker)

---

## Decision Points

| Decision | Options | Impact |
|----------|---------|--------|
| Video export | WASM / ZIP / GIF-only | Bundle size + UX friction |
| Cache strategy | Manual refresh / Auto-stale / Smart checksum | Performance vs complexity |
| Fallback mode | webkitdirectory / desktop-only | Browser compat vs simplicity |
| Sub-agent orphans | Synthesize / Hide | Data completeness vs confusion |

**Recommendation:** Start conservative (ZIP export, manual refresh, desktop-only, synthesize orphans), iterate based on feedback.

---

## Files Mapped

| Bridge file | Client equivalent(s) | Status |
|-------------|---------------------|--------|
| `server.js:62-178` | `lib/claudeReader/discoverSessions.ts` | 🔄 Port needed |
| `server.js:199-244` | `lib/claudeReader/summariseSession.ts` | 🔄 Port needed |
| `server.js:246-269` | `lib/claudeReader/extractCwd.ts` | 🔄 Port needed |
| `server.js:35-44` | Inline in session loader | ✅ Trivial |
| `server.js:469-529` | `lib/export/encodeVideo.js` | 🔄 Needs decision |
| N/A | `lib/fsAccess.ts` | 🆕 New (picker/permissions) |
| N/A | `lib/sessionsStore.ts` | 🆕 New (IndexedDB) |
| N/A | `components/picker/ConnectSessionsModal.tsx` | 🆕 New (first-run UX) |

---

## Validation Checklist

After migration, verify these behaviors still work:

- [ ] Projects sorted by newest session
- [ ] Sessions sorted by timestamp
- [ ] Sub-agents grouped under parent
- [ ] Orphaned sub-agents show synthetic summary
- [ ] Project labels match `cwd` basename
- [ ] Token counts match bridge output
- [ ] PR links extracted correctly
- [ ] Turn counts accurate
- [ ] Tool frequency map correct
- [ ] Search/filter UI still responsive
- [ ] Export generates valid files
- [ ] Keyboard navigation preserved
- [ ] Theme toggle persists

---

## Performance Benchmarks

| Operation | Bridge (baseline) | Client target |
|-----------|------------------|---------------|
| List 50 projects | ~200ms | <500ms (first scan) |
| List 100 sessions | ~100ms | <200ms (first scan) |
| Load single session | ~20ms | <50ms |
| Subsequent loads (cached) | N/A | <10ms |
| Export 60-frame GIF | ~2s | ~2s (unchanged) |
| Export 60-frame MP4 | ~1s (system ffmpeg) | ~10s (WASM) or manual (ZIP) |

**Key:** IndexedDB cache makes subsequent loads faster than bridge, offsetting slower first scan.

---

## Security Model Comparison

### Bridge security
- Trusts localhost network
- Full filesystem access via Node.js
- No CORS if accessed remotely
- Can read/write anywhere (limited to read in practice)

### Client security
- Browser sandbox enforced
- User explicitly grants directory access
- Read-only permission only
- Handle revocable via browser settings
- No network requests (except CDN for app load)

**Winner:** Client is more secure — user has full control, no localhost attack surface.

---

## Summary

**Verdict:** ~85% of bridge logic is directly portable to client-side. The scaffolding doc provides the remaining 15% (picker + IndexedDB + permission management). Only true blocker is video encoding, which has 3 viable alternatives.

**Recommendation:** Proceed with migration. Start with Tier 1 capabilities, get working prototype, iterate from there.
