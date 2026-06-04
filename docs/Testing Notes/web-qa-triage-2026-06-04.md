# Web QA Triage - 2026-06-04

Source: `web-qa-2026-06-04.txt`

Test environment: Safari on Mac mini

## Overall Result

The general app shell, project management, cover page, review navigation, scene reordering, themes, and desktop layout passed the first Safari QA pass.

The app is ready for a focused web-fix cycle before Apple wrapper work. File saving/export behavior is the only testing blocker. The remaining findings are a mix of contained bugs and larger editor-design decisions.

## Priority 0: Unblock File And Export Testing

### Safari opens the share sheet for saves and exports

**Finding**

Saving `.frdx` files and exporting Fountain, TXT, and PDF opens the macOS share sheet instead of saving or downloading a file.

**Cause**

Safari does not expose the browser `showSaveFilePicker` API used by Chromium. The current file service falls back to the Web Share API before it falls back to a browser download, so Safari deliberately opens the share sheet.

**Plan**

- On desktop web browsers without a save picker, download the file directly.
- Keep sharing as a separate future action, rather than using it as the automatic save fallback.
- In Apple wrappers, replace browser save behavior with the native document picker and Files integration.
- Retest all `.frdx` save/open and export checklist items after the change.

## Priority 1: Repair Core Write Behavior

### Visible Text Window fades the wrong text

**Finding**

The selected visible lines are blurred even before the chosen fade condition occurs.

**Cause**

The current rendering fades every selected line except the newest one immediately, independently of the selected fade timing.

**Plan**

- Keep the entire selected text window fully legible until the chosen fade condition occurs.
- Fade the selected window together when the condition is reached.
- Verify line, previous paragraph, previous chapter, and previous scene modes separately.

### Previous scene/chapter context is incomplete

**Finding**

Previous scene mode shows only the current scene rather than the current and previous scenes. Freewriting context modes behave similarly.

**Cause**

The current logic slices from the most recent heading, which returns only the current section.

**Plan**

- Previous scene: show the previous scene plus the current scene.
- Previous chapter: show the previous chapter plus the current chapter.
- Previous paragraph: show the current paragraph until the next paragraph begins.
- Decide whether Write also needs an optional next-scene context when inserting between existing scenes.

### Insert before/after cannot target every scene

**Finding**

The placement menu only offers some scenes.

**Cause**

The placement list explicitly excludes scenes created from the current writing draft. The current draft model also inserts all draft-created scenes as one group, so arbitrary insertion between draft scenes needs a model adjustment.

**Plan**

- Allow every scene/chapter to appear as a placement target.
- Preserve stable scene IDs while inserting new sections.
- Ensure insertion moves only the new scene/chapter, not the whole current draft group.
- Add automated tests for insert-before, insert-after, numbering, and content preservation.

### Undo/redo buttons ignore uncommitted typing

**Finding**

The toolbar buttons may undo the previous saved app action rather than the text currently being typed. Keyboard undo worked during a later test.

**Cause**

The toolbar controls use the global saved-data history. The active Write textarea is local component state and is not part of that history. The keyboard shortcut inside the textarea uses the browser's native text history.

**Plan**

- Give the active editor its own typing undo/redo history.
- Use editor history first while writing, then fall back to project-level history.
- Verify toolbar buttons and keyboard shortcuts behave consistently.

### Script page appears left of center

**Plan**

- Recheck at common Mac and iPad widths after the functional Write fixes.
- Align the screenplay content area to the same industry-format margins used by Review and exports.

## Priority 2: Preserve And Render Screenplay Structure

### Imported dialogue appears as left-aligned plain text

**Finding**

Fountain and Final Draft imports preserve dialogue words but display dialogue left aligned.

**Cause**

The importers identify enough structure to split scenes, but scene versions are stored and rendered as flattened plain text. Review and Rewrite therefore cannot reliably distinguish action, character, dialogue, parenthetical, and transition lines.

**Plan**

- Add a shared screenplay parser/renderer that converts scene text into typed screenplay elements.
- Use it in Review, Rewrite reviewed-scene previews, context scenes, and clean PDF export.
- Preserve Final Draft paragraph types during import where possible.
- Add import/render tests covering character, dialogue, parenthetical, transition, and action formatting.

### Rewrite editor lacks screenplay tools

**Finding**

Rewrite uses a plain textarea and cannot conveniently add correctly formatted screenplay elements.

