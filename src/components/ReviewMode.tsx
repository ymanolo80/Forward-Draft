import { Fragment, useRef, useState } from "react";
import { ToolFontControls } from "./ToolFontControls";
import type { AppData, FontSettings, Highlight, Project, ReviewNote, Scene, SceneVersion } from "../types";
import { createId, nowIso } from "../lib/ids";

interface ReviewModeProps {
  data: AppData;
  project: Project;
  setData: (next: AppData) => void;
  stats: { words: number; pages: number };
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fontSettings: FontSettings;
  setFontSettings: (next: FontSettings) => void;
}

interface SelectionInfo {
  text: string;
  sceneId: string;
  versionId: string;
  rangeStart: number;
  rangeEnd: number;
}

type ReviewView = "scene" | "full";
interface NoteAnchor {
  x: number;
  y: number;
}

function annotationClass(annotation: Highlight | ReviewNote) {
  if ("color" in annotation && annotation.color === "underline") return "script-underline";
  if ("hasNote" in annotation && annotation.hasNote) return "script-highlight has-note";
  return "script-highlight";
}

function applyAnnotations(
  text: string,
  highlights: Highlight[],
  notes: ReviewNote[],
  onOpenNote: (noteId: string, anchor?: NoteAnchor) => void,
  offset = 0,
) {
  const noteRanges = notes
    .filter((note) => !note.resolved && note.rangeEnd > note.rangeStart)
    .filter((note) => !highlights.some((highlight) => highlight.noteId === note.noteId));
  const annotations = [...highlights, ...noteRanges]
    .filter((item) => item.rangeEnd > item.rangeStart)
    .filter((item) => item.rangeEnd > offset && item.rangeStart < offset + text.length)
    .sort((a, b) => a.rangeStart - b.rangeStart);
  let cursor = 0;
  const parts: React.ReactNode[] = [];

  annotations.forEach((annotation) => {
    const rangeStart = Math.max(0, annotation.rangeStart - offset);
    const rangeEnd = Math.min(text.length, annotation.rangeEnd - offset);
    if (rangeStart < cursor) return;
    parts.push(text.slice(cursor, rangeStart));
    const noteId = "noteId" in annotation ? annotation.noteId : annotation.noteId;
    parts.push(
      <mark
        className={annotationClass(annotation)}
        data-note-id={noteId ?? undefined}
        key={`${rangeStart}-${rangeEnd}-${noteId ?? annotation.selectedText}`}
        onClick={(event) => {
          if (!noteId) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onOpenNote(noteId, { x: rect.right, y: rect.top + rect.height / 2 });
        }}
      >
        {text.slice(rangeStart, rangeEnd)}
        {noteId && (
          <button
            className="note-pin"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenNote(noteId, { x: rect.right, y: rect.top + rect.height / 2 });
            }}
            type="button"
            aria-label="Open note"
          >
            N
          </button>
        )}
      </mark>,
    );
    cursor = rangeEnd;
  });

  parts.push(text.slice(cursor));
  return parts;
}

function splitSceneText(text: string) {
  const headingEnd = text.indexOf("\n");
  if (headingEnd < 0) return { heading: text, body: "", bodyOffset: text.length };
  return {
    heading: text.slice(0, headingEnd),
    body: text.slice(headingEnd),
    bodyOffset: headingEnd,
  };
}

