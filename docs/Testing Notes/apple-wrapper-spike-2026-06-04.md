# Apple Wrapper Spike - 2026-06-04

Branch: `codex/apple-wrapper-spike`

Base web checkpoint: `5ad0e3e`

## Result

The existing React/Vite app successfully builds, installs, and launches as an iPad/iPhone application using Capacitor 8.

## Completed

- Installed Capacitor core, CLI, and iOS packages.
- Added Capacitor configuration for Forward Draft.
- Generated the native iOS Xcode project.
- Synced the production web build into the iOS project.
- Compiled the native project for the iOS Simulator with signing disabled.
- Installed and launched Forward Draft on an iPad Air 13-inch simulator.
- Confirmed the app launches from its bundled local assets without a development server.
- Confirmed light and dark system appearances render.

## Commands

Build and sync the packaged web app:

```sh
npm run native:sync
```

Compile the simulator build:

```sh
npm run native:build:ios
```

Build, sync, and open the iOS project in Xcode:

```sh
npm run native:ios
```

## First Native Observations

- The wrapper approach is viable; no architectural rewrite was required.
- Portrait launches cleanly and is usable.
- The portrait top bar and tall tools panel should be reviewed during device QA.
- Dark and light themes both respond to the simulator system appearance.
- The native app starts with its own local storage, separate from the browser test data.
- Landscape rotation still needs a manual Simulator or device check.
- Save, open, import, and export behavior remain the most important unresolved native risks.

## Next Session

1. Open the iOS project in Xcode.
2. Manually test Write, Review, and Rewrite in iPad portrait and landscape.
3. Connect the physical iPad and configure signing.
4. Run the first real-device workflow pass.
5. Audit `.frdx` save/open and all import/export actions.
6. Decide whether Forward Draft needs a native file-service adapter.
