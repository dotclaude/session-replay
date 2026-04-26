# session-replay

A standalone React app that reads your `~/.claude` session history and replays
any conversation as a beautiful, scrubbable animation. Pick a project, pick a
session, hit Play. Export clips as GIF, MP4, WebM, or JSON. Compose multi-clip
timelines in the visual editor and annotate them before exporting.

**Now runs entirely in your browser** — no server required. Deployable to GitHub Pages.

---

## Quick start

```bash
cd ~/projects/session-replay
npm install
npm run dev
```

Open http://localhost:5174. On first launch, you'll be prompted to select your `.claude` directory.

---

## How it works

```
~/.claude/projects/<encoded-path>/<session-id>.jsonl
        │
        ▼
  Browser File System Access API
  showDirectoryPicker()         → user grants read access to .claude
  FileSystemDirectoryHandle     → persisted in IndexedDB
  recursive directory walk      → discovers all sessions (Format A/B/C)
        │
        ▼
  IndexedDB cache
  SessionsCache                 → { projects: [{ sessions: [...] }] }
  Loaded on startup             → instant subsequent visits
        │
        ▼
  src/lib/parser/
    parseSession.js             JSONL lines → typed EventList
    parseLocalCommands.js       XML-wrapped local CLI outputs → LocalCommand events
    buildSteps.js               EventList   → AnimationStep[]
        │
        ▼
  src/lib/stepAnimator/
    useStepAnimator.js          generic step engine (play/pause/scrub)
    useTimedAnimator.js         wall-clock-aware variant for export
    AnimatorControls.jsx        unstyled controls (spread animator into it)
        │
        ▼
  src/lib/search/
    buildSearchIndex.js         linear-scan text index over all steps
        │
        ▼
  src/lib/stats/
    computeSessionStats.js      token counts, cost estimate, wall-clock time
        │
        ▼
  src/lib/export/
    buildFramePlan.js           maps clip range → frame timestamps
    captureFrames.js            html2canvas screen capture per frame
    renderFrameToCanvas.js      direct 2D canvas rendering (~2ms/frame, no html2canvas)
    encodeVideo.js              WASM ffmpeg encoding (MP4/WebM/GIF)
        │
        ▼
  src/lib/editor/
    buildComposition.js         maps steps → draggable clips with timing metadata
    compositionReducer.js       state machine for clip add/move/resize/delete
    kindColors.js               step-kind → color token map
        │
        ▼
  src/components/stages/
    StageRenderer.jsx           switch(step.kind) → correct stage component
    HumanTurn.jsx               human prompt bubble
    AssistantText.jsx           assistant prose
    ToolBash.jsx                terminal: command + output
    ToolWrite.jsx               file write: path + collapsible content
    ToolEdit.jsx                diff view: before / after
    ToolRead.jsx                file viewer
    ToolAgent.jsx               sub-agent dispatch card
    AgentProgress.jsx           inner sub-agent message card
    ToolWeb.jsx                 web search / fetch
    ToolTask.jsx                task create / update
    ToolSkill.jsx               skill invocation card
    ToolModal.jsx               modal interaction wrapper
    ToolGeneric.jsx             fallback for any other tool
    HookEvent.jsx               hook execution card
    CompactionEvent.jsx         context compaction notice (with token counts)
    ErrorEvent.jsx              API / runtime error card with full trace
    TurnSummary.jsx             away_summary card
    LocalCommand.jsx            local CLI command execution card
    PRBadge.jsx                 pr-link badge
    ProcessingIndicator.jsx     loading / long-running operation UI
```

---

## Architecture decisions

### Why client-only instead of a bridge server?

The app now uses the **File System Access API** to read your `.claude` directory directly in the browser. This means:

- **No server setup** — just open the page
- **GitHub Pages compatible** — deploy anywhere static files are served
- **Secure** — you explicitly grant access, browser sandbox enforced
- **Offline** — everything runs locally after initial load
- **Persistent** — directory handle saved in IndexedDB (you grant permission once)

On first run, a modal prompts you to select your `.claude` folder (or your home directory if it contains `.claude`). The app remembers your choice and reuses it on future visits. You can disconnect and reconnect anytime.

### Why step-based animation instead of CSS transitions?

