import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, DraftBlock, FadeTiming, Project, ScriptElement, VisibilityRule } from "../types";
import { blockToFountain, cycleElement, draftBlocksToScenes, elementClass, inferNextElement, scriptElements } from "../lib/fountain";
import { createId, nowIso } from "../lib/ids";

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
}

type InsertPlacement = "append" | "before" | "after";

function visibleCount(rule: VisibilityRule) {
  if (rule === "last2") return 2;
  if (rule === "last3") return 3;
  if (rule === "last4") return 4;
  if (rule === "last5") return 5;
  return 1;
}

function fadeDelay(timing: FadeTiming) {
  if (timing === "immediate") return 0;
  if (timing === "5s") return 5000;
  if (timing === "10s") return 10000;
  return 3000;
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const scenePrefixes = ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "EST."];
const sceneTimes = ["DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING", "DAWN", "DUSK", "CONTINUOUS", "LATER", "MOMENTS LATER"];
const starterLocations = ["WRITING ROOM", "CITY STREET", "KITCHEN", "OFFICE", "CAR"];
const standardTransitions = ["CUT TO:", "DISSOLVE TO:", "SMASH CUT TO:", "MATCH CUT TO:", "JUMP CUT TO:", "FADE IN:", "FADE OUT.", "BACK TO:", "INTERCUT WITH:"];
const standardParentheticals = ["(beat)", "(pause)", "(quietly)", "(whispering)", "(to himself)", "(to herself)", "(into phone)", "(CONT'D)", "(then)"];

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

function sceneLocations(project: Project) {
  const values = new Set<string>();
  const collect = (heading: string) => {
    const value = heading.toUpperCase();
    const prefix = scenePrefixes.find((item) => value.startsWith(item));
    if (!prefix) return;
    const withoutPrefix = value.slice(prefix.length).trim();
    const location = withoutPrefix.split(" - ")[0]?.trim();
    if (location) values.add(location);
  };
  project.scenes.forEach((scene) => collect(scene.heading));
  project.drafts.filter((block) => block.element === "Scene Heading").forEach((block) => collect(block.text));
  starterLocations.forEach((location) => values.add(location));
  return [...values].slice(0, 8);
}

function sceneHeadingSuggestions(text: string, project: Project) {
  const value = text.toUpperCase();
  const prefix = scenePrefixes.find((item) => value.startsWith(item));
  if (!prefix) return scenePrefixes.filter((item) => item.startsWith(value)).slice(0, 5);

  const hasSeparator = value.includes(" - ");
  if (!hasSeparator) {
    const locationText = value.slice(prefix.length).trim();
    const locations = sceneLocations(project).filter((location) => location.startsWith(locationText));
    if (locationText && locations.length === 0) return [`${value} - `];
    return locations.map((location) => `${prefix} ${location} - `).slice(0, 5);
  }

  const [beforeTime, timeText = ""] = value.split(" - ");
  return sceneTimes
    .filter((time) => time.startsWith(timeText.trim()))
    .map((time) => `${beforeTime} - ${time}`)
    .slice(0, 5);
}

