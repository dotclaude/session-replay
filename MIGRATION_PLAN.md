# Migration Plan: Bridge Removal for Client-Only Architecture

## Executive Summary

Replace the Express bridge server with browser-native File System Access API, transforming session-replay into a fully client-side GitHub Pages-hostable app.

**Key insight:** The scaffolding doc provides a proven pattern that's ~85% compatible with your existing architecture. Most changes are in data loading; parser/animator/export layers remain untouched.

---

## Bridge Capabilities Analysis

### Current Bridge Endpoints (bridge/server.js)

| Endpoint | Purpose | Lines | Client-side replacement |
|----------|---------|-------|------------------------|
| `GET /api/projects` | List projects with session counts | 277-325 | Walk `.claude/projects/` via `FileSystemDirectoryHandle.entries()` |
| `GET /api/projects/:id/sessions` | List sessions for a project | 328-389 | Read project dir + parse session-index.json + enumerate .jsonl files |
| `GET /api/sessions/:id` | Load raw JSONL lines | 392-464 | `getFileHandle()` + `file.text()` + `split('\n')` |
| `GET /api/sessions/:id/meta` | Lightweight session summary | 532-544 | Same as above but skip full content parse |
| `POST /api/encode` | Video encoding via ffmpeg | 466-529 | **Cannot replace client-side** (see alternatives below) |

### Bridge Responsibilities Breakdown

#### Read-only operations (95% of usage)
- **Session discovery** (L62-178): Handles 3 storage formats:
  - Format A: `<proj>/<uuid>.jsonl` (current)
  - Format B: `<proj>/sessions-index.json` (older index)
  - Format C: `<proj>/<uuid>/subagents/agent-*.jsonl` (sub-agents)
- **Metadata extraction** (L199-244): Parse JSONL for title/summary/timestamps/tokens/tool counts
- **Orphaned session handling** (L114-147): Synthesize entries when parent JSONL is missing but sub-agents exist
- **Project labeling** (L246-269): Decode project dir names + extract `cwd` from first JSONL entry

#### Write-adjacent operation (5% of usage)
- **Video encoding** (L469-529): Multipart PNG upload → ffmpeg → binary video response
  - Used by: `src/lib/export/encodeVideo.js`
  - Formats: MP4 (libx264), WebM (libvpx-vp9), GIF (palette-based)

---

## Compatibility Matrix

### What works with minimal changes ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Project listing | ✅ Direct port | `entries()` replaces `fs.readdirSync()` |
| Session listing | ✅ Direct port | Same discovery logic, different file API |
| Session loading | ✅ Direct port | `file.text()` replaces `fs.readFileSync()` |
| Sub-agent sessions | ✅ Direct port | Recursive directory walk works identically |
| Parser/animator | ✅ Zero changes | Operates on already-loaded JSONL array |
| Export (GIF) | ✅ Zero changes | Already client-side via gif.js worker |
| Search/stats/editor | ✅ Zero changes | Pure client-side logic |
| Keyboard nav/theme | ✅ Zero changes | UI-only features |

### What needs adaptation 🔄

| Feature | Change required | Complexity |
|---------|----------------|-----------|
| Video export (MP4/WebM) | Replace bridge ffmpeg with in-browser alternatives | Medium |
| First-run setup | Add directory picker modal | Low (scaffolding provides full pattern) |
| Permission handling | Add startup permission check | Low (scaffolding covers this) |
| IndexedDB handle storage | Add persistence layer | Low (scaffolding uses idb-keyval) |
| Error messaging | Update for picker-specific errors | Low |

### What cannot be replicated 🚫

| Feature | Limitation | Alternative |
|---------|-----------|------------|
| Direct `~/.claude` access | Browser sandbox prevents it | User must select directory |
| Hidden folder auto-reveal | OS file picker controls visibility | Show platform-specific instructions |
| Backgrounded ffmpeg encode | No system process spawning | Use WebAssembly ffmpeg or export frames as ZIP |

---

## Implementation Strategy

### Phase 1: Core infrastructure (scaffolding integration)

**Goal:** Replace bridge with File System Access API for read-only operations.

#### 1.1 Install dependencies
```bash
npm install idb-keyval
```

#### 1.2 Add type definitions
Create `src/types/file-system-access.d.ts` (copy from scaffolding L79-136)