Each animation step is a plain object. The scrubber works by calling
`resetState()` then synchronously replaying steps 0..N — no timeline math
needed. This means any position is deterministically reachable. See
`src/lib/stepAnimator/useStepAnimator.js` for the engine.

### Why is `cwd` used for project labels instead of the directory name?

Claude encodes project paths as hyphen-joined strings. `bennymeyer-com`
could mean `bennymeyer/com` or `bennymeyer.com`. The ground truth is the
`cwd` field inside the JSONL. Discovery logic reads it from the first entry that
has one, or falls back to `sessions-index.json`.

### Why are tool_result entries indexed separately instead of traversing the tree?

The uuid/parentUuid chain is a tree, but parallel tool calls create fan-out
that makes tree traversal complex. Instead, `parseSession.js` indexes all
`tool_result` blocks by `tool_use_id` in a single pass, then pairs them with
their `tool_use` block during the assistant-message pass. O(n) total.

### Why WASM ffmpeg instead of a bridge endpoint?

Video export now uses `@ffmpeg/ffmpeg` (WebAssembly) to encode MP4/WebM/GIF entirely in the browser. This removes the bridge server dependency. The WASM build is slower than system ffmpeg (~5-10x) but works offline and requires no installation.

---

## Project structure

```
session-replay/
├── public/
│   └── gif.worker.js          gif.js web worker (copied by postinstall)
├── src/
│   ├── main.jsx               React entry
│   ├── App.jsx                Router (/ | /replay/:id | /export/:id | /editor/:id)
│   ├── app.css                Global tokens + animator control styles (WCAG 2.1 AA)
│   ├── types/
│   │   └── file-system-access.d.ts  Type definitions for File System Access API
│   ├── lib/
│   │   ├── fsAccess.ts        Directory picker, permission checks, handle persistence
│   │   ├── sessionsStore.ts   IndexedDB wrapper for handles + cache
│   │   ├── sessionReader.ts   Recursive .claude directory walker
│   │   ├── platformHints.ts   Hidden folder visibility hints (Cmd+Shift+. / Ctrl+H)
│   │   ├── errors.ts          User-friendly error messages
│   │   ├── claudeReader/
│   │   │   ├── discoverSessions.ts    Format A/B/C session detection
│   │   │   ├── summariseSession.ts    Metadata extraction (title/tokens/tools)
│   │   │   ├── extractCwd.ts          Project label logic
│   │   │   └── fileUtils.ts           JSONL reading utilities
│   │   ├── parser/
│   │   │   ├── parseSession.js
│   │   │   ├── parseLocalCommands.js
│   │   │   └── buildSteps.js
│   │   ├── stepAnimator/
│   │   │   ├── useStepAnimator.js
│   │   │   ├── useTimedAnimator.js
│   │   │   ├── AnimatorControls.jsx
│   │   │   └── index.js
│   │   ├── search/
│   │   │   └── buildSearchIndex.js
│   │   ├── stats/
│   │   │   └── computeSessionStats.js
│   │   ├── export/
│   │   │   ├── buildFramePlan.js
│   │   │   ├── captureFrames.js
│   │   │   ├── renderFrameToCanvas.js
│   │   │   └── encodeVideo.js        (now uses WASM ffmpeg)
│   │   └── editor/
│   │       ├── buildComposition.js
│   │       ├── compositionReducer.js
│   │       └── kindColors.js
│   ├── pages/
│   │   ├── PickerPage.jsx        Project → session selector (now reads from FS API)
│   │   ├── ReplayPage.jsx        Loads session from IndexedDB cache
│   │   ├── ExportEditorPage.jsx  Clip editor + export UI
│   │   └── EditorPage.jsx        Visual composition timeline editor
│   └── components/
│       ├── picker/
│       │   ├── ProjectCard.jsx
│       │   ├── SessionCard.jsx
│       │   ├── ConnectSessionsModal.jsx       First-run directory picker modal
│       │   ├── DirectoryDropZone.jsx          Drag-and-drop directory support
│       │   └── WebkitDirectoryFallback.jsx    Non-persistent snapshot import
│       ├── replay/
│       │   ├── ClipControls.jsx   Set in/out points for export
│       │   ├── ExportPanel.jsx    Format/quality picker + encode trigger
│       │   ├── FilterBar.jsx      Toggle step-kind visibility
│       │   ├── Minimap.jsx        Color-coded step overview strip
│       │   ├── SearchBar.jsx      Full-text search across all steps
│       │   ├── SessionClock.jsx   Wall-clock elapsed time display
│       │   └── StatsPanel.jsx     Token counts + estimated cost
│       ├── stages/
│       │   ├── StageRenderer.jsx
│       │   ├── shared.jsx         (StageCard, CardHeader, CodeBlock, timestamp)
│       │   ├── SessionHeader.jsx
│       │   ├── ProcessingIndicator.jsx
│       │   ├── HumanTurn.jsx
│       │   ├── AssistantText.jsx
│       │   ├── ToolBash.jsx
│       │   ├── ToolWrite.jsx
│       │   ├── ToolEdit.jsx
│       │   ├── ToolRead.jsx
│       │   ├── ToolAgent.jsx
│       │   ├── AgentProgress.jsx
│       │   ├── ToolWeb.jsx
│       │   ├── ToolTask.jsx
│       │   ├── ToolSkill.jsx
│       │   ├── ToolModal.jsx
│       │   ├── ToolGeneric.jsx
│       │   ├── HookEvent.jsx
│       │   ├── CompactionEvent.jsx
│       │   ├── ErrorEvent.jsx
│       │   ├── TurnSummary.jsx
│       │   ├── LocalCommand.jsx
│       │   └── PRBadge.jsx
│       └── editor/
│           ├── EditorShell.jsx
│           ├── EditorHeader.jsx
│           ├── EditorCanvas.jsx
│           ├── EditorTimeline.jsx
│           ├── TimelineRuler.jsx
│           ├── TimelineScrubber.jsx
│           ├── TimelineLayer.jsx
│           ├── TimelineClip.jsx
│           ├── EditorProperties.jsx
│           ├── AnnotationLayer.jsx
│           ├── TextAnnotation.jsx
│           └── ExportModalEditor.jsx
├── index.html
├── vite.config.js             Port 5174, COOP/COEP headers for WASM
├── package.json
└── README.md
```

