import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ReviewMode } from "./components/ReviewMode";
import { RewriteMode } from "./components/RewriteMode";
import { WriteMode } from "./components/WriteMode";
import { exportChangesPdf, exportFountainFile, exportFullPdf, exportProjectFile, exportText } from "./lib/exports";
import { readTextFile } from "./lib/fileService";
import { createId, nowIso } from "./lib/ids";
import { importFdxIntoData, importFountainIntoData, importTxtIntoData, openProjectFileIntoData } from "./lib/projectIO";
import { createProject } from "./lib/seed";
import { emptyData, loadData, saveData } from "./lib/storage";
import type { AppData, AppMode, CoverPage, FadeTiming, FontFamilyChoice, FontSettings, Project, VisibilityRule, WritingMode } from "./types";

type ThemeMode = "system" | "light" | "dark";

const fontFamilyMap: Record<FontFamilyChoice, string> = {
  screenplay: '"Courier Prime", "Courier New", Courier, monospace',
  system: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
};

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

function defaultCoverPage(project: Project): CoverPage {
  return {
    title: project.coverPage?.title || project.title,
    writtenBy: project.coverPage?.writtenBy ?? "",
    contact: project.coverPage?.contact ?? "",
    date: project.coverPage?.date || project.createdAt.slice(0, 10),
  };
}

