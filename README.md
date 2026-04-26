# session-replay

A standalone React app that reads your `~/.claude` session history and replays
any conversation as a beautiful, scrubbable animation. Pick a project, pick a
session, hit Play. Export clips as GIF, MP4, WebM, or JSON. Compose multi-clip
timelines in the visual editor and annotate them before exporting.

---

## Quick start

```bash
cd ~/projects/session-replay
yarn install
yarn dev
```

Open http://localhost:5174. The bridge server starts automatically on port 3001.

---

## How it works

```
~/.claude/projects/<encoded-path>/<session-id>.jsonl
        │
        ▼
  bridge/server.js          (Express, port 3001)
  GET /api/projects              → list of projects with session counts
  GET /api/projects/:id/sessions → sessions for a project (with metadata)
  GET /api/sessions/:id          → raw JSONL lines as JSON array
  GET /api/sessions/:id/meta     → lightweight session summary (no full content)
  POST /api/encode               → encode captured frames to video (uses system ffmpeg)
        │
        ▼
  src/lib/parser/
    parseSession.js          JSONL lines → typed EventList
    parseLocalCommands.js    XML-wrapped local CLI outputs → LocalCommand events
    buildSteps.js            EventList   → AnimationStep[]
        │
        ▼
  src/lib/stepAnimator/
    useStepAnimator.js       generic step engine (play/pause/scrub)
    useTimedAnimator.js      wall-clock-aware variant for export
    AnimatorControls.jsx     unstyled controls (spread animator into it)
        │
        ▼
  src/lib/search/
    buildSearchIndex.js      linear-scan text index over all steps
        │
        ▼
  src/lib/stats/
    computeSessionStats.js   token counts, cost estimate, wall-clock time
        │
        ▼
  src/lib/export/
    buildFramePlan.js        maps clip range → frame timestamps
    captureFrames.js         html2canvas screen capture per frame
    renderFrameToCanvas.js   direct 2D canvas rendering (~2ms/frame, no html2canvas)
    encodeVideo.js           sends frames to bridge for ffmpeg encoding
        │
        ▼
  src/lib/editor/
    buildComposition.js      maps steps → draggable clips with timing metadata
    compositionReducer.js    state machine for clip add/move/resize/delete
    kindColors.js            step-kind → color token map
        │
        ▼
  src/components/stages/
    StageRenderer.jsx        switch(step.kind) → correct stage component
    HumanTurn.jsx            human prompt bubble
    AssistantText.jsx        assistant prose
    ToolBash.jsx             terminal: command + output
    ToolWrite.jsx            file write: path + collapsible content
    ToolEdit.jsx             diff view: before / after
    ToolRead.jsx             file viewer
    ToolAgent.jsx            sub-agent dispatch card
    AgentProgress.jsx        inner sub-agent message card
    ToolWeb.jsx              web search / fetch
    ToolTask.jsx             task create / update
    ToolSkill.jsx            skill invocation card
    ToolModal.jsx            modal interaction wrapper
    ToolGeneric.jsx          fallback for any other tool
    HookEvent.jsx            hook execution card
    CompactionEvent.jsx      context compaction notice (with token counts)
    ErrorEvent.jsx           API / runtime error card with full trace
    TurnSummary.jsx          away_summary card
    LocalCommand.jsx         local CLI command execution card
    PRBadge.jsx              pr-link badge
    ProcessingIndicator.jsx  loading / long-running operation UI
```

---

## Architecture decisions

### Why a local bridge server instead of reading files in the browser?

Browsers cannot access the filesystem directly. The bridge is a minimal
Express server that runs on `localhost:3001` and exposes read-only JSON
endpoints. Vite proxies `/api/*` to it so the React app never touches CORS.
The `/api/encode` endpoint is the sole write-adjacent route — it spawns
`ffmpeg` locally to mux captured frames. Nothing leaves your machine.

### Why step-based animation instead of CSS transitions?

Each animation step is a plain object. The scrubber works by calling
`resetState()` then synchronously replaying steps 0..N — no timeline math
needed. This means any position is deterministically reachable. See
`src/lib/stepAnimator/useStepAnimator.js` for the engine.

### Why is `cwd` used for project labels instead of the directory name?

Claude encodes project paths as hyphen-joined strings. `bennymeyer-com`
could mean `bennymeyer/com` or `bennymeyer.com`. The ground truth is the
`cwd` field inside the JSONL. The bridge reads it from the first entry that
has one.

### Why are tool_result entries indexed separately instead of traversing the tree?

The uuid/parentUuid chain is a tree, but parallel tool calls create fan-out
that makes tree traversal complex. Instead, `parseSession.js` indexes all
`tool_result` blocks by `tool_use_id` in a single pass, then pairs them with
their `tool_use` block during the assistant-message pass. O(n) total.

### Why does export use a bridge endpoint instead of in-browser ffmpeg?

The WebAssembly ffmpeg port (`@ffmpeg/ffmpeg`) is large and slow for high
frame counts. Frames are POSTed as raw PNG blobs via `multipart/form-data`
to `/api/encode`, where the bridge pipes them through system `ffmpeg`. GIF
export uses the `gif.js` worker in-browser (no bridge needed).

---

## Project structure

```
session-replay/
├── bridge/
│   └── server.js              Express bridge — reads ~/.claude, encodes video
├── public/
│   ├── gif.worker.js          gif.js web worker (copied by postinstall)
│   └── ffmpeg-core.*          ffmpeg WASM assets (copied by postinstall)
├── src/
│   ├── main.jsx               React entry
│   ├── App.jsx                Router (/ | /replay/:id | /export/:id | /editor/:id)
│   ├── app.css                Global tokens + animator control styles (WCAG 2.1 AA)
│   ├── lib/
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
│   │   │   └── encodeVideo.js
│   │   └── editor/
│   │       ├── buildComposition.js
│   │       ├── compositionReducer.js
│   │       └── kindColors.js
│   ├── pages/
│   │   ├── PickerPage.jsx        Project → session selector
│   │   ├── ReplayPage.jsx        Loads session, drives animation
│   │   ├── ExportEditorPage.jsx  Clip editor + export UI
│   │   └── EditorPage.jsx        Visual composition timeline editor
│   └── components/
│       ├── picker/
│       │   ├── ProjectCard.jsx
│       │   └── SessionCard.jsx
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
├── vite.config.js             Port 5174, proxies /api → 3001
├── package.json
└── README.md
```

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

## Adding a new bridge endpoint

Add a route to `bridge/server.js`. All read routes must be read-only. The
encode route is the only exception — it writes to a temp dir and streams the
result back. Restart the bridge after changes (`yarn bridge` or `Ctrl-C` then
`yarn dev`).

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
| `yarn dev` | Start Vite (5174) + bridge (3001) together |
| `yarn bridge` | Start bridge server only |
| `yarn build` | Production build to `dist/` |
| `yarn preview` | Preview production build |

---

## Requirements

- Node 18+
- `ffmpeg` in `$PATH` (for MP4/WebM export)
- `~/.claude/projects/` must exist and contain `.jsonl` session files
- Claude Code 2.x session format (tested on 2.1.x)
