# Apple Wrapper Spike Checklist

Branch: `codex/apple-wrapper-spike`

Temporary bundle identifier: `com.ymanolo80.forwarddraft`

## Foundation

- [x] Stable web checkpoint pushed to `main`.
- [x] Separate wrapper branch created.
- [x] Capacitor core, CLI, and iOS platform packages installed.
- [x] Capacitor configured to package the Vite `dist` build.
- [x] Native iOS project generated.
- [x] Web build synced into the native project.
- [x] Native iOS project builds successfully.

## First Simulator Run

- [ ] Open `ios/App/App.xcodeproj` in Xcode.
- [ ] Select an iPad simulator.
- [x] Build and run Forward Draft.
- [x] Confirm the app launches without network access.
- [ ] Confirm Write, Review, and Rewrite open.
- [ ] Check landscape and portrait layouts.
- [x] Check light and dark modes.

## First Connected iPad Run

- [ ] Connect the iPad by cable.
- [ ] Trust the Mac on the iPad when prompted.
- [ ] Enable Developer Mode on the iPad if requested.
- [ ] Add the Apple account and signing team in Xcode.
- [ ] Select the connected iPad as the run destination.
- [ ] Build and launch Forward Draft on the device.
- [ ] Test touch selection and note marking.
- [ ] Test typing with the on-screen keyboard.
- [ ] Test an external keyboard if available.

## File Workflow Audit

- [ ] Save a `.frdx` project to Files.
- [ ] Open a `.frdx` project from Files.
- [ ] Duplicate and rename a `.frdx` in Files, then open it.
- [ ] Import Fountain, TXT, and Final Draft files.
- [ ] Export Fountain, TXT, and all PDF types.
- [ ] Confirm exported files open outside Forward Draft.
- [ ] Record every place where browser-style file behavior feels unclear.

## Decision Gate

Continue with Capacitor if the app launches reliably and core workflows feel natural.

Add a native file-service adapter if save, open, import, or export behavior is awkward inside the wrapper.

Pause wrapper work if project-file safety or touch text selection is unreliable.