**Plan**

- Build the rewrite editor on the same element-aware editing model as Write.
- Include Heading, Action, Character, Dialogue, Parenthetical, and Transition controls.
- Keep the reviewed marked-up scene and context toggles.
- Preserve version creation and change comparison behavior.

### Text styling currently changes the whole app

**Finding**

Typeface, size, bold, italic, and underline apply globally rather than to selected text.

**Cause**

These controls currently set global CSS appearance variables. The project data format has no inline text-style model.

**Decision Required**

- Keep typeface, size, and spacing as global draft-appearance settings.
- Treat bold, italic, and underline as selected-text formatting and store them in project content.
- Implement selected-text formatting alongside the structured screenplay editor rather than patching it into plain textareas.

## Priority 3: Review And Rewrite Polish

### Heading marks do not reliably display

**Plan**

- Reproduce marking a full heading and part of a heading.
- Correct selection offsets and ensure highlights and note pins render in headings.
- Add a focused automated test for heading annotations.

### Rewrite previous/next scene contrast

**Plan**

- Verify the Safari appearance of both context scenes.
- Ensure previous and next scenes share a subdued background distinct from the active rewrite editor in light and dark modes.

## Deferred Features

### PDF import

PDF import is plausible but should follow the structured screenplay parser work. Text-based screenplay PDFs can be parsed heuristically; scanned PDFs would require OCR and will be less reliable. Treat this as a separate import feature after the current web QA fixes and Apple wrapper baseline.

## Recommended Implementation Batches

### Batch 1: Unblock and stabilize

- Replace Safari share fallback with desktop download behavior.
- Fix visible-text-window fading and previous section context.
- Reproduce and fix heading marks.
- Add regression tests.
- Repeat the blocked `.frdx` and export checks in Safari.

Implementation completed on 2026-06-04. Safari save/export, heading marks, and timed visibility checks passed. Context fading was corrected and verified locally.

### Batch 2: Correct Write workflows

- Redesign arbitrary scene/chapter insertion.
- Align toolbar and keyboard undo/redo with active editor typing.
- Suggest existing character names when writing a Character element, including names found in imported scripts.
- Check Write page alignment.
- Repeat Script and Freewriting QA sections.

Implementation completed on 2026-06-04. Automated and local UI verification pass; Safari manual retest remains.

Follow-up clarification implemented: `Fade after next block` now holds the complete selected context window until the next equivalent window is completed. Previous scene/chapter context remains readable while writing the current section and fades only after the following section begins.

### Batch 3: Structured screenplay editing

- Add shared screenplay element parsing/rendering.
- Correct imported screenplay formatting.
- Add screenplay tools to Rewrite.
- Implement selected-text bold, italic, and underline.
- Recheck PDF export formatting.

First implementation slice completed on 2026-06-04:

- Shared screenplay parsing and rendering now formats Review and Rewrite reviewed-scene previews.
- Imported script dialogue, character, parenthetical, transition, heading, and action lines now receive screenplay display roles.
- Rewrite now includes Heading, Action, Character, Dialogue, Parenthetical, and Transition controls that apply to the active editor line.
- Note highlights and connectors remain anchored to the original source offsets.
- Rewrite now shares Write's heading, character, transition, and parenthetical suggestions and Tab element cycling.
- Character, dialogue, and parenthetical blocks now use consistent industry-style centered margins across Write, Review, and Rewrite.
- Final Draft imports preserve consecutive dialogue paragraph classification.
- Bold, italic, and underline no longer change the whole app. They apply only to selected editable text in Write and Rewrite using portable Fountain inline formatting; Review remains read-only.
- Write and Rewrite now render inline formatting visually while retaining portable Fountain-compatible storage.
- Rewrite now uses a visual element-aware editing surface, so Character, Dialogue, Parenthetical, Heading, Action, and Transition lines remain correctly aligned while editing.
- Screenplay character recognition is Unicode-aware, including uppercase Greek names in Fountain and Final Draft imports.

Remaining in Batch 3:

- Apply shared screenplay structure to clean and annotated PDF layout.
- Continue refining selection behavior and rich-text interoperability while preserving portable Fountain formatting.

### Batch 4: Wrapper readiness

- Run the complete web QA checklist in Safari and Chrome.
- Resolve remaining high-impact findings.
- Begin macOS/iPadOS wrapper setup with native open/save integration.
