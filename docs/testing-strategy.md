# Forward Draft Testing Strategy

Forward Draft will use the web app as the fast development surface, then graduate the same app logic into Apple-device testing through an iPad/iOS wrapper. The priority is to protect project files, imports, exports, and long writing sessions before investing heavily in platform packaging.

## Goals

- Keep `.frdx` as the single portable Forward Draft project file.
- Prove that project data survives save, open, duplicate, rename, import, export, and app updates.
- Test the same core workflows on web, iPad, iPhone, and Mac.
- Separate app logic confidence from platform wrapper confidence.
- Catch layout and interaction issues early on tablet and desktop viewports.

## Phase 0: Stable Baseline

Purpose: define what the current stable app must keep doing before native wrapper work begins.

Prepare:

- Confirm `main` is stable and pushed.
- Keep representative sample files in `tests/fixtures/`.
- Create one stress project with many scenes, notes, versions, reordered scenes, a cover page, and both reviewed and rewritten scenes.
- Record known limitations separately from bugs.

Checklist:

- App builds cleanly.
- Write, Review, and Rewrite tabs load.
- Light mode and dark mode both render cleanly.
- `.frdx` save and open work.
- Fountain, TXT, and Final Draft imports work.
- Fountain, TXT, PDF, Revision PDF, and Changes PDF exports work.
- Scene insertion and reordering work.
- Notes remain attached to their highlighted text.
- Cover page appears in exports.

Decision Point:

- If baseline workflows are unstable, fix them before adding test infrastructure.
- If baseline workflows are stable, add automated core tests.

Exit Criteria:

- The app has a known-good manual baseline.
- Test fixture needs are documented.
- Current limitations are known and accepted.

## Phase 1: Core Logic Tests

Purpose: protect data behavior from UI redesigns and native wrapper changes.

Recommended tool: Vitest.

Planned command:

```sh
npm test
```

Setup command:

```sh
npm install -D vitest jsdom
```

Areas to test:

- `.frdx` serialization and parsing.
- `.frdx` validation and graceful failure.
- Renamed or duplicated `.frdx` files opening correctly.
- Fountain import.
- TXT import.
- Final Draft import.
- Scene insertion before and after existing scenes.
- Scene reorder preserving scene IDs, notes, versions, and current selection.
- Freewriting chapter reorder preserving content.
- Notes remaining attached to the intended text.
- Rewrite completion updating the correct scene.
- Cover page data included in exported formats.

Preparation:

- Add test fixtures for common and edge-case files.
- Keep test fixtures small enough to understand by inspection.
- Add at least one larger stress fixture later.

Decision Point:

- If project-file tests are fragile, simplify the file-service boundary before adding more tests.
- If import parsing has edge cases, add fixture-first tests before changing parser behavior.

Exit Criteria:

- Core tests run with one command.
- Data-format changes require updating or passing tests.
- A broken import/export path is caught before manual testing.

## Phase 2: Web Workflow Smoke Tests

Purpose: test real user journeys in the browser before wrapping the app.

Recommended tool: Playwright.

Primary workflows:

- Create a new script project.
- Add scenes.
- Insert a scene before and after an existing scene.
- Reorder scenes.
- Mark selected text and add a note.
- Open a note from the text pin.
- Open the same note from the notes side panel.
- Rewrite a scene and mark rewrite done.
- Switch between Write, Review, and Rewrite.
- Toggle scenes, notes, preview, previous scene, and next scene.
- Import Fountain, TXT, and Final Draft files.
- Export Fountain, TXT, and PDFs.
- Save and reopen `.frdx`.

Viewports:

- iPad landscape.
- iPad portrait.
- Mac laptop width.
- Wide desktop.

Themes:

- Light.
- Dark.
- System setting, when supported.

Decision Point:

- If smoke tests catch repeated layout issues, stabilize web layout before native wrapper work.
- If workflow tests pass consistently, begin the Apple wrapper branch.

Exit Criteria:

- The main workflows pass in automated browser tests.
- Tablet and desktop layouts are verified before wrapping.
- The test suite can be run before commits.

## Phase 3: Apple Wrapper Spike

Purpose: prove that the current app can run as an installable iPad/iPhone app.

Recommended first wrapper: Capacitor.

Preparation:

- Create a separate branch for wrapper work.
- Add Capacitor configuration.
- Add the iOS project.
- Set app name and bundle identifier.
- Add temporary app icons and launch assets.
- Confirm the app runs without requiring network access.

Checklist:

- Web build copies into the iOS wrapper.
- App launches in iOS Simulator.
- App launches on a connected iPad.
- Existing local storage behavior works.
- `.frdx` save and open behavior is understandable.
- Import and export actions still work.
- Dark and light modes render correctly.
- Touch selection is usable for note marking.
- Landscape and portrait both work.

Decision Point:

- If file handling is acceptable, continue with Capacitor.
- If file handling feels awkward, add native file-service support.
- If the wrapper blocks core product quality, reassess the wrapper choice.

Exit Criteria:

- The app installs and runs on an iPad.
- Core writing and file workflows work outside the browser.
- Wrapper risks are documented.

## Phase 4: Real Device QA

Purpose: test the actual environment the first launch is aimed at.

Devices:

- iPad, primary.
- iPhone, secondary.
- Mac, depending on wrapper path.

Scenarios:

- Fresh install.
- Long writing session.
- Save to Files.
- Open from Files.
- Duplicate in Files.
- Rename in Files.
- Import existing scripts.
- Export finished scripts.
- Offline use.
- App close and reopen.
- Orientation changes.
- External keyboard use, if available.

Decision Point:

- If project files ever become hard to recover, pause feature work and fix file handling.
- If touch selection is poor, improve text interaction before TestFlight.
- If iPhone feels too cramped, decide whether iPhone is read/review only for v1 or fully supported.

Exit Criteria:

- No known project-loss bugs.
- Save/open/import/export are understandable on iPad.
- The app feels usable for real writing, not just demo flows.

## Phase 5: TestFlight

Purpose: distribute beta builds safely and collect real feedback.

Preparation:

- Apple Developer Program account.
- App Store Connect app record.
- Internal tester list.
- Beta test notes.
- Known issues list.
- Feedback template.

Checklist:

- Upload build.
- Install from TestFlight.
- Test fresh install.
- Test update over previous build.
- Test project files from older builds.
- Test exported files outside the app.
- Review tester feedback.
- Track crashes and critical issues.

Decision Point:

- Internal TestFlight only until file handling is boringly reliable.
- External TestFlight only after no project-loss bugs remain.

Exit Criteria:

- Internal testers can complete real workflows.
- Critical bugs have fixes or clear mitigations.
- The app is ready for broader beta feedback.

## Release Readiness Gate

Forward Draft should not be considered launch-ready until:

- Core tests pass.
- Web workflow tests pass.
- iPad real-device QA passes.
- File handling is reliable.
- `.frdx` remains portable and stable.
- Imports fail gracefully when files are invalid.
- Exports produce usable output.
- Dark and light modes are polished.
- At least one long writing session has been completed successfully.
