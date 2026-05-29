import type { DraftBlock, Project, Scene, SceneVersion, ScriptElement } from "../types";
import { createId, nowIso } from "./ids";

export const scriptElements: ScriptElement[] = [
  "Scene Heading",
  "Action",
  "Character",
  "Dialogue",
  "Parenthetical",
  "Transition",
  "Shot",
  "Note",
];

export function cycleElement(current: ScriptElement) {
  const index = scriptElements.indexOf(current);
  return scriptElements[(index + 1) % scriptElements.length];
}

export function inferNextElement(current: ScriptElement, text: string): ScriptElement {
  if (current === "Scene Heading") return "Action";
  if (current === "Chapter Heading") return "General Text";
  if (current === "Character") return "Dialogue";
  if (current === "Dialogue" && text.trim().length === 0) return "Action";
  if (current === "Parenthetical") return "Dialogue";
  if (current === "Transition") return "Scene Heading";
  if (current === "Note") return "Action";
  return current;
}

export function elementClass(element: ScriptElement) {
  return element.toLowerCase().replace(/\s+/g, "-");
}

export function blockToFountain(block: DraftBlock) {
  const text = block.text.trimEnd();
  if (!text) return "";
  if (block.element === "Scene Heading") return text.toUpperCase();
  if (block.element === "Character") return text.toUpperCase();
  if (block.element === "Transition") return `> ${text.toUpperCase()}`;
  if (block.element === "Shot") return `## ${text}`;
  if (block.element === "Chapter Heading") return text;
  if (block.element === "Note") return text.startsWith("[[") ? text : `[[${text}]]`;
  if (block.element === "Parenthetical") return text.startsWith("(") ? text : `(${text})`;
  return text;
}

export function exportFountain(project: Project, scenes: Scene[], versions: SceneVersion[]) {
  return scenes
    .sort((a, b) => a.order - b.order)
    .map((scene) => {
      const current = versions.find((version) => version.versionId === scene.currentVersionId);
      return current?.text.trim() ?? "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function draftBlocksToScenes(projectId: string, blocks: DraftBlock[], sectionLabel: "scene" | "chapter" = "scene") {
  const scenes: Scene[] = [];
  const versions: SceneVersion[] = [];
  let current: DraftBlock[] = [];
  let heading = sectionLabel === "chapter" ? "Untitled Chapter" : "UNTITLED SCENE";
  const headingElement = sectionLabel === "chapter" ? "Chapter Heading" : "Scene Heading";

  const flush = () => {
    if (!current.length) return;
    const sceneId = createId("scene");
    const versionId = createId("version");
    const text = current.map(blockToFountain).filter(Boolean).join("\n");
    const createdAt = nowIso();
    scenes.push({
      sceneId,
      projectId,
      heading,
      order: scenes.length + 1,
      currentVersionId: versionId,
      status: "For Review",
      createdAt,
      updatedAt: createdAt,
    });
    versions.push({
      versionId,
      sceneId,
      versionNumber: 1,
      text,
      createdAt,
      isCurrent: true,
    });
  };

  for (const block of blocks) {
    if (block.element === headingElement && current.length) {
      flush();
      current = [];
    }
    if (block.element === headingElement && block.text.trim()) {
      heading = sectionLabel === "chapter" ? block.text.trim() : block.text.trim().toUpperCase();
    }
    current.push(block);
  }
  flush();
  return { scenes, versions };
}

export function extractAutocomplete(blocks: DraftBlock[]) {
  const characters = new Set<string>();
  const locations = new Set<string>();
  const times = new Set<string>(["DAY", "NIGHT", "MORNING", "EVENING", "CONTINUOUS", "LATER"]);

  for (const block of blocks) {
    const value = block.text.trim();
    if (!value) continue;
    if (block.element === "Character") characters.add(value.toUpperCase());
    if (block.element === "Scene Heading") {
      const parts = value.split(" - ");
      if (parts[0]) locations.add(parts[0].replace(/^(INT\.|EXT\.|INT\/EXT\.)\s*/, "").trim().toUpperCase());
      if (parts[1]) times.add(parts[1].trim().toUpperCase());
    }
  }

  return [...characters, ...locations, ...times, ...scriptElements];
}