function optionSuggestions(text: string, options: string[]) {
  const normalized = text.trim().toUpperCase().replace(/^\(/, "");
  return options
    .filter((option) => {
      const cleanOption = option.toUpperCase().replace(/^\(/, "");
      return cleanOption.startsWith(normalized);
    })
    .slice(0, 6);
}

function elementSuggestions(element: ScriptElement, text: string, project: Project) {
  if (element === "Scene Heading") return sceneHeadingSuggestions(text, project);
  if (element === "Transition") return optionSuggestions(text, standardTransitions);
  if (element === "Parenthetical") return optionSuggestions(text, standardParentheticals);
  return [];
}

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
}: WriteModeProps) {
  const [element, setElement] = useState<ScriptElement>("Action");
  const [activeText, setActiveText] = useState("");
  const [activeStartedAt, setActiveStartedAt] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());
  const [sectionPlacement, setSectionPlacement] = useState<InsertPlacement>("append");
  const [placementSceneId, setPlacementSceneId] = useState(project.scenes[0]?.sceneId ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.max(input.scrollHeight, 28)}px`;
  }, [activeText, element]);

  useEffect(() => {
    if (project.writingMode === "freewrite" && element !== "Chapter Heading" && element !== "General Text") {
      setElement("General Text");
    }
    if (project.writingMode === "script" && element === "Chapter Heading") setElement("Action");
  }, [element, project.writingMode]);

  useEffect(() => {
    const targets = project.scenes.filter((scene) => scene.source !== "draft").sort((a, b) => a.order - b.order);
    if (targets.length === 0) {
      setPlacementSceneId("");
      setSectionPlacement("append");
      return;
    }
    if (!placementSceneId || !targets.some((scene) => scene.sceneId === placementSceneId)) {
      setPlacementSceneId(targets[0].sceneId);
    }
  }, [placementSceneId, project.scenes]);

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
    const existingDraftScenes = project.scenes
      .filter((scene) => scene.source === "draft")
      .sort((a, b) => a.order - b.order);
    const baseScenes = project.scenes
      .filter((scene) => scene.source !== "draft")
      .sort((a, b) => a.order - b.order);
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
    let insertIndex = baseScenes.length;
    if (sectionPlacement !== "append" && placementSceneId) {
      const targetIndex = baseScenes.findIndex((scene) => scene.sceneId === placementSceneId);
      if (targetIndex >= 0) insertIndex = sectionPlacement === "before" ? targetIndex : targetIndex + 1;
    }
    const scenes = [
      ...baseScenes.slice(0, insertIndex),
      ...nextDraftVersions.map((item) => item.scene),
      ...baseScenes.slice(insertIndex),
    ].map((scene, index) => ({ ...scene, order: index + 1 }));
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
    setActiveStartedAt(Date.now());
    if (nextElement) setElement(nextElement);
  };

  const undoLastBlock = () => {
    const lastBlock = project.drafts.at(-1);
    if (!lastBlock) return;
    applyDraft(project.drafts.slice(0, -1));
    setActiveText(lastBlock.text);
    if (project.writingMode === "script" && lastBlock.element !== "General Text") setElement(lastBlock.element);
    setActiveStartedAt(Date.now());
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const normalizeInput = (value: string) => {
    if (element === "Scene Heading" || element === "Character" || element === "Transition") return value.toUpperCase();
    return value;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && (key === "z" || key === "x") && activeText.length === 0 && project.drafts.length > 0) {
      event.preventDefault();
      undoLastBlock();
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
    if (event.key === "Backspace") {
      const selection = event.currentTarget.selectionStart;
      if (selection === 0 && activeText.length === 0) event.preventDefault();
    }
  };

  const recentBlocks = useMemo(() => {
    if (visibility === "previousScene" && project.writingMode === "script") {
      const lastSceneIndex = project.drafts.findLastIndex((block) => block.element === "Scene Heading");
      return project.drafts.slice(Math.max(lastSceneIndex, 0));
    }
    if (visibility === "previousChapter" && project.writingMode === "freewrite") {
      const lastChapterIndex = project.drafts.findLastIndex((block) => block.element === "Chapter Heading");
      return project.drafts.slice(Math.max(lastChapterIndex, 0));
    }
    return project.drafts.slice(-visibleCount(visibility));
  }, [project.drafts, project.writingMode, visibility]);

  const shouldFade = fadeTiming !== "nextBlock" && clock - activeStartedAt >= fadeDelay(fadeTiming);
  const draftWords = countWords(project.drafts.map((block) => block.text).join(" "));
  const liveElement = project.writingMode === "script" ? element : element === "Chapter Heading" ? "Chapter Heading" : "General Text";
  const suggestions = project.writingMode === "script" ? elementSuggestions(element, activeText, project) : [];
  const writeVisibilityOptions = visibilityOptions.filter((option) => {
    if (project.writingMode === "script") return option.value !== "previousBlock" && option.value !== "previousChapter";
    return option.value !== "previousScene";
  });
  const sectionName = project.writingMode === "script" ? "scene" : "chapter";
  const sortedScenes = [...project.scenes].sort((a, b) => a.order - b.order);
  const placementTargets = sortedScenes.filter((scene) => scene.source !== "draft");

  return (
    <section className="mode-panel write-panel">
      <div className="mode-workspace write-workspace">
        <main className="document-stage">
          <div className="mode-status">
            <div>
              <span>Write</span>
              <strong>{draftWords + countWords(activeText)} words</strong>
            </div>
            <span className="mode-badge">{project.writingMode === "script" ? "Script project" : "Freewriting project"}</span>
          </div>

          <div className="page-shell write-shell">
            <article className="script-page write-page" onClick={() => inputRef.current?.focus()}>
              <div className="locked-draft" aria-label="Recent draft text">
                {recentBlocks.map((block, index) => (
                  <div
                    className={`script-line ${elementClass(block.element)} ${
                      visibility !== "previousScene" && (index < recentBlocks.length - 1 || shouldFade) ? "faded" : ""
                    }`}
                    key={block.blockId}
                  >
                    <span>{blockToFountain(block)}</span>
                  </div>
                ))}
              </div>
              <div className={`active-writing-line script-line ${elementClass(liveElement)}`}>
                <textarea
                  ref={inputRef}
                  value={activeText}
                  onChange={(event) => setActiveText(normalizeInput(event.target.value))}
                  onKeyDown={onKeyDown}
                  placeholder={project.writingMode === "script" ? element : element === "Chapter Heading" ? "Chapter title" : "Start typing"}
                  spellCheck
                  rows={1}
                  aria-label="Script page editor"
                  name="script-page-editor"
                />
                {suggestions.length > 0 && (
                  <div className="scene-autocomplete" aria-label="Scene heading suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setActiveText(suggestion);
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

          <section className="tool-section">
            <h3>{project.writingMode === "script" ? "New Scene Placement" : "New Chapter Placement"}</h3>
            <label>
              Write as
              <select
                name="section-placement"
                value={sectionPlacement}
                onChange={(event) => setSectionPlacement(event.target.value as InsertPlacement)}
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
                        ? `${scene.heading} #${scene.order}`
                        : `Chapter ${scene.order}: ${scene.heading}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>

          <section className="tool-section">
            <h3>Text Window</h3>
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

          {project.writingMode === "script" ? (
            <section className="tool-section">
              <h3>Script Element</h3>
              <div className="element-grid" role="toolbar" aria-label="Screenplay element toolbar">
                {scriptElements.map((item) => (
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
          ) : (
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
            <h3>Line Actions</h3>
            <button className="tool-wide-button" onClick={undoLastBlock} disabled={project.drafts.length === 0}>
              Undo Last Line
            </button>
          </section>

          <section className="tool-section">
            <h3>History</h3>
            <div className="icon-button-row">
              <button aria-label="Undo" title="Undo" onClick={onUndo} disabled={!canUndo}>↶</button>
              <button aria-label="Redo" title="Redo" onClick={onRedo} disabled={!canRedo}>↷</button>
            </div>
          </section>

          <footer className="tools-stats" aria-label="Project status">
            <span><span className="saved-dot" /> Saved</span>
            <span>{stats.words} words</span>
            <span>{stats.pages} page{stats.pages === 1 ? "" : "s"}</span>
          </footer>
        </aside>
      </div>
    </section>
  );
}