#### 1.3 Add utility libraries
- `src/lib/fsAccess.ts` — Picker, permission checks, handle persistence
- `src/lib/sessionsStore.ts` — IndexedDB wrapper for directory handle + cache
- `src/lib/sessionReader.ts` — Recursive JSONL reader
- `src/lib/platformHints.ts` — Hidden folder hints (Cmd+Shift+. / Ctrl+H)
- `src/lib/errors.ts` — Browser-specific error messages

#### 1.4 Add first-run UI
- `src/components/picker/ConnectSessionsModal.tsx` — Directory picker modal
- `src/components/picker/DirectoryDropZone.tsx` — Drag-and-drop fallback
- `src/components/picker/WebkitDirectoryFallback.tsx` — Non-persistent snapshot import

**Files changed:**
- `src/pages/PickerPage.jsx` — Replace `fetch('/api/projects')` with `readSessionsDirectory()`
- `src/pages/ReplayPage.jsx` — Replace `fetch(\`/api/sessions/\${id}\`)` with cached session data

---

### Phase 2: Session discovery parity

**Goal:** Replicate bridge's 3-format discovery logic client-side.

#### 2.1 Port discovery algorithms
Bridge lines to replicate:
- `discoverSessionFiles()` (L62-178) → `src/lib/claudeReader/discoverSessions.ts`
  - Format A detection (L72-81)
  - Format B index parsing (L84-102)
  - Format C sub-agent enumeration (L105-175)
- `summariseSession()` (L199-244) → `src/lib/claudeReader/summariseSession.ts`
- `extractCwdFromProject()` (L246-264) → `src/lib/claudeReader/extractCwd.ts`

#### 2.2 Implement orphaned session synthesis
When parent JSONL is missing but `subagents/` dir exists:
- Concatenate sub-agent files (bridge L440-460)
- Inject synthetic `agent-name` separator entries

#### 2.3 Cache metadata in IndexedDB
Structure:
```ts
interface SessionsCache {
  generatedAt: string;
  projects: {
    id: string;
    label: string;
    cwd: string | null;
    sessionCount: number;
    subAgentCount: number;
    sessions: SessionMetadata[];
  }[];
}
```

**Why cache?** Walking 50+ projects with 100+ sessions each takes 2-5 seconds. Cache allows instant startup.

**Cache invalidation:** On "Refresh" button click or when `verifyReadPermission()` fails.

---

### Phase 3: Export strategy pivot

**Goal:** Replace bridge ffmpeg with client-side alternatives.

#### Option A: WebAssembly ffmpeg (preserves existing UX)
```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

**Pros:**
- Same formats (MP4/WebM/GIF)
- No bridge dependency
- Works offline

**Cons:**
- 30MB WASM download
- Slower than system ffmpeg (~5-10x)
- Requires SharedArrayBuffer (COOP/COEP headers)

**Implementation:**
- Update `src/lib/export/encodeVideo.js`:
  ```ts
  import { FFmpeg } from '@ffmpeg/ffmpeg';
  import { fetchFile } from '@ffmpeg/util';
  
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  
  // Write frames
  for (let i = 0; i < frames.length; i++) {
    await ffmpeg.writeFile(`f${i}.png`, await fetchFile(frames[i]));
  }
  
  // Encode
  await ffmpeg.exec(['-framerate', fps, '-i', 'f%d.png', '-c:v', 'libx264', 'out.mp4']);
  
  // Read result
  const data = await ffmpeg.readFile('out.mp4');
  ```

#### Option B: Frame export + external encode (simplest)
Export frames as ZIP, user encodes locally with their own ffmpeg.

**Pros:**
- No WASM bloat
- Faster frame capture
- User controls quality settings

**Cons:**
- Extra manual step
- Requires user to install ffmpeg

**Implementation:**
```bash
npm install jszip
```

```ts
// src/lib/export/exportFrames.js
import JSZip from 'jszip';