---

## First-run setup

When you first open the app, a modal appears with instructions:

1. **Click "Select .claude folder"** — opens your native file picker
2. **Show hidden folders:**
   - **macOS:** Press `Cmd + Shift + .` in the picker
   - **Linux:** Press `Ctrl + H` in the picker  
   - **Windows:** Enable `View → Hidden items` in File Explorer
3. **Select your `.claude` directory** (usually `~/.claude`)
   - Or select your home folder if it contains `.claude` (the app will auto-detect it)
4. **Grant read permission** when prompted by the browser
5. **Sessions load automatically** — the directory handle is saved in IndexedDB

On subsequent visits, the app reuses the saved handle (with a permission check). You'll only see the modal again if you disconnect or if browser permission was revoked.

---

## Session discovery

The app supports all three Claude Code session storage formats:

- **Format A** (current): Direct `.jsonl` files in project root  
  `~/.claude/projects/<proj>/<uuid>.jsonl`

- **Format B** (legacy): `sessions-index.json` with file references  
  `~/.claude/projects/<proj>/sessions-index.json`

- **Format C** (sub-agents): UUID subdirectories with agent sessions  
  `~/.claude/projects/<proj>/<uuid>/subagents/agent-*.jsonl`

Orphaned sessions (parent JSONL missing but sub-agents present) are synthesized with metadata extracted from the first sub-agent file.

---

## Composition editor

`EditorPage` (`/editor/:id`) is a visual timeline editor layered on top of the
replay engine. Steps are converted to draggable clips via `buildComposition.js`,
and all mutations go through `compositionReducer` — a pure reducer with actions
for add, move, resize, split, and delete. The `AnnotationLayer` / `TextAnnotation`
components let you overlay timestamped text callouts before exporting.

Use `ExportModalEditor` (inside the editor) rather than `ExportPanel` (inside
the replay) when you want to export a composed multi-clip timeline.

---

## Accessibility

The UI targets **WCAG 2.1 AA** throughout:

- All interactive elements have a visible 2px focus ring (2px offset).
- Color palette maintains ≥ 3:1 contrast on text and borders.
- Semantic HTML with ARIA labels on controls, stage cards, and the minimap.
- Full keyboard navigation: Space = play/pause, ←/→ = step, Home/End = jump.
- Screen reader announcements on step-kind changes and search results.

