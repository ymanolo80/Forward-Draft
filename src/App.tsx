import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ReviewMode } from "./components/ReviewMode";
import { RewriteMode } from "./components/RewriteMode";
import { WriteMode } from "./components/WriteMode";
import { autosaveProjectFile, createProjectFile, exportChangesPdf, exportFountainFile, exportFullPdf, saveProjectFile, exportText } from "./lib/exports";
import { isNativeFileServiceAvailable, openNativeTextFile, readNativeTextFileReference, readTextFile } from "./lib/fileService";
import { createId, nowIso } from "./lib/ids";
import {
  importFdxIntoData,
  importFountainIntoData,
  importTxtIntoData,
  openProjectFileIntoData,
  type TextFileSource,
} from "./lib/projectIO";
import { createProjectFileDocument, parseProjectFileText, projectTitleFromFileName } from "./lib/projectFile";
import { createProject } from "./lib/seed";
import { parseScreenplayText } from "./lib/screenplay";
import { emptyData, loadData, saveData } from "./lib/storage";
import type { AppData, AppMode, CoverPage, FadeTiming, FontFamilyChoice, FontSettings, Project, ProjectFileReference, VisibilityRule, WritingMode } from "./types";

type ThemeMode = "system" | "light" | "dark";
const SCENE_LIST_TOGGLE_EVENT = "forwarddraft:toggle-scene-list";
const zoomOptions = [1, 1.25, 1.5, 2];

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

function wrappedLineCount(text: string, charactersPerLine: number) {
  if (!text.trim()) return 1;
  return text
    .split("\n")
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.trim().length / charactersPerLine)), 0);
}

function screenplayPageCount(text: string) {
  if (!text.trim()) return 1;
  const blocks = parseScreenplayText(text);
  const lines = blocks.reduce((count, block) => {
    const charactersPerLine =
      block.element === "Dialogue"
        ? 34
        : block.element === "Parenthetical"
          ? 28
          : block.element === "Character" || block.element === "Transition" || block.element === "Scene Heading"
            ? 60
            : 58;
    const gap = block.hasGapBefore ? 1 : 0;
    return count + gap + wrappedLineCount(block.text, charactersPerLine);
  }, 0);
  return Math.max(1, Math.ceil(lines / 55));
}

function projectPageCount(project: Project | undefined, text: string) {
  if (!project) return 1;
  if (project.writingMode === "script") return screenplayPageCount(text);
  return Math.max(1, Math.ceil(wordCount(text) / 250));
}

function defaultCoverPage(project: Project): CoverPage {
  return {
    title: project.coverPage?.title || project.title,
    writtenBy: project.coverPage?.writtenBy ?? "",
    contact: project.coverPage?.contact ?? "",
    date: project.coverPage?.date || project.createdAt.slice(0, 10),
  };
}

function sameProjectFileReference(left?: ProjectFileReference, right?: ProjectFileReference) {
  if (!left || !right) return left === right;
  return (
    left.adapter === right.adapter &&
    left.fileRef === right.fileRef &&
    left.name === right.name &&
    Math.round(left.modifiedAt ?? 0) === Math.round(right.modifiedAt ?? 0)
  );
}

