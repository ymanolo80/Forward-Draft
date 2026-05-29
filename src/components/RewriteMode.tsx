import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, Project, ReviewNote, Scene } from "../types";
import { createId, nowIso } from "../lib/ids";

interface RewriteModeProps {
  data: AppData;
  project: Project;
  setData: (next: AppData) => void;
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
      parts.push(<mark key={note.noteId}>{text.slice(note.rangeStart, note.rangeEnd)}</mark>);
      cursor = note.rangeEnd;
    });
  parts.push(text.slice(cursor));
  return parts;
}

export function RewriteMode({ data, project, setData }: RewriteModeProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("single");
  const [showNotes, setShowNotes] = useState(true);
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
        className="rewrite-card"
        key={scene.sceneId}
        ref={(node) => {
          refs.current[scene.sceneId] = node;
        }}
      >
        <header>
          <div>
            <p className="eyebrow">
              Scene {scene.order}
            </p>
            <h3>{scene.heading}</h3>
          </div>
          <div className="labels">
            <span>{scene.status}</span>
            <span>V{version?.versionNumber ?? 1}</span>
            <span>{notes.length} notes</span>
          </div>
        </header>
        {showContext && previousVersion && !compact && (
          <aside className="context-scene-block previous-context">
            <strong>Previous Scene</strong>
            <pre>{previousVersion.text}</pre>
          </aside>
        )}
        {showNotes && (
          <div className="rewrite-source">
            <pre>{highlightText(version?.text ?? "", notes)}</pre>
            <aside>
              {notes.map((note) => (
                <div className="note" key={note.noteId}>
                  <strong>Note</strong>
                  <p>{note.noteText || note.selectedText || "Highlight only"}</p>
                </div>
              ))}
            </aside>
          </div>
        )}
        <textarea
          className="rewrite-editor"
          name={`rewrite-${scene.sceneId}`}
          value={text}
          onChange={(event) => setDrafts({ ...drafts, [scene.sceneId]: event.target.value })}
          spellCheck
        />
        <button className="primary" onClick={() => markDone(scene, text)}>
          Mark Rewrite Done
        </button>
        {showContext && nextVersion && !compact && (
          <aside className="context-scene-block next-context">
            <strong>Next Scene</strong>
            <pre>{nextVersion.text}</pre>
          </aside>
        )}
      </article>
    );
  };

  return (
    <section className="mode-panel rewrite-panel">
      <div className={`mode-workspace rewrite-layout ${queueOpen ? "" : "queue-collapsed"}`}>
        {queueOpen && (
          <aside className="rewrite-queue">
            {queue.map((item) => {
              if (!item) return null;
              const selectedClass = item.scene.sceneId === selected?.scene.sceneId ? "selected" : "";
              return (
                <button key={item.scene.sceneId} className={selectedClass} onClick={() => jumpTo(item.scene.sceneId)}>
                  <strong>Scene {item.scene.order}</strong>
                  <span>{item.scene.heading}</span>
                  <small>
                    {item.scene.status} · V{item.version?.versionNumber ?? 1} · {item.notes.length} notes
                  </small>
                </button>
              );
            })}
          </aside>
        )}
        <main className="rewrite-main">
          {queue.length === 0 && <div className="empty-state">No rewrite scenes in the queue.</div>}
          {displayMode === "single" && selected && (
            renderRewriteScene(selected)
          )}
          {displayMode === "all" && queue.map((item) => item && renderRewriteScene(item, true))}
        </main>

        <aside className="mode-tools rewrite-tools" aria-label="Rewrite tools">
          <header className="mode-tools-header">
            <span>Rewrite Tools</span>
            <strong>{queue.length} scene{queue.length === 1 ? "" : "s"} in queue</strong>
          </header>

          <section className="tool-section">
            <h3>Queue</h3>
            <button className="tool-wide-button" onClick={() => setQueueOpen((open) => !open)}>{queueOpen ? "Hide Queue" : "Show Queue"}</button>
          </section>

          <section className="tool-section">
            <h3>Workspace</h3>
            <div className="segmented">
              <button className={displayMode === "single" ? "active" : ""} onClick={() => setDisplayMode("single")}>
                Single Scene
              </button>
              <button className={displayMode === "all" ? "active" : ""} onClick={() => setDisplayMode("all")}>
                All Scenes
              </button>
            </div>
            <label className="compact-check">
              <input name="rewrite-notes" type="checkbox" checked={showNotes} onChange={(event) => setShowNotes(event.target.checked)} />
              Notes
            </label>
            <label className="compact-check">
              <input name="rewrite-context" type="checkbox" checked={showContext} onChange={(event) => setShowContext(event.target.checked)} />
              Previous/next scene
            </label>
          </section>

          {selected && (
            <section className="tool-section">
              <h3>Selected Scene</h3>
              <div className="tool-summary">
                <strong>{selected.scene.heading}</strong>
                <span>Scene {selected.scene.order} · {selected.scene.status}</span>
                <span>{selected.notes.length} open note{selected.notes.length === 1 ? "" : "s"}</span>
              </div>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
