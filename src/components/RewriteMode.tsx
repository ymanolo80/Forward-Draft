import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ToolFontControls } from "./ToolFontControls";
import type { AppData, FontSettings, Project, ReviewNote, Scene } from "../types";
import { createId, nowIso } from "../lib/ids";

const SCENE_LIST_TOGGLE_EVENT = "forwarddraft:toggle-scene-list";

interface RewriteModeProps {
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

type DisplayMode = "single" | "all";

function highlightText(text: string, notes: ReviewNote[]) {
  let cursor = 0;
  const parts: React.ReactNode[] = [];
  notes
    .filter((note) => !note.resolved && note.selectedText)
    .sort((a, b) => a.rangeStart - b.rangeStart)
    .forEach((note) => {
      parts.push(text.slice(cursor, note.rangeStart));
      parts.push(
        <mark className="rewrite-highlight" data-rewrite-note-id={note.noteId} key={note.noteId}>
          {text.slice(note.rangeStart, note.rangeEnd)}
        </mark>,
      );
      cursor = note.rangeEnd;
    });
  parts.push(text.slice(cursor));
  return parts;
}

function RewriteSource({ text, notes, showNotes }: { text: string; notes: ReviewNote[]; showNotes: boolean }) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{
    cardTops: Record<string, number>;
    connectors: { noteId: string; path: string }[];
    railHeight: number;
  }>({ cardTops: {}, connectors: [], railHeight: 0 });
  const visibleNotes = useMemo(
    () => notes.filter((note) => !note.resolved && note.selectedText).sort((a, b) => a.rangeStart - b.rangeStart),
    [notes],
  );

  useLayoutEffect(() => {
    const source = sourceRef.current;
    if (!source) return undefined;
    if (!showNotes) {
      setLayout({ cardTops: {}, connectors: [], railHeight: 0 });
      return undefined;
    }

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const sourceRect = source.getBoundingClientRect();
        const rail = source.querySelector<HTMLElement>(".rewrite-note-rail");
        const script = source.querySelector<HTMLElement>("pre");
        if (!rail || !script) return;

        let lastBottom = 0;
        const cardTops: Record<string, number> = {};
        const next = visibleNotes.flatMap((note) => {
          const highlight = source.querySelector<HTMLElement>(`[data-rewrite-note-id="${note.noteId}"]`);
          const card = source.querySelector<HTMLElement>(`[data-rewrite-note-card="${note.noteId}"]`);
          if (!highlight || !card) return [];

          const highlightRect = highlight.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          const railRect = rail.getBoundingClientRect();
          const cardHeight = cardRect.height;
          const highlightY = highlightRect.top + highlightRect.height / 2 - sourceRect.top;
          const proposedTop = Math.max(0, highlightY - (railRect.top - sourceRect.top) - cardHeight / 2);
          const top = Math.max(proposedTop, lastBottom);
          lastBottom = top + cardHeight + 8;
          cardTops[note.noteId] = top;

          const x1 = highlightRect.right - sourceRect.left + 4;
          const y1 = highlightY;
          const x2 = railRect.left - sourceRect.left - 8;
          const y2 = railRect.top - sourceRect.top + top + cardHeight / 2;
          const curve = Math.max(22, Math.abs(x2 - x1) * 0.42);
          return [
            {
              noteId: note.noteId,
              path: `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`,
            },
          ];
        });
        const railHeight = Math.max(script.getBoundingClientRect().height, lastBottom);
        setLayout({ cardTops, connectors: next, railHeight });
      });
    };

    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    observer?.observe(source);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [showNotes, text, visibleNotes]);

  return (
    <div className={`rewrite-source rewrite-source-connected ${showNotes ? "" : "notes-hidden"}`} ref={sourceRef}>
      <pre>{highlightText(text, visibleNotes)}</pre>
      {showNotes && (
        <>
          <svg className="rewrite-connectors" aria-hidden="true">
            {layout.connectors.map((connector) => (
              <path d={connector.path} key={connector.noteId} />
            ))}
          </svg>
          <aside className="rewrite-note-rail" style={layout.railHeight ? { minHeight: layout.railHeight } : undefined}>
            {visibleNotes.map((note) => (
              <div
                className="note rewrite-note-card"
                data-rewrite-note-card={note.noteId}
                key={note.noteId}
                style={layout.cardTops[note.noteId] !== undefined ? { top: layout.cardTops[note.noteId] } : undefined}
              >
                <strong>Note</strong>
                <p>{note.noteText || "Highlight only"}</p>
              </div>
            ))}
          </aside>
        </>
      )}
    </div>
  );
}

