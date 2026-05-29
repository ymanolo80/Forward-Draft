import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReviewMode } from "./components/ReviewMode";
import { RewriteMode } from "./components/RewriteMode";
import { WriteMode } from "./components/WriteMode";
import { exportChangesPdf, exportFountainFile, exportFullPdf, exportProjectBackup, exportText } from "./lib/exports";
import { createId, nowIso } from "./lib/ids";
import { createProject } from "./lib/seed";
import { emptyData, loadData, saveData } from "./lib/storage";
import type { AppData, AppMode, FadeTiming, Project, VisibilityRule, WritingMode } from "./types";

function projectText(project: Project | undefined, data: AppData) {
  if (!project) return "";
  const versionText = [...project.scenes]
    .sort((a, b) => a.order - b.order)
    .map((scene) => data.versions.find((version) => version.versionId === scene.currentVersionId)?.text ?? "")
    .join("\n\n")
    .trim();
  if (versionText) return versionText;
  return project.drafts.map((block) => block.text).join("\n");
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function App() {
  const [data, setDataState] = useState<AppData>(emptyData);
  const [mode, setMode] = useState<AppMode>("write");
  const [loaded, setLoaded] = useState(false);
  const [undoStack, setUndoStack] = useState<AppData[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityRule>("last3");
  const [fadeTiming, setFadeTiming] = useState<FadeTiming>("3s");
  const optionsRef = useRef<HTMLDetailsElement>(null);

  const activeProject = useMemo(
    () => data.projects.find((project) => project.projectId === data.activeProjectId) ?? data.projects[0],
    [data.activeProjectId, data.projects],
  );

  useEffect(() => {
    loadData()
      .then((stored) => {
        if (stored.projects.length) setDataState(stored);
        else setDataState(createProject("Forward Draft Sample"));
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [mode, data.activeProjectId]);

  useEffect(() => {
    if (!activeProject) return;
    if (activeProject.writingMode === "script" && visibility === "previousBlock") setVisibility("previousScene");
    if (activeProject.writingMode === "freewrite" && visibility === "previousScene") setVisibility("previousBlock");
  }, [activeProject, visibility]);

  const setData = useCallback((next: AppData) => {
    setUndoStack((history) => [...history, data].slice(-50));
    setDataState(next);
    saveData(next).catch((error) => console.error("Autosave failed", error));
  }, [data]);

  const undoLast = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((history) => history.slice(0, -1));
    setDataState(previous);
    saveData(previous).catch((error) => console.error("Autosave failed", error));
  }, [undoStack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((!event.metaKey && !event.ctrlKey) || (key !== "z" && key !== "x")) return;
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isEditable) return;
      event.preventDefault();
      undoLast();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoLast]);

  useEffect(() => {
    if (!optionsOpen) return;
    const onPointerMove = (event: PointerEvent) => {
      const menu = optionsRef.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target)) setOptionsOpen(false);
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [optionsOpen]);

  if (!loaded) return <div className="loading">Opening Forward Draft...</div>;

  const text = projectText(activeProject, data);
  const words = wordCount(text);
  const pages = Math.max(1, Math.ceil(words / 250));

  const createNew = (writingMode: WritingMode = "script") => {
    const created = createProject("New Forward Draft");
    const projects = created.projects.map((project) => ({ ...project, writingMode }));
    setData({
      ...data,
      projects: [...data.projects, ...projects],
      versions: [...data.versions, ...created.versions],
      notes: [...data.notes, ...created.notes],
      highlights: [...data.highlights, ...created.highlights],
      tasks: [...data.tasks, ...created.tasks],
      activeProjectId: created.activeProjectId,
    });
  };

  const rename = () => {
    if (!activeProject) return;
    const title = prompt("Project title", activeProject.title)?.trim();
    if (!title) return;
    setData({
      ...data,
      projects: data.projects.map((project) =>
        project.projectId === activeProject.projectId ? { ...project, title, updatedAt: nowIso() } : project,
      ),
    });
  };

  const duplicate = () => {
    if (!activeProject) return;
    const projectId = createId("project");
    const sceneIdMap = new Map<string, string>();
    const versionIdMap = new Map<string, string>();
    const noteIdMap = new Map<string, string>();
    const scenes = activeProject.scenes.map((scene) => {
      const sceneId = createId("scene");
      sceneIdMap.set(scene.sceneId, sceneId);
      return { ...scene, sceneId, projectId };
    });
    const versions = data.versions
      .filter((version) => sceneIdMap.has(version.sceneId))
      .map((version) => {
        const versionId = createId("version");
        versionIdMap.set(version.versionId, versionId);
        return { ...version, versionId, sceneId: sceneIdMap.get(version.sceneId)! };
      });
    const notes = data.notes
      .filter((note) => sceneIdMap.has(note.sceneId))
      .map((note) => {
        const noteId = createId("note");
        noteIdMap.set(note.noteId, noteId);
        return {
          ...note,
          noteId,
          sceneId: sceneIdMap.get(note.sceneId)!,
          versionId: versionIdMap.get(note.versionId) ?? note.versionId,
        };
      });
    const highlights = data.highlights
      .filter((highlight) => sceneIdMap.has(highlight.sceneId))
      .map((highlight) => ({
        ...highlight,
        highlightId: createId("highlight"),
        sceneId: sceneIdMap.get(highlight.sceneId)!,
        versionId: versionIdMap.get(highlight.versionId) ?? highlight.versionId,
        noteId: highlight.noteId ? noteIdMap.get(highlight.noteId) : undefined,
      }));
    const tasks = data.tasks
      .filter((task) => sceneIdMap.has(task.sceneId))
      .map((task) => ({
        ...task,
        taskId: createId("task"),
        sceneId: sceneIdMap.get(task.sceneId)!,
        sourceVersionId: versionIdMap.get(task.sourceVersionId) ?? task.sourceVersionId,
        linkedNoteIds: task.linkedNoteIds.map((id) => noteIdMap.get(id) ?? id),
      }));
    const createdAt = nowIso();
    const project = {
      ...activeProject,
      projectId,
      title: `${activeProject.title} Copy`,
      scenes: scenes.map((scene) => ({
        ...scene,
        currentVersionId: versionIdMap.get(scene.currentVersionId) ?? scene.currentVersionId,
      })),
      createdAt,
      updatedAt: createdAt,
    };
    setData({
      ...data,
      projects: [...data.projects, project],
      versions: [...data.versions, ...versions],
      notes: [...data.notes, ...notes],
      highlights: [...data.highlights, ...highlights],
      tasks: [...data.tasks, ...tasks],
      activeProjectId: projectId,
    });
  };

  const deleteActive = () => {
    if (!activeProject || !confirm(`Delete "${activeProject.title}"?`)) return;
    const sceneIds = new Set(activeProject.scenes.map((scene) => scene.sceneId));
    const projects = data.projects.filter((project) => project.projectId !== activeProject.projectId);
    setData({
      projects,
      versions: data.versions.filter((version) => !sceneIds.has(version.sceneId)),
      notes: data.notes.filter((note) => !sceneIds.has(note.sceneId)),
      highlights: data.highlights.filter((highlight) => !sceneIds.has(highlight.sceneId)),
      tasks: data.tasks.filter((task) => !sceneIds.has(task.sceneId)),
      activeProjectId: projects[0]?.projectId,
    });
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    const backup = JSON.parse(await file.text());
    setData({
      projects: [...data.projects, backup.project],
      versions: [...data.versions, ...backup.versions],
      notes: [...data.notes, ...backup.notes],
      highlights: [...data.highlights, ...backup.highlights],
      tasks: [...data.tasks, ...backup.tasks],
      activeProjectId: backup.project.projectId,
    });
  };

  return (
    <div className={`app mode-${mode}`}>
      <header className="global-topbar">
        <div className="topbar-project">
          <strong>Forward Draft</strong>
          <select
            className="project-picker"
            aria-label="Project name"
            name="active-project"
            value={data.activeProjectId ?? ""}
            onChange={(event) => setData({ ...data, activeProjectId: event.target.value })}
          >
            {data.projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.title}
              </option>
            ))}
          </select>
        </div>

        <nav className="mode-tabs" aria-label="Workflow modes">
          <button className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}>
            Write
          </button>
          <button className={mode === "review" ? "active" : ""} onClick={() => setMode("review")}>
            Review
          </button>
          <button className={mode === "rewrite" ? "active" : ""} onClick={() => setMode("rewrite")}>
            Rewrite
          </button>
        </nav>

        <div className="topbar-right">
          <div className="topbar-menus" aria-label="Project actions">
            <details
              ref={optionsRef}
              className="menu options-menu"
              open={optionsOpen}
              onMouseLeave={() => setOptionsOpen(false)}
              onToggle={(event) => setOptionsOpen(event.currentTarget.open)}
            >
              <summary>Options</summary>
              <div className="menu-popover options-popover">
                <section className="menu-section">
                  <strong>Project</strong>
                  {activeProject && (
                    <div className="menu-status">{activeProject.writingMode === "script" ? "Script project" : "Freewriting project"}</div>
                  )}
                  <button onClick={() => { rename(); setOptionsOpen(false); }} disabled={!activeProject}>Rename Project</button>
                  <button onClick={() => { duplicate(); setOptionsOpen(false); }} disabled={!activeProject}>Duplicate Project</button>
                  <button onClick={() => { deleteActive(); setOptionsOpen(false); }} disabled={!activeProject}>Delete Project</button>
                  <button
                    onClick={() => { activeProject && exportProjectBackup(activeProject, data); setOptionsOpen(false); }}
                    disabled={!activeProject}
                  >
                    Backup Project
                  </button>
                </section>

                <section className="menu-section">
                  <strong>File</strong>
                  <button onClick={() => { createNew("script"); setOptionsOpen(false); }}>New Script Project</button>
                  <button onClick={() => { createNew("freewrite"); setOptionsOpen(false); }}>New Freewriting Project</button>
                  <label>
                    Open Project
                    <select
                      name="open-project"
                      value={data.activeProjectId ?? ""}
                      onChange={(event) => {
                        setData({ ...data, activeProjectId: event.target.value });
                        setOptionsOpen(false);
                      }}
                    >
                      {data.projects.map((project) => (
                        <option key={project.projectId} value={project.projectId}>
                          {project.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="menu-file">
                    Import Project
                    <input
                      name="import-project"
                      type="file"
                      accept=".json"
                      onChange={(event) => {
                        importBackup(event.target.files?.[0]);
                        setOptionsOpen(false);
                      }}
                    />
                  </label>
                </section>

                <section className="menu-section">
                  <strong>Export</strong>
                  <button onClick={() => { activeProject && exportFountainFile(activeProject, data.versions); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export Fountain
                  </button>
                  <button onClick={() => { activeProject && exportText(activeProject, data.versions); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export TXT
                  </button>
                  <button onClick={() => { activeProject && exportFullPdf(activeProject, data.versions); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export PDF
                  </button>
                  <button onClick={() => { activeProject && exportFullPdf(activeProject, data.versions, true); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export Revision PDF
                  </button>
                  <button onClick={() => { activeProject && exportChangesPdf(activeProject, data.versions); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export Changes PDF
                  </button>
                  <button onClick={() => { activeProject && exportProjectBackup(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export Project Backup JSON
                  </button>
                </section>

              </div>
            </details>
            <button className="undo-button" onClick={undoLast} disabled={undoStack.length === 0} title="Undo last change">
              Undo
            </button>
          </div>

          <div className="save-meta" aria-label="Project status">
            <span className="saved-dot" />
            <span>Saved</span>
            <span>{words} words</span>
            <span>{pages} page{pages === 1 ? "" : "s"}</span>
          </div>
        </div>
      </header>

      <main className="workspace">
        {activeProject ? (
          <>
            {mode === "write" && (
              <WriteMode
                data={data}
                project={activeProject}
                setData={setData}
                visibility={visibility}
                fadeTiming={fadeTiming}
                setVisibility={setVisibility}
                setFadeTiming={setFadeTiming}
              />
            )}
            {mode === "review" && <ReviewMode data={data} project={activeProject} setData={setData} />}
            {mode === "rewrite" && <RewriteMode data={data} project={activeProject} setData={setData} />}
          </>
        ) : (
          <div className="empty-state">Create a project to begin.</div>
        )}
      </main>
    </div>
  );
}
