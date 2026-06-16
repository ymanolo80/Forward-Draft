# Forward Draft

A screenwriting workspace for drafting, reviewing, and rewriting script projects,
with three modes — **Write → Review → Rewrite** — plus Fountain / Final Draft (FDX) /
TXT import and Fountain / TXT / PDF export.

## Stack

- **React 19 + Vite + TypeScript** web app, wrapped with **Capacitor** to ship natively.
- Targets **iPad (primary), iPhone, and Mac**. The Mac build runs as an iPad app
  ("Designed for iPad", Apple Silicon only) — there is no separate Mac Catalyst target.

## Web development

```sh
npm install
npm run web        # http://127.0.0.1:5173/
npm test           # vitest unit tests
npm run build      # type-check + production build to dist/
```

## Native (iPad / Mac via Xcode)

The native shell consumes the built web bundle, so always build + sync before opening Xcode:

```sh
npm run native:sync   # vite build + cap sync + (re)register the custom plugin
npx cap open ios      # opens ios/App/App.xcodeproj
```

In Xcode pick a destination and Run:

- **iPad** — select your device (first run: trust the developer cert under
  Settings → General → VPN & Device Management).
- **Mac** — select **"My Mac (Designed for iPad)"** (Apple Silicon required).

Notes:

- **Debug** builds use bundle id `com.ymanolo80.forwarddraft.dev`; **Release** keeps
  `com.ymanolo80.forwarddraft`. This keeps local runs from colliding with a
  TestFlight/App Store install of the same id.
- For Mac runs, Xcode's **Derived Data must live on the boot drive** (Settings →
  Locations → Default). A "Designed for iPad" app cannot finalize its install from an
  external/USB volume.

## Data & durability

- The full app state is cached locally in **IndexedDB** for fast loads.
- On native, every project is also written to a durable, per-project `.frdx` file in
  the app's **Documents directory** (eviction-proof, included in device/iCloud backup,
  and visible in the Files app). This is the source of truth that survives a cleared or
  evicted cache — on launch, any project missing from the cache is recovered from these
  backups.
- A project can additionally be linked to an **external `.frdx` file** the user picks
  (Files / iCloud Drive) for sharing or a chosen location; it autosaves there too.

## Project structure

- `src/lib/` — pure logic: screenplay/fountain parsing, import/export, the project file
  format, the durable store (`projectStore.ts`), per-project undo history (`history.ts`),
  and the IndexedDB cache (`storage.ts`).
- `src/components/` — UI for the three modes, the editor, and dialogs.
- `ios/App/App/ForwardDraftFilePlugin.swift` — the custom Capacitor plugin backing the
  durable store and external-file open/save.
