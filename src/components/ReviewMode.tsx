import { useRef, useState } from "react";
import type { AppData, Highlight, Project, ReviewNote, Scene, SceneVersion } from "../types";
import { createId, nowIso } from "../lib/ids";

interface ReviewModeProps {
  data: AppData;
  project: Project;
  setData: (next: AppData) => void;
}

interface SelectionInfo {
  text: string;
  sceneId: string;
  versionId: string;
  rangeStart: number;
  rangeEnd: number;
}

type ReviewView = "scene" | "full";

function annotationClass(annotation: Highlight | ReviewNote) {
  if ("color" in annotation && annotation.color === "underline") return "script-underline";
  if ("hasNote" in annotation && annotation.hasNote) return "script-highlight has-note";
  return "script-highlight";
}

function applyAnnotations(
  text: string,
  highlights: Highlight[],
  notes: ReviewNote[],
  onOpenNote: (noteId: string) => void,
) {
  const noteRanges = notes
    .filter((note) => !note.resolved && note.rangeEnd > note.rangeStart)
    .filter((note) => !highlights.some((highlight) => highlight.noteId === note.noteId));
  const annotations = [...highlights, ...noteRanges]
    .filter((item) => item.rangeEnd > item.rangeStart)
    .sort((a, b) => a.rangeStart - b.rangeStart);
  let cursor = 0;
  const parts: React.ReactNode[] = [];

  annotations.forEach((annotation) => {
    if (annotation.rangeStart < cursor) return;
    parts.push(text.slice(cursor, annotation.rangeStart));
    const noteId = "noteId" in annotation ? annotation.noteId : annotation.noteId;
    parts.push(
      <mark
        className={annotationClass(annotation)}
        key={`${annotation.rangeStart}-${annotation.rangeEnd}-${noteId ?? annotation.selectedText}`}
        onClick={() => noteId && onOpenNote(noteId)}
      >
        {text.slice(annotation.rangeStart, annotation.rangeEnd)}
      </mark>,
    );
    cursor = annotation.rangeEnd;
  });

  parts.push(text.slice(cursor));
  return parts;
}