export function App() {
  const [data, setDataState] = useState<AppData>(emptyData);
  const [mode, setMode] = useState<AppMode>("write");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("forward-draft-theme");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });
  const [loaded, setLoaded] = useState(false);
  const [undoStack, setUndoStack] = useState<AppData[]>([]);
  const [redoStack, setRedoStack] = useState<AppData[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverDraft, setCoverDraft] = useState<CoverPage | undefined>();
  const [visibility, setVisibility] = useState<VisibilityRule>("last3");
  const [fadeTiming, setFadeTiming] = useState<FadeTiming>("3s");
  const [fontSettings, setFontSettings] = useState<FontSettings>({
    family: "screenplay",
    size: 16,
    lineHeight: 1.6,
  });
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
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem("forward-draft-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [mode, data.activeProjectId]);

  useEffect(() => {
    if (!activeProject) return;
    if (activeProject.writingMode === "script" && (visibility === "previousBlock" || visibility === "previousChapter")) {
      setVisibility("previousScene");
    }
    if (activeProject.writingMode === "freewrite" && visibility === "previousScene") setVisibility("previousBlock");
  }, [activeProject, visibility]);

  const setData = useCallback((next: AppData) => {
    setUndoStack((history) => [...history, data].slice(-50));
    setRedoStack([]);
    setDataState(next);
    saveData(next).catch((error) => console.error("Autosave failed", error));
  }, [data]);

  const undoLast = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history, data].slice(-50));
    setDataState(previous);
    saveData(previous).catch((error) => console.error("Autosave failed", error));
  }, [data, undoStack]);

  const redoLast = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history, data].slice(-50));
    setDataState(next);
    saveData(next).catch((error) => console.error("Autosave failed", error));
  }, [data, redoStack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!event.metaKey && !event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isEditable) return;
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) redoLast();
      else undoLast();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redoLast, undoLast]);

  useEffect(() => {
    if (!optionsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const menu = optionsRef.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target)) setOptionsOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [optionsOpen]);

  if (!loaded) return <div className="loading">Opening Forward Draft...</div>;

  const text = projectText(activeProject, data);
  const words = wordCount(text);
  const pages = Math.max(1, Math.ceil(words / 250));
  const appStyle = {
    "--draft-font-family": fontFamilyMap[fontSettings.family],
    "--draft-font-size": `${fontSettings.size}px`,
    "--draft-line-height": String(fontSettings.lineHeight),
  } as CSSProperties;

  const createNew = (writingMode: WritingMode = "script") => {
    const createdAt = nowIso();
    const projectId = createId("project");
    const project: Project = {
      projectId,
      title: writingMode === "script" ? "New Script Project" : "New Freewriting Project",
      writingMode,
      createdAt,
      updatedAt: createdAt,
      coverPage: {
        title: writingMode === "script" ? "New Script Project" : "New Freewriting Project",
        writtenBy: "",
        contact: "",
        date: createdAt.slice(0, 10),
      },
      drafts: [],
      scenes: [],
    };
    setData({
      ...data,
      projects: [...data.projects, project],
      activeProjectId: projectId,
    });
    setMode("write");
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

  const openCoverPage = () => {
    if (!activeProject) return;
    setCoverDraft(defaultCoverPage(activeProject));
    setCoverOpen(true);
    setOptionsOpen(false);
  };

  const saveCoverPage = () => {
    if (!activeProject || !coverDraft) return;
    const updatedAt = nowIso();
    setData({
      ...data,
      projects: data.projects.map((project) =>
        project.projectId === activeProject.projectId ? { ...project, coverPage: coverDraft, updatedAt } : project,
      ),
    });
    setCoverOpen(false);
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

  const openProjectFile = async (file?: File) => {
    if (!file) return;
    try {
      const source = await readTextFile(file);
      const result = openProjectFileIntoData(data, source);
      setData(result.data);
      setMode("write");
      if (result.importedAsCopy) {
        alert(`Opened "${result.originalTitle}" as "${result.title}" because that project already exists here.`);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "This project file could not be opened.");
    }
  };

  const importFountainFile = async (file?: File) => {
    if (!file) return;
    try {
      const source = await readTextFile(file);
      const result = importFountainIntoData(data, source);
      setData(result.data);
      setMode("review");
    } catch (error) {
      alert(error instanceof Error ? error.message : "This Fountain file could not be imported.");
    }
  };

  const importTxtFile = async (file?: File) => {
    if (!file) return;
    try {
      const source = await readTextFile(file);
      const result = importTxtIntoData(data, source);
      setData(result.data);
      setMode("review");
    } catch (error) {
      alert(error instanceof Error ? error.message : "This TXT file could not be imported.");
    }
  };

  const importFdxFile = async (file?: File) => {
    if (!file) return;
    try {
      const source = await readTextFile(file);
      const result = importFdxIntoData(data, source);
      setData(result.data);
      setMode("review");
    } catch (error) {
      alert(error instanceof Error ? error.message : "This Final Draft file could not be imported.");
    }
  };

  return (
    <div className={`app mode-${mode}`} style={appStyle}>
      <header className="global-topbar">
        <div className="topbar-project">
          <strong>Forward Draft</strong>
        </div>

        <div className="topbar-center">
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
        </div>

        <div className="topbar-right">
          <div className="topbar-menus" aria-label="Project actions">
            <details
              ref={optionsRef}
              className="menu options-menu"
              open={optionsOpen}
              onToggle={(event) => setOptionsOpen(event.currentTarget.open)}
            >
              <summary>Options</summary>
              <div className="menu-popover options-popover">
                <section className="menu-section">
                  <strong>Project</strong>
                  {activeProject && (
                    <div className="menu-status">{activeProject.writingMode === "script" ? "Script project" : "Freewriting project"}</div>
                  )}
                  <label>
                    Current Project
                    <select
                      name="active-project"
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
                  <button onClick={openCoverPage} disabled={!activeProject}>Cover Page</button>
                  <button onClick={() => { rename(); setOptionsOpen(false); }} disabled={!activeProject}>Rename Project</button>
                  <button onClick={() => { duplicate(); setOptionsOpen(false); }} disabled={!activeProject}>Duplicate Project</button>
                  <button onClick={() => { deleteActive(); setOptionsOpen(false); }} disabled={!activeProject}>Delete Project</button>
                </section>

                <section className="menu-section">
                  <strong>Appearance</strong>
                  <label>
                    Theme
                    <select
                      name="theme-mode"
                      value={themeMode}
                      onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                </section>

                <section className="menu-section">
                  <strong>File</strong>
                  <button onClick={() => { createNew("script"); setOptionsOpen(false); }}>New Script Project</button>
                  <button onClick={() => { createNew("freewrite"); setOptionsOpen(false); }}>New Freewriting Project</button>
                  <label className="menu-file">
                    Open Project File
                    <input
                      name="import-project"
                      type="file"
                      accept=".frdx"
                      onChange={(event) => {
                        openProjectFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                        setOptionsOpen(false);
                      }}
                    />
                  </label>
                  <label className="menu-file">
                    Import Fountain Script
                    <input
                      name="import-fountain"
                      type="file"
                      accept=".fountain,text/plain"
                      onChange={(event) => {
                        importFountainFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                        setOptionsOpen(false);
                      }}
                    />
                  </label>
                  <label className="menu-file">
                    Import TXT Script
                    <input
                      name="import-txt"
                      type="file"
                      accept=".txt,text/plain"
                      onChange={(event) => {
                        importTxtFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                        setOptionsOpen(false);
                      }}
                    />
                  </label>
                  <label className="menu-file">
                    Import Final Draft
                    <input
                      name="import-fdx"
                      type="file"
                      accept=".fdx,.xml,application/xml,text/xml"
                      onChange={(event) => {
                        importFdxFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                        setOptionsOpen(false);
                      }}
                    />
                  </label>
                  <button
                    onClick={async () => {
                      if (activeProject) await exportProjectFile(activeProject, data);
                      setOptionsOpen(false);
                    }}
                    disabled={!activeProject}
                  >
                    Save Project File
                  </button>
                </section>

                <section className="menu-section">
                  <strong>Export</strong>
                  <button onClick={async () => { if (activeProject) await exportFountainFile(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export Fountain
                  </button>
                  <button onClick={async () => { if (activeProject) await exportText(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export TXT
                  </button>
                  <button onClick={async () => { if (activeProject) await exportFullPdf(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export PDF
                  </button>
                  <button onClick={async () => { if (activeProject) await exportFullPdf(activeProject, data, true); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export Revision PDF
                  </button>
                  <button onClick={async () => { if (activeProject) await exportChangesPdf(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                    Export Changes PDF
                  </button>
                </section>

              </div>
            </details>
          </div>
        </div>
      </header>

      {coverOpen && coverDraft && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Cover page editor">
          <section className="cover-editor">
            <header>
              <strong>Cover Page</strong>
              <button onClick={() => setCoverOpen(false)} aria-label="Close cover page editor">Close</button>
            </header>
            <div className="cover-preview">
              <label>
                Title
                <input
                  name="cover-title"
                  value={coverDraft.title}
                  onChange={(event) => setCoverDraft({ ...coverDraft, title: event.target.value })}
                />
              </label>
              <label>
                Written by
                <input
                  name="cover-written-by"
                  value={coverDraft.writtenBy}
                  onChange={(event) => setCoverDraft({ ...coverDraft, writtenBy: event.target.value })}
                />
              </label>
              <label>
                Contact details
                <textarea
                  name="cover-contact"
                  value={coverDraft.contact}
                  onChange={(event) => setCoverDraft({ ...coverDraft, contact: event.target.value })}
                />
              </label>
              <label>
                Date
                <input
                  name="cover-date"
                  value={coverDraft.date}
                  onChange={(event) => setCoverDraft({ ...coverDraft, date: event.target.value })}
                />
              </label>
            </div>
            <footer>
              <button onClick={() => setCoverOpen(false)}>Cancel</button>
              <button className="primary" onClick={saveCoverPage}>Save Cover Page</button>
            </footer>
          </section>
        </div>
      )}

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
                stats={{ words, pages }}
                onUndo={undoLast}
                onRedo={redoLast}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                fontSettings={fontSettings}
                setFontSettings={setFontSettings}
              />
            )}
            {mode === "review" && (
              <ReviewMode
                data={data}
                project={activeProject}
                setData={setData}
                stats={{ words, pages }}
                onUndo={undoLast}
                onRedo={redoLast}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                fontSettings={fontSettings}
                setFontSettings={setFontSettings}
              />
            )}
            {mode === "rewrite" && (
              <RewriteMode
                data={data}
                project={activeProject}
                setData={setData}
                stats={{ words, pages }}
                onUndo={undoLast}
                onRedo={redoLast}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                fontSettings={fontSettings}
                setFontSettings={setFontSettings}
              />
            )}
          </>
        ) : (
          <div className="empty-state">Create a project to begin.</div>
        )}
      </main>
    </div>
  );
}