export async function exportFramesAsZip(frames) {
  const zip = new JSZip();
  frames.forEach((blob, i) => {
    zip.file(`frame-${String(i).padStart(5, '0')}.png`, blob);
  });
  zip.file('encode.sh', `#!/bin/bash
ffmpeg -framerate 10 -i frame-%05d.png -c:v libx264 -pix_fmt yuv420p output.mp4
`);
  return await zip.generateAsync({ type: 'blob' });
}
```

#### Option C: Keep GIF, drop MP4/WebM (pragmatic)
GIF export already works via gif.js. Drop video formats entirely.

**Recommendation:** Start with Option B (frames ZIP), upgrade to Option A (WASM ffmpeg) if users demand it.

---

### Phase 4: GitHub Pages deployment

#### 4.1 Update Vite config
```ts
// vite.config.js
export default {
  base: '/session-replay/',  // or '/' for custom domain
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'gif-worker': ['gif.js'],  // Split large worker
        },
      },
    },
  },
};
```

#### 4.2 Add GitHub Actions workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

#### 4.3 Enable GitHub Pages
- Repo settings → Pages → Source: GitHub Actions
- Optional: Add custom domain in CNAME

---

## Modified Architecture

### Before (bridge-based)
```
User opens http://localhost:5174
         ↓
   Vite dev server
         ↓
   /api/* proxied to :3001
         ↓
   Bridge reads ~/.claude
         ↓
   JSON response to React
         ↓
   Parser → Animator → Renderer
```

### After (client-only)
```
User opens https://you.github.io/session-replay
         ↓
   Static React app loads
         ↓
   showDirectoryPicker() on first run
         ↓
   User selects ~/.claude
         ↓
   Handle stored in IndexedDB
         ↓
   entries() → recursive walk → cache
         ↓
   Parser → Animator → Renderer (unchanged)
```

---

## File Changes Checklist

### New files (14)
- [ ] `src/types/file-system-access.d.ts`
- [ ] `src/lib/fsAccess.ts`
- [ ] `src/lib/sessionsStore.ts`
- [ ] `src/lib/sessionReader.ts`
- [ ] `src/lib/platformHints.ts`
- [ ] `src/lib/errors.ts`
- [ ] `src/lib/claudeReader/discoverSessions.ts`
- [ ] `src/lib/claudeReader/summariseSession.ts`
- [ ] `src/lib/claudeReader/extractCwd.ts`
- [ ] `src/components/picker/ConnectSessionsModal.tsx`
- [ ] `src/components/picker/DirectoryDropZone.tsx`
- [ ] `src/components/picker/WebkitDirectoryFallback.tsx`
- [ ] `src/lib/export/exportFrames.js` (if using Option B)
- [ ] `.github/workflows/deploy.yml`

### Modified files (5)
- [ ] `package.json` — Add idb-keyval, jszip, remove bridge scripts
- [ ] `vite.config.js` — Remove proxy, add base path
- [ ] `src/pages/PickerPage.jsx` — Replace fetch with file system reads
- [ ] `src/pages/ReplayPage.jsx` — Load from IndexedDB cache instead of API
- [ ] `src/lib/export/encodeVideo.js` — Replace bridge POST with chosen alternative

### Deleted files (2)
- [ ] `bridge/server.js`
- [ ] `bridge/` directory

### Unchanged files (everything else)
- Parser: `src/lib/parser/*` (operates on JSONL array, doesn't care about source)
- Animator: `src/lib/stepAnimator/*` (pure step-based engine)
- Renderer: `src/components/stages/*` (renders step objects)
- Editor: `src/lib/editor/*` + `src/pages/EditorPage.jsx` (composition logic)
- Search/stats: `src/lib/search/*` + `src/lib/stats/*` (client-side only)

---

## Risk Assessment

### Medium risks 🟡

**Risk:** Browser doesn't support File System Access API  
**Mitigation:** Progressive enhancement — offer `webkitdirectory` fallback (scaffolding provides this)

**Risk:** Users can't find `.claude` in picker (hidden folder)  
**Mitigation:** Show platform-specific instructions in modal (Cmd+Shift+. / Ctrl+H)

**Risk:** Permission revoked between sessions  
**Mitigation:** Check `queryPermission()` on startup, show reconnect modal if denied

**Risk:** Large project directories cause slow initial scan  
**Mitigation:** Cache metadata in IndexedDB, only re-scan on explicit "Refresh"

### Low risks 🟢

**Risk:** Sub-agent session format changes  
**Impact:** Minimal — discovery logic is isolated in `discoverSessions.ts`

**Risk:** Users want video export  
**Impact:** Can add WASM ffmpeg later without architectural changes

---

## Testing Plan

### Phase 1: Core functionality
1. **Picker flow**
   - [ ] Modal appears on first visit
   - [ ] Native picker opens on "Select .claude"
   - [ ] Selecting `~/.claude` directly works
   - [ ] Selecting `$HOME` (when contains `.claude`) works
   - [ ] Invalid folder shows error
   - [ ] Handle persists across page reloads

2. **Permission handling**
   - [ ] Saved handle reused on startup
   - [ ] Permission prompt appears if needed
   - [ ] Revoked permission triggers reconnect flow
   - [ ] "Disconnect" clears handle + cache

3. **Session discovery**
   - [ ] Format A sessions appear (.jsonl in project root)
   - [ ] Format B sessions appear (sessions-index.json)
   - [ ] Format C sessions appear (sub-agents)
   - [ ] Orphaned sessions (sub-agents only) show synthetic summary
   - [ ] Project counts match bridge output
   - [ ] Session metadata matches bridge output

### Phase 2: Feature parity
4. **Replay**
   - [ ] Animation plays correctly
   - [ ] Scrubber works
   - [ ] Search highlights correct steps
   - [ ] Filter toggles work
   - [ ] Stats panel shows correct token counts

5. **Export**
   - [ ] GIF export works (already client-side)
   - [ ] Frame ZIP export works (Option B)
   - [ ] OR WASM video export works (Option A)

6. **Editor**
   - [ ] Composition timeline loads
   - [ ] Clips drag/resize
   - [ ] Annotations add/edit
   - [ ] Export from editor works

### Phase 3: Edge cases
7. **Browser compatibility**
   - [ ] Chrome/Edge (showDirectoryPicker available)
   - [ ] Firefox/Safari (webkitdirectory fallback)
   - [ ] Mobile (graceful degradation message)

8. **Large datasets**
   - [ ] 50+ projects scan completes in <5s
   - [ ] 100+ sessions load without blocking UI
   - [ ] IndexedDB cache reduces subsequent loads to <500ms

---

## Migration Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Setup | 1 day | Dependencies + type defs + scaffolding utils |
| Discovery | 2 days | Port bridge logic to client-side file walking |
| UI integration | 1 day | Connect modal + PickerPage changes |
| Export pivot | 1 day | Implement chosen video alternative |
| Testing | 2 days | Cross-browser + edge case validation |
| Deploy | 0.5 day | GitHub Actions + Pages setup |
| **Total** | **7.5 days** | Fully static GitHub Pages app |

---

## Open Questions

1. **Video export preference?**
   - Option A (WASM ffmpeg) — Full parity but 30MB download
   - Option B (frame ZIP) — Lightweight but manual step
   - Option C (GIF only) — Simplest but limited format

2. **Custom domain or username.github.io/session-replay?**
   - Affects `vite.config.js` base path

3. **Cache invalidation strategy?**
   - Manual "Refresh" button only?
   - OR auto-refresh on stale cache (>5min old)?
   - OR checksum-based smart refresh?

4. **Sub-agent display in picker?**
   - Current bridge synthesizes orphaned sessions
   - Keep same UX? Or hide orphaned sessions entirely?

5. **Mobile support?**
   - File System Access API unavailable on mobile
   - Show "Desktop only" message? Or build companion reader?

---

## Success Criteria

- [ ] No bridge server required (`yarn dev` starts Vite only)
- [ ] Runs on GitHub Pages at static URL
- [ ] First-run picker flow completes in <30 seconds
- [ ] All existing features work (replay/export/editor/search)
- [ ] Performance ≥ current (IndexedDB cache helps here)
- [ ] Works in Chrome/Edge/Brave (90% of dev audience)
- [ ] Graceful fallback in Firefox/Safari

---

## Rollback Plan

If migration blocked:
1. Keep bridge as optional local mode
2. Detect `http://localhost:3001` availability
3. Fall back to bridge if available, else show picker
4. Both modes share same parser/animator/renderer code

This gives users choice: bridge for zero-config local use, picker for static hosting.

---

## Next Steps

1. **Decide on video export strategy** (Options A/B/C above)
2. **Run proof-of-concept** — Port `discoverSessionFiles()` to client-side first
3. **Validate performance** — Time 50-project scan in browser vs bridge
4. **Implement Phase 1** (core infrastructure)
5. **Test with real `.claude` directory**
6. **Deploy to GitHub Pages staging branch**
7. **Gather feedback** before removing bridge entirely