export function ReviewMode({ data, project, setData }: ReviewModeProps) {
  const [selectedSceneId, setSelectedSceneId] = useState(project.scenes[0]?.sceneId);
  const [reviewView, setReviewView] = useState<ReviewView>("scene");
  const [compare, setCompare] = useState(false);
  const [scenePaneOpen, setScenePaneOpen] = useState(true);
  const [showScenes, setShowScenes] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [selection, setSelection] = useState<SelectionInfo | undefined>();
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>();
  const sceneRefs = useRef<Record<string, HTMLElement | null>>({});

  const scene = project.scenes.find((candidate) => candidate.sceneId === selectedSceneId) ?? project.scenes[0];
  const versions = data.versions.filter((version) => version.sceneId === scene?.sceneId).sort((a, b) => a.versionNumber - b.versionNumber);
  const current = versions.find((version) => version.versionId === scene?.currentVersionId) ?? versions.at(-1);
  const previous = versions.filter((version) => version.versionId !== current?.versionId).at(-1);
  const notes = data.notes.filter((note) => note.sceneId === scene?.sceneId && note.versionId === current?.versionId);
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

  const createHighlight = (color = "#f8dc73") => {
    if (!selection) return;
    setData({
      ...data,
      highlights: [
        ...data.highlights,
        {
          highlightId: createId("highlight"),
          sceneId: selection.sceneId,
          versionId: selection.versionId,
          selectedText: selection.text,
          rangeStart: selection.rangeStart,
          rangeEnd: selection.rangeEnd,
          color,
          hasNote: false,
        },
      ],
    });
    setSelection(undefined);
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
  };

  const openScene = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    setShowScenes(false);
    setSelection(undefined);
    setActiveNoteId(undefined);
    if (reviewView === "full") {
      window.setTimeout(() => sceneRefs.current[sceneId]?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  };

  const renderSceneButton = (item: Scene) => {
    const version = data.versions.find((candidate) => candidate.versionId === item.currentVersionId);
    const noteCount = data.notes.filter((note) => note.sceneId === item.sceneId && !note.resolved).length;
    return (
      <button key={item.sceneId} className={scene && item.sceneId === scene.sceneId ? "selected" : ""} onClick={() => openScene(item.sceneId)}>
        <span>{item.order}</span>
        <strong>{item.heading}</strong>
        <small>{item.status} · V{version?.versionNumber ?? 1} · {noteCount} notes</small>
      </button>
    );
  };

  return (
    <section className="mode-panel review-panel">
      {scene && current ? (
        <div className={`mode-workspace review-layout-shell ${scenePaneOpen ? "" : "scenes-collapsed"}`}>
          {scenePaneOpen ? (
            <aside className="review-scene-pane">
              <header>
                <strong>Scenes</strong>
                <button onClick={() => setScenePaneOpen(false)}>Hide</button>
              </header>
              <div className="scene-drawer-list">{project.scenes.map(renderSceneButton)}</div>
            </aside>
          ) : (
            <button className="open-scenes-rail" onClick={() => setScenePaneOpen(true)}>Scenes</button>
          )}

          <div className={`review-stage ${reviewView === "scene" && compare && previous ? "comparing" : ""}`}>
            {reviewView === "scene" ? (
              <>
                {compare && previous && (
                  <article className="script-page compare-page">
                    <div className="script-page-meta">Previous · V{previous.versionNumber}</div>
                    <pre>{previous.text}</pre>
                  </article>
                )}

                <article className="script-page review-page">
                  <pre
                    className="read-only-script"
                    onMouseUp={() => captureSelection(scene, current)}
                    onKeyUp={() => captureSelection(scene, current)}
                    tabIndex={0}
                    aria-label="Read-only script page"
                  >
                    {applyAnnotations(current.text, highlights, notes, setActiveNoteId)}
                  </pre>
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
                        <div className="review-page-toolbar review-actions-only">
                          <span>Scene {item.order}</span>
                        </div>
                        <pre
                          className="read-only-script"
                          onMouseUp={() => captureSelection(item, version)}
                          onKeyUp={() => captureSelection(item, version)}
                          tabIndex={0}
                          aria-label={`Read-only scene ${item.order}`}
                        >
                          {applyAnnotations(version.text, itemHighlights, itemNotes, setActiveNoteId)}
                        </pre>
                      </article>
                    );
                  })}
              </div>
            )}
          </div>

          <aside className="mode-tools review-tools" aria-label="Review tools">
            <header className="mode-tools-header">
              <span>Review Tools</span>
              <strong>Scene {scene.order} of {project.scenes.length}</strong>
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
                <label className="compact-check">
                  <input name="compare-versions" type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} />
                  Compare versions
                </label>
              )}
              <div className="tool-button-row">
                <button onClick={() => setScenePaneOpen((open) => !open)}>{scenePaneOpen ? "Hide Scenes" : "Show Scenes"}</button>
                <button className="mobile-scenes-button" onClick={() => setShowScenes(true)}>Open Scenes</button>
                <button className={showNotes ? "active" : ""} onClick={() => setShowNotes((open) => !open)}>Notes</button>
              </div>
            </section>

            <section className="tool-section">
              <h3>Scene Decision</h3>
              <div className="tool-button-row">
                <button className="approve-button" onClick={() => updateScene({ ...scene, status: "Approved", updatedAt: nowIso() })}>Approve</button>
                <button className="rewrite-button" onClick={() => updateScene({ ...scene, status: "Needs Rewrite", updatedAt: nowIso() })}>Needs Rewrite</button>
              </div>
            </section>

            <section className="tool-section">
              <h3>Annotation</h3>
              <p className="tool-hint">{selection ? selection.text : "Select text on the page to mark it."}</p>
              <div className="tool-button-row">
                <button onClick={() => createHighlight()} disabled={!selection}>Highlight</button>
                <button onClick={() => createHighlight("underline")} disabled={!selection}>Underline</button>
                <button onClick={openComposer} disabled={!selection}>Note</button>
              </div>
            </section>

            {showNotes && (
              <section className="tool-section tool-list-section">
                <h3>Notes</h3>
                <div className="notes-drawer-list">
                  {notes.map((note) => (
                    <button key={note.noteId} className="note-drawer-card" onClick={() => setActiveNoteId(note.noteId)}>
                      <strong>Note</strong>
                      <span>{note.noteText || note.selectedText || "Highlight only"}</span>
                    </button>
                  ))}
                  {notes.length === 0 && <p className="subtle-empty">No notes on this scene.</p>}
                </div>
              </section>
            )}
          </aside>

          {composerOpen && (
            <div className="note-popover annotation-popover">
              <header>
                <strong>Note</strong>
                <button onClick={() => setComposerOpen(false)} aria-label="Close note composer">Close</button>
              </header>
              <p>{selection?.text}</p>
              <textarea name="new-review-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a note..." />
              <button className="primary" onClick={saveNote}>Save Note</button>
            </div>
          )}

          {activeNote && (
            <div className="note-popover">
              <header>
                <strong>Note</strong>
                <button onClick={() => setActiveNoteId(undefined)} aria-label="Close note">Close</button>
              </header>
              {activeNote.selectedText && <p>{activeNote.selectedText}</p>}
              <textarea
                name="review-note"
                value={activeNote.noteText}
                onChange={(event) => updateNote(activeNote.noteId, { noteText: event.target.value })}
                placeholder="Highlight only"
              />
              <div className="note-actions">
                <button onClick={() => updateNote(activeNote.noteId, { resolved: true })}>Resolve</button>
                <button onClick={() => deleteNote(activeNote.noteId)}>Delete</button>
              </div>
            </div>
          )}

          {showScenes && (
            <div className="drawer-scrim" onClick={() => setShowScenes(false)}>
              <aside className="drawer left-drawer" onClick={(event) => event.stopPropagation()}>
                <header>
                  <strong>Scenes</strong>
                  <button onClick={() => setShowScenes(false)}>Close</button>
                </header>
                <div className="scene-drawer-list">{project.scenes.map(renderSceneButton)}</div>
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
