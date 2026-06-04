import { useEffect, useMemo, useRef, useState } from "react";
import { ToolFontControls } from "./ToolFontControls";
import { InlineFountainText } from "./InlineFountainText";
import { VisualInlineEditor, type VisualInlineEditorHandle } from "./VisualInlineEditor";
import type { AppData, DraftBlock, FadeTiming, FontSettings, Project, ScriptElement, VisibilityRule } from "../types";
import { blockToFountain, cycleElement, draftBlocksToScenes, elementClass, inferNextElement, scriptElements } from "../lib/fountain";
import { createId, nowIso } from "../lib/ids";
import { visibleDraftWindow } from "../lib/writeVisibility";
import { draftScenesInWritingOrder, mergeDraftSceneOrder, type DraftInsertPlacement } from "../lib/draftSceneOrder";
import { screenplayElementSuggestions } from "../lib/scriptSuggestions";

interface WriteModeProps {
  data: AppData;
  project: Project;
  setData: (next: AppData) => void;
  visibility: VisibilityRule;
  fadeTiming: FadeTiming;
  setVisibility: (next: VisibilityRule) => void;
  setFadeTiming: (next: FadeTiming) => void;
  stats: { words: number; pages: number };
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fontSettings: FontSettings;
  setFontSettings: (next: FontSettings) => void;
}

function fadeDelay(timing: FadeTiming) {
  if (timing === "immediate") return 0;
  if (timing === "5s") return 5000;
  if (timing === "10s") return 10000;
  return 3000;
}

const visibilityOptions: { value: VisibilityRule; label: string }[] = [
  { value: "current", label: "Current line only" },
  { value: "last2", label: "Last 2 lines" },
  { value: "last3", label: "Last 3 lines" },
  { value: "last4", label: "Last 4 lines" },
  { value: "last5", label: "Last 5 lines" },
  { value: "previousBlock", label: "Previous paragraph" },
  { value: "previousScene", label: "Previous scene" },
  { value: "previousChapter", label: "Previous chapter" },
];

const fadeOptions: { value: FadeTiming; label: string }[] = [
  { value: "immediate", label: "Immediate fade" },
  { value: "3s", label: "Fade after 3 seconds" },
  { value: "5s", label: "Fade after 5 seconds" },
  { value: "10s", label: "Fade after 10 seconds" },
  { value: "nextBlock", label: "Fade after next block" },
];

