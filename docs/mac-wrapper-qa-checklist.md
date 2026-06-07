# Mac Wrapper QA Checklist

Use this checklist for the first Mac pass from the Apple wrapper branch. Record notes in `docs/Testing Notes/`.

## Build And Launch

- [ ] Run the Mac build script successfully.
- [ ] Open `ios/App/App.xcodeproj` in Xcode.
- [ ] Select `My Mac` as the destination, shown as Designed for iPad/iPhone.
- [ ] Build and launch Forward Draft on Mac.
- [ ] Confirm the app launches without needing a web server.
- [ ] Confirm the app remains on the same local project after relaunch.

## Window And Layout

- [ ] Default window size feels usable on Mac.
- [ ] Window can be resized wider without broken spacing.
- [ ] Window can be resized narrower without important controls clipping.
- [ ] Top navigation has enough breathing room in a Mac window.
- [ ] Scene list opens and closes cleanly.
- [ ] Right tools panel stays readable and scrollable.
- [ ] Options menu stays inside the window and scrolls if needed.
- [ ] Cover page editor stays usable in the Mac window.

## Pointer And Keyboard

- [ ] Pointer hover states feel clear.
- [ ] Buttons and segmented controls feel precise with mouse/trackpad.
- [ ] Text cursor placement works in Write.
- [ ] Text cursor placement works in Rewrite.
- [ ] Tab cycles screenplay elements.
- [ ] Undo and redo work after typing.
- [ ] Undo and redo work after non-typing actions.
- [ ] Keyboard focus does not get trapped in menus or popovers.

## Write Mode

- [ ] Create a new scene at the end.
- [ ] Insert a scene before an existing scene.
- [ ] Insert a scene after an existing scene.
- [ ] Create and insert chapters in freewriting mode.
- [ ] Visible Text Window options behave correctly.
- [ ] Fade timing behaves correctly.
- [ ] Scene heading suggestions appear.
- [ ] Character name suggestions appear.

## Review Mode

- [ ] Full Script view uses proper scene numbering beside headings.
- [ ] Scene view uses proper scene numbering beside headings.
- [ ] Scene reorder works with mouse/trackpad drag.
- [ ] Mark Selection works with mouse-selected text.
- [ ] Note icon opens the connected note popover.
- [ ] Tapping a note in the side panel opens the connected note popover.
- [ ] Approve and Needs Rewrite update scene status.
- [ ] Compare versions allows choosing versions when more than two exist.

## Rewrite Mode

- [ ] Single Scene workspace works.
- [ ] All Scenes workspace works.
- [ ] Reviewed scene preview can be shown and hidden.
- [ ] Notes in reviewed scene can be shown and hidden.
- [ ] Previous/next scene panels are visually distinct and legible.
- [ ] Script element buttons behave like Write mode.
- [ ] Text style controls apply only to selected text where expected.
- [ ] Mark Rewrite Done updates scene status.

## File Workflows

- [ ] Save `.frdx` project from the Mac app.
- [ ] Open saved `.frdx` project from Finder/iCloud Drive.
- [ ] Duplicate and rename `.frdx`, then open it.
- [ ] Import Fountain.
- [ ] Import TXT.
- [ ] Import Final Draft `.fdx`.
- [ ] Export Fountain.
- [ ] Export TXT.
- [ ] Export PDF.
- [ ] Export Revision PDF.
- [ ] Export Changes PDF.
- [ ] Confirm exported PDFs open correctly in Preview.

## Mac Decision Gate

- [ ] Does the iPad-on-Mac wrapper feel good enough for the first Mac test build?
- [ ] Do file pickers feel Mac-like enough?
- [ ] Do we need Mac-specific window sizing or toolbar changes?
- [ ] Do we need a later Catalyst/native Mac target, or can this shared wrapper carry v1?
