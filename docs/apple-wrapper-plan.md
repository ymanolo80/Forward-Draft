# Apple Wrapper Plan

The first native target should be iPadOS, with iOS and Mac considered from the same foundation. The current React/Vite app should remain the development and debugging surface while the Apple wrapper proves real-device behavior.

## Recommended Path

Use Capacitor first.

Why:

- The app is already a React/Vite application.
- Capacitor can wrap the existing web build in an iOS project.
- It gives us a practical bridge to iPad and iPhone without rewriting the app.
- It keeps the door open for Android later.
- It lets us test file handling and touch behavior on real Apple devices early.

## Branch Strategy

- Keep `main` stable.
- Create a wrapper branch when ready, for example `codex/apple-wrapper-spike`.
- Do not mix major visual redesign work with wrapper setup.
- Merge wrapper work only after it launches locally and the tradeoffs are clear.

## Prerequisites

- Xcode installed.
- Apple account added to Xcode.
- Connected iPad available for testing.
- Developer Mode enabled on device if required.
- Current app builds successfully.
- Manual QA baseline has been run on web.

## Initial Wrapper Tasks

- Add Capacitor dependencies.
- Add Capacitor config.
- Set app name to Forward Draft.
- Set bundle identifier.
- Add iOS platform.
- Build the web app.
- Sync web build into iOS project.
- Open project in Xcode.
- Launch in iOS Simulator.
- Launch on connected iPad.

## File Management Focus

This is the most important wrapper risk.

Things to verify:

- Can the user save a `.frdx` file to Files?
- Can the user open a `.frdx` file from Files?
- Can the user duplicate a `.frdx` in Files and open the duplicate?
- Can the user rename a `.frdx` in Files and open the renamed file?
- Can the user import Fountain, TXT, and FDX files from Files?
- Can the user export PDF, Fountain, and TXT files to Files?
- Does the app behave clearly when permission or file access fails?

Decision Point:

- If browser-style downloads are awkward inside the wrapper, create a native file-service adapter.
- If native file access is needed, keep it behind the existing file-service boundary.

## iPad QA Goals

- The app feels comfortable in landscape.
- The app remains usable in portrait.
- Side panels feel intentional, not cramped.
- Touch selection is accurate enough for note marking.
- Long scripts remain readable.
- Save/open/import/export are understandable.
- The app works offline.

## iPhone QA Goals

The iPhone target should be tested, but it may not need full parity for the first launch.

Questions:

- Is iPhone useful for reading and reviewing only?
- Is full writing practical on iPhone?
- Should some panels become drawers?
- Should Rewrite be simplified on small screens?

Decision Point:

- If iPhone feels too cramped, define a narrower v1 iPhone scope instead of forcing the full iPad UI.

## Mac QA Goals

Start by testing whether the iPad app experience is acceptable on Mac.

Things to verify:

- Window resizing works.
- Keyboard and pointer feel precise.
- File open/save feels Mac-like enough.
- Tool panels feel appropriately dense.
- Dark and light mode work.
- Exports open correctly in macOS apps.

Decision Point:

- If iPad-on-Mac feels good enough, continue with shared app architecture.
- If it feels compromised, plan Mac-specific refinements.
- If deeper desktop features are required later, reassess the desktop wrapper strategy.

## TestFlight Preparation

Before TestFlight:

- Local iPad testing passes.
- `.frdx` file handling is reliable.
- Exported files can be opened outside the app.
- There are no known project-loss bugs.
- Known issues are documented.
- Beta testing instructions are written.

Internal TestFlight:

- Use for you and trusted testers first.
- Focus on project safety and file workflows.
- Collect screenshots and exact reproduction steps.

External TestFlight:

- Start only after internal testers can complete real work safely.
- Keep test goals narrow for each build.

## Wrapper Success Criteria

The wrapper spike is successful if:

- Forward Draft installs on iPad.
- The app launches offline.
- Core writing, review, and rewrite workflows work.
- Save/open/import/export are usable.
- The app feels tablet-first.
- Any native limitations are clearly documented.

The wrapper spike should stop or pause if:

- Project file handling is unreliable.
- Touch text selection cannot support notes.
- The app cannot recover safely from file errors.
- Native wrapper work starts forcing major app rewrites before we understand the problem.