export function WriteMode({
  data,
  project,
  setData,
  visibility,
  fadeTiming,
  setVisibility,
  setFadeTiming,
  stats,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  fontSettings,
  setFontSettings,
}: WriteModeProps) {
  const [element, setElement] = useState<ScriptElement>("Action");
  const [activeText, setActiveText] = useState("");
  const [activeStartedAt, setActiveStartedAt] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());
  const [sectionPlacement, setSectionPlacement] = useState<DraftInsertPlacement>("append");
  const [placementSceneId, setPlacementSceneId] = useState(project.scenes[0]?.sceneId ?? "");
  const [typingUndoStack, setTypingUndoStack] = useState<string[]>([]);
  const [typingRedoStack, setTypingRedoStack] = useState<string[]>([]);
  const inputRef = useRef<VisualInlineEditorHandle>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (project.writingMode === "freewrite" && element !== "Chapter Heading" && element !== "General Text") {
      setElement("General Text");
    }
    if (project.writingMode === "script" && element === "Chapter Heading") setElement("Action");
  }, [element, project.writingMode]);

  useEffect(() => {
    const targets = [...project.scenes].sort((a, b) => a.order - b.order);
    if (targets.length === 0) {
      setPlacementSceneId("");
      setSectionPlacement("append");
      return;
    }
    if (!placementSceneId || !targets.some((scene) => scene.sceneId === placementSceneId)) {
      setPlacementSceneId(targets[0].sceneId);
    }
  }, [placementSceneId, project.scenes]);

  useEffect(() => {
    setActiveText("");
    setTypingUndoStack([]);
    setTypingRedoStack([]);
  }, [project.projectId]);

  const updateProject = (next: Project, nextVersions = data.versions) => {
    setData({
      ...data,
      projects: data.projects.map((candidate) => (candidate.projectId === project.projectId ? next : candidate)),
      versions: nextVersions,
    });
  };

  const applyDraft = (draft: DraftBlock[]) => {
    const sectionLabel = project.writingMode === "freewrite" ? "chapter" : "scene";
    const parsed = draftBlocksToScenes(project.projectId, draft, sectionLabel);
    const existingDraftScenes = draftScenesInWritingOrder(project.scenes);
    const draftSceneIds = new Set(existingDraftScenes.map((scene) => scene.sceneId));
    const nextDraftVersions = parsed.scenes.map((scene, index) => {
      const existing = existingDraftScenes[index];
      const parsedVersion = parsed.versions[index];
      const existingVersion = existing
        ? data.versions.find((version) => version.versionId === existing.currentVersionId)
        : undefined;
      const sceneId = existing?.sceneId ?? scene.sceneId;
      const versionId = existingVersion?.versionId ?? parsedVersion.versionId;
      return {
        scene: {
          ...scene,
          sceneId,
          projectId: project.projectId,
          currentVersionId: versionId,
          status: existing?.status ?? scene.status,
          createdAt: existing?.createdAt ?? scene.createdAt,
          source: "draft" as const,
        },
        version: {
          ...parsedVersion,
          sceneId,
          versionId,
          versionNumber: existingVersion?.versionNumber ?? parsedVersion.versionNumber,
          createdAt: existingVersion?.createdAt ?? parsedVersion.createdAt,
          isCurrent: true,
        },
      };
    });
    const scenes = mergeDraftSceneOrder(
      project.scenes,
      nextDraftVersions.map((item) => item.scene),
      sectionPlacement,
      placementSceneId,
    );
    const preservedVersions = data.versions.filter((version) => !draftSceneIds.has(version.sceneId));
    updateProject(
      {
        ...project,
        drafts: draft,
        scenes,
        updatedAt: nowIso(),
      },
      [...preservedVersions, ...nextDraftVersions.map((item) => item.version)],
    );
  };

  const commitBlock = (text = activeText, nextElement?: ScriptElement) => {
    if (!text.trim()) return;
    const blockElement =
      project.writingMode === "freewrite"
        ? element === "Chapter Heading"
          ? "Chapter Heading"
          : "General Text"
        : element;
    const block: DraftBlock = {
      blockId: createId("block"),
      element: blockElement,
      text,
      createdAt: nowIso(),
    };
    const draft = [...project.drafts, block];
    applyDraft(draft);
    setActiveText("");
    setTypingUndoStack([]);
    setTypingRedoStack([]);
    setActiveStartedAt(Date.now());
    if (nextElement) setElement(nextElement);
  };

  const normalizeInput = (value: string) => {
    if (element === "Scene Heading" || element === "Character" || element === "Transition") return value.toUpperCase();
    return value;
  };

  const updateActiveText = (value: string) => {
    const next = normalizeInput(value);
    if (next === activeText) return;
    setTypingUndoStack((history) => [...history, activeText].slice(-100));
    setTypingRedoStack([]);
    setActiveText(next);
  };

  const undoWrite = () => {
    const previous = typingUndoStack.at(-1);
    if (previous === undefined) {
      setTypingRedoStack([]);
      onUndo();
      return;
    }
    setTypingUndoStack((history) => history.slice(0, -1));
    setTypingRedoStack((history) => [...history, activeText].slice(-100));
    setActiveText(previous);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const redoWrite = () => {
    const next = typingRedoStack.at(-1);
    if (next === undefined) {
      onRedo();
      return;
    }
    setTypingRedoStack((history) => history.slice(0, -1));
    setTypingUndoStack((history) => [...history, activeText].slice(-100));
    setActiveText(next);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const formatSelection = (marker: string) => {
    inputRef.current?.formatSelection(marker);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && (key === "z" || key === "y")) {
      event.preventDefault();
      if (key === "y" || event.shiftKey) redoWrite();
      else undoWrite();
      return;
    }
    if (event.key === "Tab" && project.writingMode === "script") {
      event.preventDefault();
      setElement(cycleElement(element));
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitBlock(
        activeText,
        project.writingMode === "script" || element === "Chapter Heading"
          ? inferNextElement(element, activeText)
          : undefined,
      );
      return;
    }
    if (event.key === "Backspace" && activeText.length === 0) event.preventDefault();
  };

  const shouldFade = fadeTiming !== "nextBlock" && clock - activeStartedAt >= fadeDelay(fadeTiming);
  const recentBlocks = useMemo(
    () => visibleDraftWindow(project.drafts, project.writingMode, visibility, fadeTiming, shouldFade),
    [fadeTiming, project.drafts, project.writingMode, shouldFade, visibility],
  );
  const liveElement = project.writingMode === "script" ? element : element === "Chapter Heading" ? "Chapter Heading" : "General Text";
  const suggestions =
    project.writingMode === "script" ? screenplayElementSuggestions(element, activeText, project, data.versions) : [];
  const writeVisibilityOptions = visibilityOptions.filter((option) => {
    if (project.writingMode === "script") return option.value !== "previousBlock" && option.value !== "previousChapter";
    return option.value !== "previousScene";
  });
  const sectionName = project.writingMode === "script" ? "scene" : "chapter";
  const sortedScenes = [...project.scenes].sort((a, b) => a.order - b.order);
  const placementTargets = sortedScenes;
  const visibleScriptElements = scriptElements.filter((item) => item !== "Note" && item !== "Shot");

  return (
    <section className="mode-panel write-panel">
      <div className="mode-workspace write-workspace">
        <main className="document-stage">
          <div className="page-shell write-shell">
            <article className="script-page write-page" onClick={() => inputRef.current?.focus()}>
              <div className="locked-draft" aria-label="Recent draft text">
                {recentBlocks.map(({ block, faded }) => (
                  <div
                    className={`script-line ${elementClass(block.element)} ${faded ? "faded" : ""}`}
                    key={block.blockId}
                  >
                    <span><InlineFountainText text={blockToFountain(block)} /></span>
                  </div>
                ))}
              </div>
              <div className={`active-writing-line script-line ${elementClass(liveElement)}`}>
                <VisualInlineEditor
                  ariaLabel="Script page editor"
                  className="active-writing-editor"
                  ref={inputRef}
                  text={activeText}
                  onChange={updateActiveText}
                  onKeyDown={onKeyDown}
                  placeholder={project.writingMode === "script" ? element : element === "Chapter Heading" ? "Chapter title" : "Start typing"}
                />
                {suggestions.length > 0 && (
                  <div className="scene-autocomplete" aria-label={`${liveElement} suggestions`}>
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          updateActiveText(suggestion);
                          inputRef.current?.focus();
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          </div>
        </main>

        <aside className="mode-tools" aria-label="Write tools">
          <header className="mode-tools-header">
            <span>Write Tools</span>
            <strong>{liveElement}</strong>
          </header>

          {project.writingMode === "freewrite" && (
            <section className="tool-section">
              <h3>Freewrite Unit</h3>
              <div className="segmented">
                <button
                  className={element !== "Chapter Heading" ? "active" : ""}
                  onClick={() => {
                    setElement("General Text");
                    inputRef.current?.focus();
                  }}
                >
                  Paragraph
                </button>
                <button
                  className={element === "Chapter Heading" ? "active" : ""}
                  onClick={() => {
                    setElement("Chapter Heading");
                    inputRef.current?.focus();
                  }}
                >
                  Chapter
                </button>
              </div>
            </section>
          )}

          <section className="tool-section">
            <h3>{project.writingMode === "script" ? "New Scene Placement" : "New Chapter Placement"}</h3>
            <label>
              Write as
              <select
                name="section-placement"
                value={sectionPlacement}
                onChange={(event) => setSectionPlacement(event.target.value as DraftInsertPlacement)}
              >
                <option value="append">Next {sectionName}</option>
                <option value="before">Before existing {sectionName}</option>
                <option value="after">After existing {sectionName}</option>
              </select>
            </label>
            {sectionPlacement !== "append" && placementTargets.length > 0 && (
              <label>
                Existing {sectionName}
                <select
                  name="section-placement-target"
                  value={placementSceneId}
                  onChange={(event) => setPlacementSceneId(event.target.value)}
                >
                  {placementTargets.map((scene) => (
                    <option key={scene.sceneId} value={scene.sceneId}>
                      {project.writingMode === "script"
                        ? `${scene.order}  ${scene.heading}`
                        : `Chapter ${scene.order}: ${scene.heading}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>

          <section className="tool-section">
            <h3>Visible Text Window</h3>
            <label>
              Visible text
              <select name="visible-text" value={visibility} onChange={(event) => setVisibility(event.target.value as VisibilityRule)}>
                {writeVisibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Disappearing text
              <select name="fade-timing" value={fadeTiming} onChange={(event) => setFadeTiming(event.target.value as FadeTiming)}>
                {fadeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {project.writingMode === "script" && (
            <section className="tool-section">
              <h3>Script Element</h3>
              <div className="element-grid" role="toolbar" aria-label="Screenplay element toolbar">
                {visibleScriptElements.map((item) => (
                  <button
                    className={element === item ? "active" : ""}
                    key={item}
                    onClick={() => {
                      setElement(item);
                      inputRef.current?.focus();
                    }}
                    title={item}
                  >
                    {item === "Scene Heading" ? "Heading" : item}
                  </button>
                ))}
              </div>
            </section>
          )}

          <ToolFontControls fontSettings={fontSettings} setFontSettings={setFontSettings} onFormatSelection={formatSelection} />

          <section className="tool-section">
            <h3>Undo / Redo</h3>
            <div className="icon-button-row">
              <button aria-label="Undo" title="Undo" onClick={undoWrite} disabled={typingUndoStack.length === 0 && !canUndo}>↺</button>
              <button aria-label="Redo" title="Redo" onClick={redoWrite} disabled={typingRedoStack.length === 0 && !canRedo}>↻</button>
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
