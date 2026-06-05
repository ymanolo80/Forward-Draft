# iPad Device QA Checklist

Use this checklist for the first physical iPad pass. Record notes in `docs/Testing Notes/`.

## First Launch And Chrome

- [ ] App launches from the iPad home screen.
- [ ] Top bar clears the iPad status bar in portrait.
- [ ] Top bar clears the iPad status bar in landscape.
- [ ] Options button clears battery, Wi-Fi, and system indicators.
- [ ] Bottom content clears the home indicator.
- [ ] Light mode looks correct.
- [ ] Dark mode looks correct.
- [ ] Switching iPad appearance updates the app without visual glitches.

## Orientation And Layout

- [ ] Portrait layout is usable without horizontal clipping.
- [ ] Landscape layout is usable without horizontal clipping.
- [ ] Scene list opens and closes cleanly.
- [ ] Scene list does not cover important writing controls.
- [ ] Right tools panel remains readable and scrollable.
- [ ] Options menu fits on screen and scrolls if needed.
- [ ] Popovers, note boxes, and cover page editor stay inside the visible area.

## Touch And Keyboard Input

- [ ] Tap targets feel large enough for fingers.
- [ ] Text cursor placement works in Write.
- [ ] Text cursor placement works in Rewrite.
- [ ] On-screen keyboard does not hide the active writing area.
- [ ] External keyboard typing works if available.
- [ ] Tab cycles screenplay elements with an external keyboard.
- [ ] Undo and redo buttons work after typing and non-typing actions.

## Write Mode

- [ ] Create a new scene at the end.
- [ ] Insert a scene before an existing scene.
- [ ] Insert a scene after an existing scene.
- [ ] Create a new chapter in freewriting mode.
- [ ] Insert a chapter before an existing chapter.
- [ ] Insert a chapter after an existing chapter.
- [ ] Visible Text Window options behave correctly.
- [ ] Fade timing behaves correctly.
- [ ] Scene/chapter suggestions appear where expected.
- [ ] Character name suggestions appear where expected.

## Review Mode

- [ ] Full Script view uses proper scene numbering beside headings.
- [ ] Scene view uses proper scene numbering beside headings.
- [ ] Scene reorder works by touch drag.
- [ ] Mark Selection works with touch-selected text.
- [ ] Note icon opens the connected note popover.
- [ ] Tapping a note in the side panel opens the same connected note popover.
- [ ] Approve and Needs Rewrite update scene status.
- [ ] Compare versions allows choosing versions when more than two exist.

## Rewrite Mode

- [ ] Selected scene heading shows the correct scene number and heading.
- [ ] Single Scene workspace works.
- [ ] All Scenes workspace works.
- [ ] Previous/next scene panels are visually distinct and legible.
- [ ] Reviewed scene preview can be shown and hidden.
- [ ] Notes in reviewed scene can be shown and hidden.
- [ ] Script element buttons behave like Write mode.
- [ ] Text style controls apply only to selected text where expected.
- [ ] Mark Rewrite Done updates scene status.

## File Workflows

- [ ] Save `.frdx` project from the native app.
- [ ] Open saved `.frdx` project from Files.
- [ ] Duplicate and rename `.frdx` in Files, then open it.
- [ ] Import Fountain.
- [ ] Import TXT.
- [ ] Import Final Draft `.fdx`.
- [ ] Export Fountain.
- [ ] Export TXT.
- [ ] Export PDF.
- [ ] Export Revision PDF.
- [ ] Export Changes PDF.
- [ ] Confirm exported files can be opened outside Forward Draft.

## Stability Notes

- [ ] Relaunch preserves project state.
- [ ] Force quit and reopen preserves project state.
- [ ] iPad sleep/wake preserves current work.
- [ ] App remains responsive with a longer imported script.
- [ ] No obvious overheating, heavy lag, or repeated reloads.

## Decision Gate

- [ ] Is the current web-wrapper approach acceptable for TestFlight?
- [ ] Do file workflows need a native file-service adapter before TestFlight?
- [ ] Does touch text selection need platform-specific refinement?
- [ ] Are portrait and landscape both good enough, or should iPad launch be landscape-first?
