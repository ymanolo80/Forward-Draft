# Forward Draft Manual QA Checklist

Use this checklist before major commits, before Apple wrapper testing, and before TestFlight builds.

## Test Session Setup

- Date:
- Tester:
- Device:
- Browser or wrapper:
- App version or commit:
- Test project:
- Notes:

## General App Health

- App opens without errors.
- Write tab opens.
- Review tab opens.
- Rewrite tab opens.
- Options menu opens and stays open while selecting items.
- Light mode works.
- Dark mode works.
- System theme works, if available.
- Panels do not overlap awkwardly.
- Buttons remain legible.
- Text does not overflow buttons or panels.
- Touch or pointer interaction feels responsive.

## Project Management

- Create new script project.
- Create new freewriting project.
- Rename project.
- Duplicate project.
- Delete project only after confirmation.
- Switch between projects.
- Current project name is clear.
- Project type is visible in the non-action information area.

## `.frdx` Files

- Save project as `.frdx`.
- Open saved `.frdx`.
- Rename `.frdx` in the file system and reopen it.
- Duplicate `.frdx` in the file system and reopen it.
- Open an invalid file and confirm the error is understandable.
- Save after reopening and confirm no data is lost.

## Imports

- Import Fountain script.
- Import TXT script.
- Import Final Draft `.fdx` script.
- Confirm scene headings are recognized.
- Confirm action text imports.
- Confirm dialogue imports.
- Confirm imported project name is sensible.
- Confirm imported file can then be saved as `.frdx`.
- Confirm invalid imports fail gracefully.

## Exports

- Export Fountain.
- Export TXT.
- Export PDF.
- Export Revision PDF.
- Export Changes PDF.
- Confirm cover page appears first when present.
- Confirm full script exports all scenes in order.
- Confirm scene numbers appear beside headings.
- Confirm notes appear in Revision PDF.
- Confirm changed scenes appear in Changes PDF.
- Open exported files outside Forward Draft.

## Cover Page

- Open Cover Page from Options.
- Edit title.
- Edit written-by field.
- Edit contact details.
- Edit date.
- Save cover page.
- Reopen cover page and confirm fields persist.
- Export with cover page.

## Write: Script Mode

- Add a next scene.
- Insert scene before an existing scene.
- Insert scene after an existing scene.
- Confirm scene numbering updates.
- Confirm selected scene updates.
- Type into current scene.
- Confirm previous scene visibility toggle works.
- Confirm next scene visibility toggle works.
- Confirm visible text window setting works.
- Confirm undo works.
- Confirm redo works.
- Confirm font settings apply clearly.

## Write: Freewriting Mode

- Create a chapter.
- Add paragraphs.
- Confirm previous chapter disappearing behavior.
- Confirm previous paragraph disappearing behavior.
- Confirm line-based disappearing behavior.
- Reorder chapters.
- Confirm chapter numbering updates.
- Confirm chapter content is preserved.
- Confirm visible text window setting is clear.

## Review

- Full script view shows all scenes in order.
- Scene view shows selected scene.
- Scene number appears beside heading.
- Heading text aligns with action text.
- Scenes panel hide/show works.
- Reorder scenes mode works.
- Dragging scenes shows clear placement feedback.
- Scene reorder preserves notes and versions.
- Mark selection creates yellow highlight.
- Note editor opens after marking text.
- Note pin appears beside highlighted text.
- Clicking note pin opens anchored note popover.
- Clicking note in side panel opens same anchored note popover.
- Notes side panel shows highlighted source text.
- Notes side panel hide/show works.

## Rewrite

- Selected scene appears in right tool panel with scene number.
- All-scenes mode updates selected scene when a scene is clicked.
- Previous scene can be shown and hidden.
- Next scene can be shown and hidden.
- Reviewed marked-up scene can be shown and hidden.
- Reviewed-scene notes can be shown and hidden.
- Notes connect visually to highlighted text.
- Rewrite workspace accepts edits.
- Mark Rewrite Done updates the selected scene.
- Scenes List appears below workspace.
- Scene headings use correct numbering format.
- Compare versions works when more than two versions exist.

## Layout: Tablet And Desktop

- iPad portrait layout is usable.
- iPad landscape layout is usable.
- Mac laptop width is usable.
- Wide desktop layout is usable.
- Tool panels remain reachable.
- Important controls are not hidden behind menus unnecessarily.
- Long scripts remain readable.
- Side panels scroll independently where needed.

## Keyboard And Pointer

- Text selection works with pointer.
- Text selection works with touch, where applicable.
- External keyboard typing works.
- Undo shortcut works, if supported.
- Redo shortcut works, if supported.
- Tab navigation does not trap the user.

## Stability

- App survives reload.
- App survives switching tabs.
- App survives closing and reopening.
- Long project remains responsive.
- No obvious console errors.
- No project data disappears.

## Result

- Pass:
- Fail:
- Blockers:
- Follow-up fixes:
