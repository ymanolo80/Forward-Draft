# Forward Draft — State of the App (Evaluation)

_Evaluation date: 2026-06-15. Reviewed by Claude Code. No source or GitHub changes were made; findings only._

## What it actually is
Not a native Swift app. It's a **React 19 + Vite + TypeScript web app wrapped with Capacitor 8** to ship as an iOS/iPad app. The Mac version runs as "Designed for iPad" (an iPad app on Apple Silicon Macs), *not* a true Mac Catalyst/AppKit build.

A **screenwriting tool** with three modes — **Write → Review → Rewrite** — backed by a data model (`projects → scenes → versions`, plus `notes / highlights / tasks`). Imports Fountain, FDX (Final Draft), and TXT; exports Fountain/TXT/PDF.

## Does it work? Yes.

| Check | Result |
|---|---|
| `npm run build` (tsc + vite) | ✅ builds clean |
| `npm test` (vitest) | ✅ **44/44 pass** |
| iOS simulator `xcodebuild` | ✅ **BUILD SUCCEEDED** |
| TypeScript `strict` mode | ✅ on |
| TODO/FIXME debt | ✅ none |

A mature, well-organised v1 — not a prototype.

## What's genuinely good
- **Clean layering**: pure logic in `src/lib/`, UI in `src/components/`, native bridge isolated.
- **Graceful file fallback chain** (`src/lib/fileService.ts`): native plugin → File System Access API → Web Share → plain download. Same code runs on device and in a browser.
- **Defensive project-file parsing** (`src/lib/projectFile.ts`): every field type/enum-validated with readable errors.
- **Careful Swift plugin** (`ios/App/App/ForwardDraftFilePlugin.swift`): security-scoped bookmarks, `NSFileCoordinator` reads/writes, verifies bytes after writing, handles stale bookmarks.
- **DOMPurify bundled** — imported script content sanitized before render.
- Good QA discipline: device/web checklists and triage notes in `docs/`.

## Problems & weaknesses (prioritized)

### P1 — Will bite you
1. **Dependencies pinned to `"latest"`** in `package.json` (`react`, `react-dom`, `typescript`, `vite`, `jspdf`, `@vitejs/plugin-react`). The lockfile protects today, but any `npm update` / lockfile change can pull a breaking major and break the build. **Pin to known-good caret ranges.** Highest-value fix.
2. **Data durability.** Primary storage is **IndexedDB** (one blob, all projects). On iOS WKWebView, IndexedDB can be **evicted under storage pressure or "Clear data."** The durable `.frdx` file is *optional* — `createNew` warns then lets the user keep writing with only IndexedDB backing. No automatic iCloud/file backup of the blob. Needs a deliberate decision (auto-create the file, or back the blob to iCloud).

### P2 — Architectural risk
3. **Autosave + external-file-refresh logic in `App.tsx`** is the riskiest code: five coordinating refs, a 900 ms save debounce, a 6 s poll that reads the whole file and `JSON.stringify`-compares it. Works, but hard to reason about — race conditions / save-loops / false "newer file" prompts live here. Candidate for an explicit state machine + tests.
4. **Undo stack is in-memory and global** (up to 50 full deep copies of all-projects `AppData`). Switching projects shares one history — possible to undo into another project's state. Memory-heavy for large scripts.

### P3 — Polish / correctness
5. **`window.alert / confirm / prompt`** for rename, delete confirm, and errors. Jarring on iOS; `prompt()` (used for rename) is unreliable in some WKWebView contexts. Move to in-app dialogs.
6. **713 KB main JS chunk** (224 KB gzipped) — mostly jsPDF + html2canvas, loaded eagerly though only needed for PDF export. Dynamic-import to speed iPad cold start.
7. **`Info.plist` lists `armv7`** under `UIRequiredDeviceCapabilities` — a 32-bit relic; wrong for an iOS 15+ arm64-only app.
8. **No React error boundary** — a single render throw blanks the app.
9. **README documents only the web flow** — nothing about the native build, though `public/` and `capacitor.config.json` are gitignored and a fresh clone must sync before Xcode works.

### Design-level notes
- **macOS = "Designed for iPad"**: iPad-style chrome, no real Mac menu bar, Apple Silicon only.
- Single-window, single-document, no crash reporting — fine for v1.

## How to run on iPad and Mac
The Xcode project is configured: team `64F36V4L3Q`, automatic signing, bundle `com.ymanolo80.forwarddraft`, iPhone+iPad, iOS 15 min. Because `ios/App/App/public` and `capacitor.config.json` are generated (gitignored), always: **build web → sync → open Xcode**.

```sh
cd "/Users/yiannis/Forward Draft"
npm install
npm run native:sync     # vite build + cap sync + re-register the custom plugin
npx cap open ios        # opens ios/App/App.xcodeproj in Xcode
```

Destination menu:
- **Mac**: "My Mac (Designed for iPad)" → Run (Apple Silicon required).
- **iPad (device)**: select iPad → Run; first launch, trust the dev cert under Settings → General → VPN & Device Management.
- **iPad (no hardware)**: any iPad **Simulator** → Run (no signing needed).

## Suggested order of work
1. (P1) Pin dependencies.
2. (P1) Make `.frdx`/iCloud backing non-optional or auto-created.
3. (P2) Refactor autosave into a tested state machine; scope undo per project.
4. (P3) In-app dialogs, dynamic-import PDF libs, error boundary, Info.plist + README cleanup.