export function RewriteMode({
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
}: RewriteModeProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("single");
  const [showReviewedScene, setShowReviewedScene] = useState(true);
  const [showReviewedNotes, setShowReviewedNotes] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [queueOpen, setQueueOpen] = useState(() => !window.matchMedia("(max-width: 720px)").matches);
  const [selectedSceneId, setSelectedSceneId] = useState(project.scenes[0]?.sceneId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const syncQueue = () => {
      if (media.matches) setQueueOpen(false);
    };
    syncQueue();
    media.addEventListener("change", syncQueue);
    return () => media.removeEventListener("change", syncQueue);
  }, []);

  useEffect(() => {
    const onToggleSceneList = () => {
      if (window.matchMedia("(max-width: 1180px)").matches) {
        setQueueOpen(true);
        return;
      }
      setQueueOpen((open) => !open);
    };
    window.addEventListener(SCENE_LIST_TOGGLE_EVENT, onToggleSceneList);
    return () => window.removeEventListener(SCENE_LIST_TOGGLE_EVENT, onToggleSceneList);
  }, []);

  const queue = useMemo(() => {
    const openTasks = data.tasks.filter((task) => task.status === "Open");
    return project.scenes
      .map((scene) => {
        const notes = data.notes.filter((note) => note.sceneId === scene.sceneId && !note.resolved);
        const task = openTasks.find((candidate) => candidate.sceneId === scene.sceneId);
        const shouldInclude =
          scene.status === "Needs Rewrite" ||
          notes.length > 0 ||
          task !== undefined;
        if (!shouldInclude) return undefined;
        return {
          scene,
          task,
          notes,
          version: data.versions.find((version) => version.versionId === scene.currentVersionId),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (!a || !b) return 0;
        return a.scene.order - b.scene.order;
      });
  }, [data.notes, data.tasks, data.versions, project.scenes]);

  const selected = queue.find((item) => item?.scene.sceneId === selectedSceneId) ?? queue[0];
  const sectionLabel = project.writingMode === "freewrite" ? "Chapter" : "Scene";
  const selectedDraftText = selected ? drafts[selected.scene.sceneId] ?? selected.version?.text ?? "" : "";

  const markDone = (scene: Scene, text: string) => {
    const oldVersion = data.versions.find((version) => version.versionId === scene.currentVersionId);
    const sceneVersions = data.versions.filter((version) => version.sceneId === scene.sceneId);
    const versionId = createId("version");
    const createdAt = nowIso();
    const newVersion = {
      versionId,
      sceneId: scene.sceneId,
      versionNumber: Math.max(...sceneVersions.map((version) => version.versionNumber), 0) + 1,
      text,
      createdAt,
      isCurrent: true,
      basedOnVersionId: oldVersion?.versionId,
      changeSummary: "Rewrite pass completed",
    };
    setData({
      ...data,
      versions: [...data.versions.map((version) => (version.sceneId === scene.sceneId ? { ...version, isCurrent: false } : version)), newVersion],
      notes: data.notes.map((note) => (note.sceneId === scene.sceneId ? { ...note, resolved: true, updatedAt: createdAt } : note)),
      tasks: data.tasks.map((task) => (task.sceneId === scene.sceneId ? { ...task, status: "Done", completedAt: createdAt } : task)),
      projects: data.projects.map((candidate) =>
        candidate.projectId === project.projectId
          ? {
              ...candidate,
              updatedAt: createdAt,
              scenes: candidate.scenes.map((item) =>
                item.sceneId === scene.sceneId
                  ? { ...item, currentVersionId: versionId, status: "Rewritten", updatedAt: createdAt }
                  : item,
              ),
            }
          : candidate,
      ),
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[scene.sceneId];
      return next;
    });
  };

  const jumpTo = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    refs.current[sceneId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderRewriteScene = (item: NonNullable<(typeof queue)[number]>, compact = false) => {
    const { scene, version, notes } = item;
    const text = drafts[scene.sceneId] ?? version?.text ?? "";
    const previous = project.scenes.find((candidate) => candidate.order === scene.order - 1);
    const next = project.scenes.find((candidate) => candidate.order === scene.order + 1);
    const previousVersion = previous ? data.versions.find((candidate) => candidate.versionId === previous.currentVersionId) : undefined;
    const nextVersion = next ? data.versions.find((candidate) => candidate.versionId === next.currentVersionId) : undefined;

    return (
      <article
        className={`rewrite-card ${scene.sceneId === selected?.scene.sceneId ? "active-rewrite-card" : ""}`}
        key={scene.sceneId}
        onClick={() => setSelectedSceneId(scene.sceneId)}
        onFocus={() => setSelectedSceneId(scene.sceneId)}
        ref={(node) => {
          refs.current[scene.sceneId] = node;
        }}
      >
        <header>
          {project.writingMode === "script" ? (
            <div className="rewrite-heading-line">
              <span className="screenplay-scene-number">{scene.order}</span>
              <h3>{scene.heading}</h3>
            </div>
          ) : (
            <div>
              <p className="eyebrow">Chapter {scene.order}</p>
              <h3>{scene.heading}</h3>
            </div>
          )}
          <div className="labels">
            <span>{scene.status}</span>
            <span>V{version?.versionNumber ?? 1}</span>
            <span>{notes.length} notes</span>
          </div>
        </header>
        {showContext && previousVersion && !compact && (
          <aside className="context-scene-block previous-context">
            <strong>Previous {sectionLabel}</strong>
            <pre>{previousVersion.text}</pre>
          </aside>
        )}
        {showReviewedScene && (
          <RewriteSource text={version?.text ?? ""} notes={notes} showNotes={showReviewedNotes} />
        )}
        <textarea
          className="rewrite-editor"
          name={`rewrite-${scene.sceneId}`}
          value={text}
          onChange={(event) => setDrafts({ ...drafts, [scene.sceneId]: event.target.value })}
          spellCheck
        />
        {showContext && nextVersion && !compact && (
          <aside className="context-scene-block next-context">
            <strong>Next {sectionLabel}</strong>
            <pre>{nextVersion.text}</pre>
          </aside>
        )}
      </article>
    );
  };

  return (
    <section className="mode-panel rewrite-panel">
      <div className={`mode-workspace rewrite-layout ${queueOpen ? "" : "queue-collapsed"}`}>
        {queueOpen ? (
          <aside className="rewrite-queue">
            <header>
              <strong>{sectionLabel}s List</strong>
            </header>
            {queue.map((item) => {
              if (!item) return null;
              const selectedClass = item.scene.sceneId === selected?.scene.sceneId ? "selected" : "";
              return (
                <button key={item.scene.sceneId} className={selectedClass} onClick={() => jumpTo(item.scene.sceneId)}>
                  <strong className="scene-list-title">
                    <span className="scene-number">{item.scene.order}</span>
                    <span className="scene-list-heading">{item.scene.heading}</span>
                  </strong>
                  <small>
                    {item.scene.status} · V{item.version?.versionNumber ?? 1} · {item.notes.length} notes
                  </small>
                </button>
              );
            })}
          </aside>
        ) : null}
        <main className="rewrite-main">
          {queue.length === 0 && <div className="empty-state">No rewrite {sectionLabel.toLowerCase()}s in the scenes list.</div>}
          {displayMode === "single" && selected && (
            renderRewriteScene(selected)
          )}
          {displayMode === "all" && queue.map((item) => item && renderRewriteScene(item, true))}
        </main>

        <aside className="mode-tools rewrite-tools" aria-label="Rewrite tools">
          <header className="mode-tools-header">
            <span>Rewrite Tools</span>
            <strong>{queue.length} {sectionLabel.toLowerCase()}{queue.length === 1 ? "" : "s"} listed</strong>
          </header>

          <section className="tool-section">
            <h3>Workspace</h3>
            <div className="segmented">
              <button className={displayMode === "single" ? "active" : ""} onClick={() => setDisplayMode("single")}>
                Single {sectionLabel}
              </button>
              <button className={displayMode === "all" ? "active" : ""} onClick={() => setDisplayMode("all")}>
                All {sectionLabel}s
              </button>
            </div>
            <label className="compact-check">
              <input
                name="rewrite-reviewed-scene"
                type="checkbox"
                checked={showReviewedScene}
                onChange={(event) => setShowReviewedScene(event.target.checked)}
              />
              Reviewed scene
            </label>
            <label className="compact-check">
              <input
                name="rewrite-reviewed-notes"
                type="checkbox"
                checked={showReviewedNotes}
                disabled={!showReviewedScene}
                onChange={(event) => setShowReviewedNotes(event.target.checked)}
              />
              Notes in reviewed scene
            </label>
            <label className="compact-check">
              <input name="rewrite-context" type="checkbox" checked={showContext} onChange={(event) => setShowContext(event.target.checked)} />
              Previous/next {sectionLabel.toLowerCase()}
            </label>
          </section>

          {selected && (
            <section className="tool-section">
              <h3>Selected {sectionLabel}</h3>
              <div className="tool-summary">
                {project.writingMode === "script" ? (
                  <div className="tool-selected-heading">
                    <span className="screenplay-scene-number">{selected.scene.order}</span>
                    <strong>{selected.scene.heading}</strong>
                  </div>
                ) : (
                  <strong>Chapter {selected.scene.order}: {selected.scene.heading}</strong>
                )}
                <span>{sectionLabel} {selected.scene.order} · {selected.scene.status}</span>
                <span>{selected.notes.length} open note{selected.notes.length === 1 ? "" : "s"}</span>
              </div>
              <button className="validate-button" onClick={() => markDone(selected.scene, selectedDraftText)}>
                Mark Rewrite Done
              </button>
            </section>
          )}

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
      </div>
    </section>
  );
}