export function ReviewMode({
  data,
  project,
  setData,
  stats,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  fontSettings,
  setFontSettings,
}: ReviewModeProps) {
  const [selectedSceneId, setSelectedSceneId] = useState(project.scenes[0]?.sceneId);
  const [reviewView, setReviewView] = useState<ReviewView>("scene");
  const [compare, setCompare] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState("");
  const [scenePaneOpen, setScenePaneOpen] = useState(true);
  const [showScenes, setShowScenes] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [dragSceneId, setDragSceneId] = useState<string | undefined>();
  const [dropIndex, setDropIndex] = useState<number | undefined>();
  const [selection, setSelection] = useState<SelectionInfo | undefined>();
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>();
  const [noteAnchor, setNoteAnchor] = useState<NoteAnchor | undefined>();
  const sceneRefs = useRef<Record<string, HTMLElement | null>>({});

  const sortedScenes = [...project.scenes].sort((a, b) => a.order - b.order);
  const scene = sortedScenes.find((candidate) => candidate.sceneId === selectedSceneId) ?? sortedScenes[0];
  const versions = data.versions.filter((version) => version.sceneId === scene?.sceneId).sort((a, b) => a.versionNumber - b.versionNumber);
  const current = versions.find((version) => version.versionId === scene?.currentVersionId) ?? versions.at(-1);
  const previous = versions.filter((version) => version.versionId !== current?.versionId).at(-1);
  const compareTarget = versions.find((version) => version.versionId === compareVersionId && version.versionId !== current?.versionId) ?? previous;
  const notes = data.notes.filter((note) => note.sceneId === scene?.sceneId && note.versionId === current?.versionId && !note.resolved);
  const highlights = data.highlights.filter((highlight) => highlight.sceneId === scene?.sceneId && highlight.versionId === current?.versionId);
  const activeNote = data.notes.find((note) => note.noteId === activeNoteId);

  const sceneVersion = (item: Scene) => data.versions.find((version) => version.versionId === item.currentVersionId);
  const sceneNotes = (item: Scene, version?: SceneVersion) =>
    data.notes.filter((note) => note.sceneId === item.sceneId && note.versionId === version?.versionId);
  const sceneHighlights = (item: Scene, version?: SceneVersion) =>
    data.highlights.filter((highlight) => highlight.sceneId === item.sceneId && highlight.versionId === version?.versionId);

  const updateScene = (nextScene: Scene) => {
    setData({
      ...data,
      projects: data.projects.map((candidate) =>
        candidate.projectId === project.projectId
          ? { ...candidate, scenes: candidate.scenes.map((item) => (item.sceneId === nextScene.sceneId ? nextScene : item)), updatedAt: nowIso() }
          : candidate,
      ),
    });
  };

  const captureSelection = (targetScene: Scene, targetVersion: SceneVersion) => {
    const selectedText = window.getSelection()?.toString() ?? "";
    if (!selectedText.trim()) {
      setSelection(undefined);
      return;
    }
    const rangeStart = targetVersion.text.indexOf(selectedText);
    if (rangeStart < 0) {
      setSelection(undefined);
      return;
    }
    setSelection({
      text: selectedText,
      sceneId: targetScene.sceneId,
      versionId: targetVersion.versionId,
      rangeStart,
      rangeEnd: rangeStart + selectedText.length,
    });
    setSelectedSceneId(targetScene.sceneId);
  };

  const openComposer = () => {
    if (!selection) return;
    setNoteDraft("");
    setComposerOpen(true);
  };

  const saveNote = () => {
    if (!selection) return;
    const targetScene = project.scenes.find((item) => item.sceneId === selection.sceneId);
    if (!targetScene) return;
    const noteId = createId("note");
    const createdAt = nowIso();
    const note: ReviewNote = {
      noteId,
      sceneId: selection.sceneId,
      versionId: selection.versionId,
      selectedText: selection.text,
      rangeStart: selection.rangeStart,
      rangeEnd: selection.rangeEnd,
      noteText: noteDraft,
      noteType: "Rewrite",
      priority: "Medium",
      resolved: false,
      createdAt,
      updatedAt: createdAt,
    };
    const taskExists = data.tasks.some((task) => task.sceneId === selection.sceneId && task.status === "Open");
    setData({
      ...data,
      notes: [...data.notes, note],
      highlights: [
        ...data.highlights,
        {
          highlightId: createId("highlight"),
          sceneId: selection.sceneId,
          versionId: selection.versionId,
          selectedText: selection.text,
          rangeStart: selection.rangeStart,
          rangeEnd: selection.rangeEnd,
          color: "#f8dc73",
          hasNote: true,
          noteId,
        },
      ],
      tasks: taskExists
        ? data.tasks
        : [
            ...data.tasks,
            {
              taskId: createId("task"),
              sceneId: selection.sceneId,
              sourceVersionId: selection.versionId,
              linkedNoteIds: [noteId],
              priority: "Medium",
              status: "Open" as const,
              createdAt,
            },
          ],
      projects: data.projects.map((candidate) =>
        candidate.projectId === project.projectId
          ? {
              ...candidate,
              updatedAt: createdAt,
              scenes: candidate.scenes.map((item) =>
                item.sceneId === targetScene.sceneId ? { ...item, status: "Needs Rewrite", updatedAt: createdAt } : item,
              ),
            }
          : candidate,
      ),
    });
    setComposerOpen(false);
    setSelection(undefined);
    setShowNotes(true);
  };

  const updateNote = (noteId: string, patch: Partial<ReviewNote>) => {
    setData({
      ...data,
      notes: data.notes.map((note) => (note.noteId === noteId ? { ...note, ...patch, updatedAt: nowIso() } : note)),
    });
  };

  const deleteNote = (noteId: string) => {
    setData({
      ...data,
      notes: data.notes.filter((note) => note.noteId !== noteId),
      highlights: data.highlights.filter((highlight) => highlight.noteId !== noteId),
      tasks: data.tasks.map((task) => ({
        ...task,
        linkedNoteIds: task.linkedNoteIds.filter((id) => id !== noteId),
      })),
    });
    setActiveNoteId(undefined);
    setNoteAnchor(undefined);
  };

  const openNote = (noteId: string, anchor?: NoteAnchor) => {
    if (anchor) {
      setNoteAnchor({
        x: Math.max(18, Math.min(anchor.x + 20, window.innerWidth - 390)),
        y: Math.max(92, Math.min(anchor.y - 18, window.innerHeight - 300)),
      });
    } else {
      setNoteAnchor(undefined);
    }
    setActiveNoteId(noteId);
  };

  const openAnchoredNote = (noteId: string) => {
    const target =
      document.querySelector<HTMLElement>(`[data-note-id="${noteId}"] .note-pin`) ??
      document.querySelector<HTMLElement>(`[data-note-id="${noteId}"]`);
    if (!target) {
      openNote(noteId);
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      openNote(noteId, { x: rect.right, y: rect.top + rect.height / 2 });
    }, 180);
  };

  const openScene = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    setShowScenes(false);
    setSelection(undefined);
    setActiveNoteId(undefined);
    setNoteAnchor(undefined);
    if (reviewView === "full") {
      window.setTimeout(() => sceneRefs.current[sceneId]?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  };

  const reorderScenes = (fromSceneId: string, toIndex: number) => {
    const ordered = [...sortedScenes];
    const fromIndex = ordered.findIndex((item) => item.sceneId === fromSceneId);
    if (fromIndex < 0) return;
    const [moving] = ordered.splice(fromIndex, 1);
    const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    ordered.splice(Math.max(0, Math.min(adjustedIndex, ordered.length)), 0, moving);
    const updatedScenes = ordered.map((item, index) => ({ ...item, order: index + 1, updatedAt: nowIso() }));
    setData({
      ...data,
      projects: data.projects.map((candidate) =>
        candidate.projectId === project.projectId
          ? { ...candidate, scenes: updatedScenes, updatedAt: nowIso() }
          : candidate,
      ),
    });
  };

  const sceneLabel = project.writingMode === "freewrite" ? "Chapter" : "Scene";
  const sceneLabelPlural = project.writingMode === "freewrite" ? "Chapters" : "Scenes";

  const renderSceneButton = (item: Scene, index: number) => {
    const version = data.versions.find((candidate) => candidate.versionId === item.currentVersionId);
    const noteCount = data.notes.filter((note) => note.sceneId === item.sceneId && !note.resolved).length;
    return (
      <Fragment key={item.sceneId}>
        {reordering && dropIndex === index && <div className="drop-line" />}
        <button
          className={`${scene && item.sceneId === scene.sceneId ? "selected" : ""} ${reordering ? "reorderable" : ""}`}
          draggable={reordering}
          onClick={() => openScene(item.sceneId)}
          onDragStart={() => setDragSceneId(item.sceneId)}
          onDragOver={(event) => {
            if (!reordering) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setDropIndex(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragSceneId !== undefined && dropIndex !== undefined) reorderScenes(dragSceneId, dropIndex);
            setDragSceneId(undefined);
            setDropIndex(undefined);
          }}
          onDragEnd={() => {
            setDragSceneId(undefined);
            setDropIndex(undefined);
          }}
        >
          {reordering && <span className="grab-handle" aria-hidden="true">::</span>}
          <strong>
            {project.writingMode === "script" ? (
              <>
                {item.heading}
                <span className="scene-number">#{item.order}</span>
              </>
            ) : (
              `Chapter ${item.order}: ${item.heading}`
            )}
          </strong>
          <small>{item.status} · V{version?.versionNumber ?? 1} · {noteCount} notes</small>
        </button>
        {reordering && dropIndex === sortedScenes.length && index === sortedScenes.length - 1 && <div className="drop-line" />}
      </Fragment>
    );
  };

  const renderReadOnlyScript = (
    item: Scene,
    version: SceneVersion,
    itemHighlights: Highlight[],
    itemNotes: ReviewNote[],
    label: string,
  ) => {
    if (project.writingMode !== "script") {
      return (
        <pre
          className="read-only-script"
          onMouseUp={() => captureSelection(item, version)}
          onKeyUp={() => captureSelection(item, version)}
          tabIndex={0}
          aria-label={label}
        >
          {applyAnnotations(version.text, itemHighlights, itemNotes, openNote)}
        </pre>
      );
    }

    const { heading, body, bodyOffset } = splitSceneText(version.text);
    return (
      <div
        className="read-only-script script-display"
        onMouseUp={() => captureSelection(item, version)}
        onKeyUp={() => captureSelection(item, version)}
        tabIndex={0}
        aria-label={label}
      >
        <div className="screenplay-heading-line">
          <span className="screenplay-scene-number">{item.order}</span>
          <span>{heading}</span>
        </div>
        {body && (
          <pre className="script-body-text">
            {applyAnnotations(body, itemHighlights, itemNotes, openNote, bodyOffset)}
          </pre>
        )}
      </div>
    );
  };

  return (
    <section className="mode-panel review-panel">
      {scene && current ? (
        <div className={`mode-workspace review-layout-shell ${scenePaneOpen ? "" : "scenes-collapsed"}`}>
          {scenePaneOpen ? (
            <aside className="review-scene-pane">
              <header>
                <strong>{sceneLabelPlural}</strong>
                <div className="scene-pane-actions">
                  <button
                    className={reordering ? "active" : ""}
                    onClick={() => setReordering((value) => !value)}
                  >
                    {reordering ? "Done" : "Reorder"}
                  </button>
                  <button onClick={() => setScenePaneOpen(false)}>Hide</button>
                </div>
              </header>
              <div className={`scene-drawer-list ${reordering ? "is-reordering" : ""}`}>{sortedScenes.map(renderSceneButton)}</div>
            </aside>
          ) : (
            <button className="open-scenes-rail" onClick={() => setScenePaneOpen(true)}>{sceneLabelPlural}</button>
          )}

          <div className={`review-stage ${reviewView === "scene" && compare && compareTarget ? "comparing" : ""}`}>
            {reviewView === "scene" ? (
              <>
                {compare && compareTarget && (
                  <article className="script-page compare-page">
                    <div className="script-page-meta">Compare · V{compareTarget.versionNumber}</div>
                    {renderReadOnlyScript(
                      scene,
                      compareTarget,
                      sceneHighlights(scene, compareTarget),
                      sceneNotes(scene, compareTarget),
                      "Compare script page",
                    )}
                  </article>
                )}

                <article className="script-page review-page">
                  {renderReadOnlyScript(scene, current, highlights, notes, "Read-only script page")}
                </article>
              </>
            ) : (
              <div className="full-script-stack">
                {project.scenes
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((item) => {
                    const version = sceneVersion(item);
                    if (!version) return null;
                    const itemNotes = sceneNotes(item, version);
                    const itemHighlights = sceneHighlights(item, version);
                    return (
                      <article
                        className="script-page full-script-page"
                        key={item.sceneId}
                        ref={(node) => {
                          sceneRefs.current[item.sceneId] = node;
                        }}
                      >
                        {renderReadOnlyScript(item, version, itemHighlights, itemNotes, `Read-only scene ${item.order}`)}
                      </article>
                    );
                  })}
              </div>
            )}
          </div>

          <aside className="mode-tools review-tools" aria-label="Review tools">
            <header className="mode-tools-header">
              <span>Review Tools</span>
              <strong>{sceneLabel} {scene.order} of {project.scenes.length}</strong>
            </header>

            <section className="tool-section">
              <h3>View</h3>
              <div className="segmented">
                <button className={reviewView === "scene" ? "active" : ""} onClick={() => setReviewView("scene")}>
                  Scene
                </button>
                <button className={reviewView === "full" ? "active" : ""} onClick={() => setReviewView("full")}>
                  Full Script
                </button>
              </div>
              {reviewView === "scene" && (
                <>
                  <label className="compact-check">
                    <input name="compare-versions" type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} />
                    Compare versions
                  </label>
                  {compare && versions.length > 1 && (
                    <label>
                      Version
                      <select
                        name="compare-version"
                        value={compareTarget?.versionId ?? ""}
                        onChange={(event) => setCompareVersionId(event.target.value)}
                      >
                        {versions
                          .filter((version) => version.versionId !== current.versionId)
                          .map((version) => (
                            <option key={version.versionId} value={version.versionId}>
                              Version {version.versionNumber}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="tool-button-row">
                <button className="mobile-scenes-button" onClick={() => setShowScenes(true)}>Open {sceneLabelPlural}</button>
              </div>
            </section>

            <section className="tool-section">
              <h3>{sceneLabel} Decision</h3>
              <div className="tool-button-row">
                <button className="approve-button" onClick={() => updateScene({ ...scene, status: "Approved", updatedAt: nowIso() })}>Approve</button>
                <button className="rewrite-button" onClick={() => updateScene({ ...scene, status: "Needs Rewrite", updatedAt: nowIso() })}>Needs Rewrite</button>
              </div>
            </section>

            <section className="tool-section">
              <h3>Mark</h3>
              <p className="tool-hint">{selection ? selection.text : "Select text on the page to mark it."}</p>
              <div className="tool-button-row">
                <button className="validate-button" onClick={openComposer} disabled={!selection}>Mark Selection</button>
              </div>
            </section>

            <section className="tool-section tool-list-section">
              <div className="tool-section-title-row">
                <h3>Notes</h3>
                <button onClick={() => setShowNotes((open) => !open)}>{showNotes ? "Hide" : "Show"}</button>
              </div>
              {showNotes ? (
                <div className="notes-drawer-list">
                  {notes.map((note) => (
                    <button key={note.noteId} className="note-drawer-card" onClick={() => openAnchoredNote(note.noteId)}>
                      <strong>Note</strong>
                      {note.selectedText && <span className="note-source-text">{note.selectedText}</span>}
                      <span>{note.noteText || note.selectedText || "Highlight only"}</span>
                    </button>
                  ))}
                  {notes.length === 0 && <p className="subtle-empty">No notes on this scene.</p>}
                </div>
              ) : (
                <p className="subtle-empty">Notes hidden.</p>
              )}
            </section>

            <ToolFontControls fontSettings={fontSettings} setFontSettings={setFontSettings} />

            <section className="tool-section">
              <h3>Undo / Redo</h3>
              <div className="icon-button-row">
                <button aria-label="Undo" title="Undo" onClick={onUndo} disabled={!canUndo}>↺</button>
                <button aria-label="Redo" title="Redo" onClick={onRedo} disabled={!canRedo}>↻</button>
              </div>
            </section>

            <footer className="tools-stats" aria-label="Project status">
              <span>{project.writingMode === "script" ? "Script project" : "Freewriting project"}</span>
              <span><span className="saved-dot" /> Saved</span>
              <span>{stats.words} words</span>
              <span>{stats.pages} page{stats.pages === 1 ? "" : "s"}</span>
            </footer>
          </aside>

          {composerOpen && (
            <div className="note-popover annotation-popover">
              <header>
                <strong>Mark</strong>
                <button onClick={() => setComposerOpen(false)} aria-label="Close note composer">Close</button>
              </header>
              <p>{selection?.text}</p>
              <textarea name="new-review-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a note for this mark..." />
              <button className="validate-button" onClick={saveNote}>Save Mark</button>
            </div>
          )}

          {activeNote && (
            <div
              className={`note-popover ${noteAnchor ? "anchored-note-popover" : ""}`}
              style={noteAnchor ? { left: `${noteAnchor.x}px`, top: `${noteAnchor.y}px` } : undefined}
            >
              <header>
                <strong>Note</strong>
                <button
                  onClick={() => {
                    setActiveNoteId(undefined);
                    setNoteAnchor(undefined);
                  }}
                  aria-label="Close note"
                >
                  Close
                </button>
              </header>
              {activeNote.selectedText && <p>{activeNote.selectedText}</p>}
              <textarea
                name="review-note"
                value={activeNote.noteText}
                onChange={(event) => updateNote(activeNote.noteId, { noteText: event.target.value })}
                placeholder="Highlight only"
              />
              <div className="note-actions">
                <button onClick={() => deleteNote(activeNote.noteId)}>Delete</button>
              </div>
            </div>
          )}

          {showScenes && (
            <div className="drawer-scrim" onClick={() => setShowScenes(false)}>
              <aside className="drawer left-drawer" onClick={(event) => event.stopPropagation()}>
                <header>
                  <strong>{sceneLabelPlural}</strong>
                  <div className="scene-pane-actions">
                    <button
                      className={reordering ? "active" : ""}
                      onClick={() => setReordering((value) => !value)}
                    >
                      {reordering ? "Done" : "Reorder"}
                    </button>
                    <button onClick={() => setShowScenes(false)}>Close</button>
                  </div>
                </header>
                <div className={`scene-drawer-list ${reordering ? "is-reordering" : ""}`}>{sortedScenes.map(renderSceneButton)}</div>
              </aside>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">Draft in Write mode to create scenes for review.</div>
      )}
    </section>
  );
}