function projectFileContentsMatch(project: Project, data: AppData, fileText: string) {
  try {
    const current = createProjectFileDocument(project, data);
    const external = parseProjectFileText(fileText);
    return JSON.stringify({
      project: current.project,
      versions: current.versions,
      notes: current.notes,
      highlights: current.highlights,
      tasks: current.tasks,
    }) === JSON.stringify({
      project: external.project,
      versions: external.versions,
      notes: external.notes,
      highlights: external.highlights,
      tasks: external.tasks,
    });
  } catch {
    return false;
  }
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
  const [externalProjectUpdate, setExternalProjectUpdate] = useState<TextFileSource | undefined>();
  const [visibility, setVisibility] = useState<VisibilityRule>("last3");
  const [fadeTiming, setFadeTiming] = useState<FadeTiming>("3s");
  const [documentZoom, setDocumentZoomState] = useState(() => {
    const stored = Number(localStorage.getItem("forward-draft-document-zoom"));
    return zoomOptions.includes(stored) ? stored : 1.25;
  });
  const [fontSettings, setFontSettings] = useState<FontSettings>({
    family: "screenplay",
    size: 16,
    lineHeight: 1.6,
    bold: false,
    italic: false,
    underline: false,
  });
  const optionsRef = useRef<HTMLDetailsElement>(null);
  const projectAutosaveTimerRef = useRef<number | undefined>(undefined);
  const fileReferenceOnlyUpdateRef = useRef(false);
  const fileRefreshCheckingRef = useRef(false);
  const fileRefreshPromptedRef = useRef<string | undefined>(undefined);
  const dirtyProjectVersionsRef = useRef(new Map<string, number>());

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

  const setDocumentZoom = (next: number) => {
    setDocumentZoomState(next);
    localStorage.setItem("forward-draft-document-zoom", String(next));
  };

  const clearPendingProjectAutosave = useCallback(() => {
    if (projectAutosaveTimerRef.current !== undefined) {
      window.clearTimeout(projectAutosaveTimerRef.current);
      projectAutosaveTimerRef.current = undefined;
    }
  }, []);

  const rememberProjectFileReference = useCallback((projectId: string, fileReference: ProjectFileReference) => {
    setDataState((current) => {
      const existing = current.projects.find((project) => project.projectId === projectId)?.fileReference;
      if (sameProjectFileReference(existing, fileReference)) return current;
      fileReferenceOnlyUpdateRef.current = true;
      const next = {
        ...current,
        projects: current.projects.map((project) =>
          project.projectId === projectId ? { ...project, fileReference } : project,
        ),
      };
      saveData(next).catch((error) => console.error("Project file reference save failed", error));
      return next;
    });
  }, []);

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

  const markProjectDirty = useCallback((projectId: string | undefined) => {
    if (!projectId) return 0;
    const nextVersion = (dirtyProjectVersionsRef.current.get(projectId) ?? 0) + 1;
    dirtyProjectVersionsRef.current.set(projectId, nextVersion);
    return nextVersion;
  }, []);

  const clearProjectDirty = useCallback((projectId: string | undefined, version?: number) => {
    if (!projectId) return;
    if (version !== undefined && dirtyProjectVersionsRef.current.get(projectId) !== version) return;
    dirtyProjectVersionsRef.current.delete(projectId);
  }, []);

  const setData = useCallback((next: AppData, options?: { dirty?: boolean }) => {
    if (options?.dirty !== false) markProjectDirty(next.activeProjectId);
    setUndoStack((history) => [...history, data].slice(-50));
    setRedoStack([]);
    setDataState(next);
    saveData(next).catch((error) => console.error("Autosave failed", error));
  }, [data, markProjectDirty]);

  const applyProjectSource = useCallback((source: TextFileSource, showCopyAlert = true) => {
    const result = openProjectFileIntoData(data, source);
    setData(result.data, { dirty: false });
    setMode("write");
    setOptionsOpen(false);
    if (showCopyAlert && result.importedAsCopy) {
      alert(`Opened "${result.originalTitle}" as "${result.title}" because that project already exists here.`);
    }
  }, [data, setData]);

  const undoLast = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    markProjectDirty(previous.activeProjectId);
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history, data].slice(-50));
    setDataState(previous);
    saveData(previous).catch((error) => console.error("Autosave failed", error));
  }, [data, undoStack]);

  const redoLast = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    markProjectDirty(next.activeProjectId);
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history, data].slice(-50));
    setDataState(next);
    saveData(next).catch((error) => console.error("Autosave failed", error));
  }, [data, redoStack]);

  useEffect(() => {
    if (!loaded || !activeProject?.fileReference) return undefined;
    if (fileReferenceOnlyUpdateRef.current) {
      fileReferenceOnlyUpdateRef.current = false;
      return undefined;
    }
    const dirtyVersion = dirtyProjectVersionsRef.current.get(activeProject.projectId);
    if (!dirtyVersion) return undefined;
    clearPendingProjectAutosave();
    projectAutosaveTimerRef.current = window.setTimeout(() => {
      projectAutosaveTimerRef.current = undefined;
      autosaveProjectFile(activeProject, data)
        .then((outcome) => {
          if (outcome.status === "saved" && outcome.fileReference) {
            clearProjectDirty(activeProject.projectId, dirtyVersion);
            rememberProjectFileReference(activeProject.projectId, outcome.fileReference);
          }
        })
        .catch((error) => console.error("Project file autosave failed", error));
    }, 900);
    return clearPendingProjectAutosave;
  }, [activeProject, clearPendingProjectAutosave, clearProjectDirty, data, loaded, rememberProjectFileReference]);

  useEffect(() => {
    if (!loaded || !activeProject?.fileReference || externalProjectUpdate || !isNativeFileServiceAvailable()) return undefined;
    const checkForFileRefresh = async () => {
      if (fileRefreshCheckingRef.current || projectAutosaveTimerRef.current !== undefined) return;
      if (dirtyProjectVersionsRef.current.has(activeProject.projectId)) return;
      fileRefreshCheckingRef.current = true;
      try {
        const source = await readNativeTextFileReference(activeProject.fileReference!);
        if (!source?.fileReference) return;
        if (projectFileContentsMatch(activeProject, data, source.text)) {
          rememberProjectFileReference(activeProject.projectId, source.fileReference);
          return;
        }
        const knownModifiedAt = activeProject.fileReference?.modifiedAt ?? 0;
        const externalModifiedAt = source.fileReference.modifiedAt ?? 0;
        const promptKey = `${activeProject.projectId}:${Math.round(externalModifiedAt)}`;
        if (externalModifiedAt <= knownModifiedAt + 1000 || fileRefreshPromptedRef.current === promptKey) return;
        fileRefreshPromptedRef.current = promptKey;
        setExternalProjectUpdate(source);
      } finally {
        fileRefreshCheckingRef.current = false;
      }
    };
    const timer = window.setInterval(checkForFileRefresh, 6000);
    void checkForFileRefresh();
    return () => window.clearInterval(timer);
  }, [activeProject, data, externalProjectUpdate, loaded, rememberProjectFileReference]);

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
  const pages = projectPageCount(activeProject, text);
  const appStyle = {
    "--draft-font-family": fontFamilyMap[fontSettings.family],
    "--draft-font-size": `${fontSettings.size}px`,
    "--draft-line-height": String(fontSettings.lineHeight),
    "--draft-font-weight": "400",
    "--draft-font-style": "normal",
    "--draft-text-decoration": "none",
    "--page-zoom": String(documentZoom),
    "--page-view-width": `${820 * documentZoom}px`,
    "--draft-view-font-size": `${fontSettings.size * documentZoom}px`,
  } as CSSProperties;
  const hasSceneListToggle = Boolean(activeProject && (mode === "review" || mode === "rewrite"));
  const sceneListLabel = activeProject?.writingMode === "freewrite" ? "Chapters" : "Scenes";

  const createNew = async (writingMode: WritingMode = "script") => {
    const createdAt = nowIso();
    const projectId = createId("project");
    const defaultTitle = writingMode === "script" ? "New Script Project" : "New Freewriting Project";
    const project: Project = {
      projectId,
      title: defaultTitle,
      writingMode,
      createdAt,
      updatedAt: createdAt,
      coverPage: {
        title: defaultTitle,
        writtenBy: "",
        contact: "",
        date: createdAt.slice(0, 10),
      },
      drafts: [],
      scenes: [],
    };
    const initialData = {
      ...data,
      projects: [...data.projects, project],
      activeProjectId: projectId,
    };
    const outcome = await createProjectFile(project, initialData);
    if (outcome.status === "cancelled") return;

    const title = outcome.fileReference ? (projectTitleFromFileName(outcome.fileReference.name) ?? project.title) : project.title;
    const fileReference = outcome.fileReference ? { ...outcome.fileReference, name: outcome.fileReference.name } : undefined;
    const savedProject: Project = {
      ...project,
      title,
      coverPage: {
        ...project.coverPage!,
        title,
      },
      ...(fileReference ? { fileReference } : {}),
    };
    const nextData = {
      ...data,
      projects: [...data.projects, savedProject],
      activeProjectId: projectId,
    };
    if (fileReference) {
      await autosaveProjectFile(savedProject, nextData);
    } else {
      alert("Project created locally, but Forward Draft could not keep a live file location for autosave on this device.");
    }
    setData(nextData, { dirty: false });
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
    const { fileReference: _fileReference, ...projectTemplate } = activeProject;
    const project = {
      ...projectTemplate,
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

  const saveActiveProjectFile = async () => {
    if (!activeProject) return;
    clearPendingProjectAutosave();
    const outcome = await saveProjectFile(activeProject, data);
    if (outcome.status === "cancelled") return;
    if (outcome.status !== "saved") {
      alert("Forward Draft could not save this project file.");
      return;
    }
    clearProjectDirty(activeProject.projectId);
    if (outcome.fileReference) rememberProjectFileReference(activeProject.projectId, outcome.fileReference);
  };

  const openProjectSource = async (source?: TextFileSource) => {
    if (!source) return;
    try {
      applyProjectSource(source);
    } catch (error) {
      alert(error instanceof Error ? error.message : "This project file could not be opened.");
    }
  };

  const openProjectFile = async (file?: File) => {
    if (!file) return;
    await openProjectSource(await readTextFile(file));
  };

  const importFountainSource = async (source?: TextFileSource) => {
    if (!source) return;
    try {
      const result = importFountainIntoData(data, source);
      setData(result.data);
      setMode("review");
      setOptionsOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "This Fountain file could not be imported.");
    }
  };

  const importFountainFile = async (file?: File) => {
    if (!file) return;
    await importFountainSource(await readTextFile(file));
  };

  const importTxtSource = async (source?: TextFileSource) => {
    if (!source) return;
    try {
      const result = importTxtIntoData(data, source);
      setData(result.data);
      setMode("review");
      setOptionsOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "This TXT file could not be imported.");
    }
  };

  const importTxtFile = async (file?: File) => {
    if (!file) return;
    await importTxtSource(await readTextFile(file));
  };

  const importFdxSource = async (source?: TextFileSource) => {
    if (!source) return;
    try {
      const result = importFdxIntoData(data, source);
      setData(result.data);
      setMode("review");
      setOptionsOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "This Final Draft file could not be imported.");
    }
  };

  const importFdxFile = async (file?: File) => {
    if (!file) return;
    await importFdxSource(await readTextFile(file));
  };

  const openNativeFile = async (event: MouseEvent, extensions: string[], handler: (source?: TextFileSource) => Promise<void>) => {
    if (!isNativeFileServiceAvailable()) return;
    event.preventDefault();
    const source = await openNativeTextFile(extensions);
    if (source) {
      await handler(source);
      return;
    }
    if (source === undefined) {
      event.currentTarget.querySelector("input")?.click();
    }
  };

  return (
    <div className={`app mode-${mode}`} style={appStyle}>
      <header className="global-topbar">
        <div className="topbar-project">
          {hasSceneListToggle ? (
            <button
              className="topbar-pane-toggle"
              onClick={() => window.dispatchEvent(new Event(SCENE_LIST_TOGGLE_EVENT))}
              aria-label={`Toggle ${sceneListLabel}`}
              title={`Toggle ${sceneListLabel}`}
            >
              <span className="sidebar-toggle-glyph" aria-hidden="true" />
              <span>{sceneListLabel}</span>
            </button>
          ) : (
            <strong>Forward Draft</strong>
          )}
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
                <section className="menu-section menu-project-section">
                  <strong>Current Project</strong>
                  {activeProject && (
                    <div className="menu-project-card">
                      <span>{activeProject.writingMode === "script" ? "Script project" : "Freewriting project"}</span>
                      <strong>{activeProject.title}</strong>
                    </div>
                  )}
                  <label className="menu-select-row">
                    <span>Switch Project</span>
                    <select
                      name="active-project"
                      value={data.activeProjectId ?? ""}
                      onChange={(event) => {
                        setData({ ...data, activeProjectId: event.target.value });
                        event.currentTarget.blur();
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
                </section>

                <section className="menu-section">
                  <strong>Appearance</strong>
                  <label className="menu-select-row">
                    <span>Theme</span>
                    <select
                      name="theme-mode"
                      value={themeMode}
                      onChange={(event) => {
                        setThemeMode(event.target.value as ThemeMode);
                        event.currentTarget.blur();
                      }}
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                  <label className="menu-select-row">
                    <span>Zoom</span>
                    <select
                      name="document-zoom"
                      value={documentZoom}
                      onChange={(event) => {
                        setDocumentZoom(Number(event.target.value));
                        event.currentTarget.blur();
                      }}
                    >
                      {zoomOptions.map((option) => (
                        <option key={option} value={option}>
                          {Math.round(option * 100)}%
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="menu-section menu-command-section">
                  <details className="menu-submenu">
                    <summary>
                      <span>File</span>
                      <span className="menu-chevron" aria-hidden="true">›</span>
                    </summary>
                    <div className="submenu-panel">
                      <button onClick={async () => { await createNew("script"); setOptionsOpen(false); }}>New Script Project</button>
                      <button onClick={async () => { await createNew("freewrite"); setOptionsOpen(false); }}>New Freewriting Project</button>
                      <label className="menu-file" onClick={(event) => openNativeFile(event, ["frdx"], openProjectSource)}>
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
                      <button
                        onClick={async () => {
                          await saveActiveProjectFile();
                          setOptionsOpen(false);
                        }}
                        disabled={!activeProject}
                      >
                        Save Project File
                      </button>
                      <button onClick={() => { rename(); setOptionsOpen(false); }} disabled={!activeProject}>Rename Project</button>
                      <button onClick={() => { duplicate(); setOptionsOpen(false); }} disabled={!activeProject}>Duplicate Project</button>
                      <button className="danger-command" onClick={() => { deleteActive(); setOptionsOpen(false); }} disabled={!activeProject}>Delete Project</button>
                    </div>
                  </details>

                  <details className="menu-submenu">
                    <summary>
                      <span>Import</span>
                      <span className="menu-chevron" aria-hidden="true">›</span>
                    </summary>
                    <div className="submenu-panel">
                      <label className="menu-file" onClick={(event) => openNativeFile(event, ["fountain"], importFountainSource)}>
                        Fountain Script
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
                      <label className="menu-file" onClick={(event) => openNativeFile(event, ["txt"], importTxtSource)}>
                        TXT Script
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
                      <label className="menu-file" onClick={(event) => openNativeFile(event, ["fdx", "xml"], importFdxSource)}>
                        Final Draft
                        <input
                          name="import-fdx"
                          type="file"
                          onChange={(event) => {
                            importFdxFile(event.target.files?.[0]);
                            event.currentTarget.value = "";
                            setOptionsOpen(false);
                          }}
                        />
                      </label>
                    </div>
                  </details>

                  <details className="menu-submenu">
                    <summary>
                      <span>Export</span>
                      <span className="menu-chevron" aria-hidden="true">›</span>
                    </summary>
                    <div className="submenu-panel">
                      <button onClick={async () => { if (activeProject) await exportFountainFile(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                        Fountain
                      </button>
                      <button onClick={async () => { if (activeProject) await exportText(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                        TXT
                      </button>
                      <button onClick={async () => { if (activeProject) await exportFullPdf(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                        PDF
                      </button>
                      <button onClick={async () => { if (activeProject) await exportFullPdf(activeProject, data, true); setOptionsOpen(false); }} disabled={!activeProject}>
                        Revision PDF
                      </button>
                      <button onClick={async () => { if (activeProject) await exportChangesPdf(activeProject, data); setOptionsOpen(false); }} disabled={!activeProject}>
                        Changes PDF
                      </button>
                    </div>
                  </details>
                </section>

                <section className="menu-section">
                  <strong>Cover Page</strong>
                  <button onClick={openCoverPage} disabled={!activeProject}>Edit Cover Page</button>
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

      {externalProjectUpdate && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Project file update available">
          <section className="file-refresh-dialog">
            <header>
              <strong>Newer Project File</strong>
            </header>
            <p>
              The saved file for “{activeProject?.title ?? externalProjectUpdate.name}” changed in Files or iCloud.
              Reload the newer version?
            </p>
            <footer>
              <button onClick={() => setExternalProjectUpdate(undefined)}>Keep Current</button>
              <button
                className="primary"
                onClick={() => {
                  try {
                    applyProjectSource(externalProjectUpdate, false);
                    setExternalProjectUpdate(undefined);
                  } catch (error) {
                    alert(error instanceof Error ? error.message : "This project file could not be reloaded.");
                  }
                }}
              >
                Reload File
              </button>
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