---

## Adding a new stage component

1. Add a new `kind` value to `buildSteps.js` in `toolKind()`.
2. Create `src/components/stages/ToolYours.jsx` using `StageCard` and
   `CardHeader` from `shared.jsx`.
3. Import and add a `case` for it in `StageRenderer.jsx`.
4. Add it to `ALL_KINDS` in `FilterBar.jsx` if it should appear in the filter.

The stage receives `{ step, isCurrent, isSearchMatch }`. `step.event` is the
full parsed event. Use `isCurrent` for a highlight glow on the active step and
`isSearchMatch` to highlight search hits.

---

## Extending the step animator

`useStepAnimator` lives in `src/lib/stepAnimator/useStepAnimator.js`. It is
a copy of the canonical version in `~/projects/axon/animation-toolkit/`. If
you improve the engine here, mirror the changes there (or make this package
consume the toolkit as a dependency).

`useTimedAnimator` is a local extension that drives playback against wall-clock
time — used by `ExportEditorPage` to advance steps at a fixed FPS during frame
capture.

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5174) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

---

## Deployment to GitHub Pages

1. **Enable GitHub Pages** in repo settings → Pages → Source: GitHub Actions
2. **Push to main** — the included `.github/workflows/deploy.yml` workflow runs automatically
3. **Access your app** at `https://<username>.github.io/<repo-name>/`

For a custom domain:
1. Add `CNAME` file to `public/` with your domain
2. Update `vite.config.js` → `base: '/'`
3. Configure DNS as per GitHub Pages docs

---

## Browser compatibility

**Full support** (File System Access API available):
- Chrome 86+
- Edge 86+
- Brave 1.18+
- Opera 72+

**Fallback support** (webkitdirectory snapshot import):
- Firefox (no persistent handle, must re-import on changes)
- Safari (limited)

**Not supported:**
- Mobile browsers (File System Access API unavailable)
- IE11 (lacks required ES6+ features)

---

## Security model

This app is **client-only** and cannot access your filesystem without explicit permission:

- You must **manually select** the `.claude` directory via the native picker
- The browser enforces **read-only access** (no writes possible)
- Directory handle is stored in **IndexedDB** (local to your browser)
- Permission can be **revoked** anytime via browser site settings
- **No data leaves your machine** — no analytics, no telemetry, no uploads
- WASM ffmpeg runs entirely in your browser (offline after first load)

---

## Troubleshooting

### "Cannot find .claude directory"
- Make sure you selected the correct folder
- Try selecting your home directory instead (app will auto-find `.claude`)
- Check hidden folder visibility (Cmd+Shift+. on Mac, Ctrl+H on Linux)

### "Permission denied"
- Click "Disconnect" then "Connect" to re-grant permission
- Clear site data in browser settings if permission is stuck

### "Session not found in cache"
- Click "Refresh" on the picker page to re-scan your `.claude` directory
- If sessions are still missing, check that the JSONL files exist on disk

### Video export is slow
- WASM ffmpeg is 5-10x slower than system ffmpeg
- Consider reducing frame count or resolution
- GIF export is fastest (no video codec overhead)

### "SharedArrayBuffer is not defined"
- WASM ffmpeg requires COOP/COEP headers (configured in `vite.config.js`)
- If deploying to a host other than GitHub Pages, ensure these headers are set:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```

---

## Migration from bridge-based version

If you were using the bridge server (pre-v0.2.0):

1. **No bridge required** — remove `bridge/server.js` and related scripts
2. **First run** — grant directory access via the modal
3. **Data persists** — sessions are cached in IndexedDB, no re-reading on reload
4. **Video export** — now uses WASM ffmpeg (slower but no server needed)
5. **Deployment** — can now host on GitHub Pages or any static host

The parser, animator, and stage components are unchanged — only the data loading layer was refactored.

---

## Requirements

- Node 18+
- Modern browser with File System Access API support (Chrome/Edge/Brave recommended)
- `~/.claude/projects/` directory with Claude Code session files
- Claude Code 2.x session format (tested on 2.1.x)

---

## License

See LICENSE file for details.
