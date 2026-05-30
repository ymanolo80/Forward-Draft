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

interface FountainTitlePage {
  title?: string;
  writtenBy?: string;
  contact?: string;
  date?: string;
  consumedLines: number;
}

interface FountainImportResult {
  project: Project;
  versions: SceneVersion[];
}

const titlePageKeys = new Set([
  "title",
  "credit",
  "author",
  "authors",
  "source",
  "draft date",
  "date",
  "contact",
  "copyright",
]);

const sceneHeadingPattern =
  /^\s*(?:\.{1}(?!\.)\S|(?:INT|EXT|EST|I\/E|INT\/EXT|EXT\/INT|INT\.\/EXT|EXT\.\/INT)[\s./])/i;

function fileTitle(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Imported Script"
  );
}

function normalizedTitleKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseFountainTitlePage(lines: string[]): FountainTitlePage {
  const fields = new Map<string, string[]>();
  let currentKey = "";
  let consumedLines = 0;
  let foundField = false;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const match = raw.match(/^([A-Za-z][A-Za-z0-9 _-]{0,40}):\s*(.*)$/);
    const key = match ? normalizedTitleKey(match[1]) : "";

    if (match && titlePageKeys.has(key)) {
      foundField = true;
      currentKey = key;
      const value = match[2].trim();
      if (!fields.has(currentKey)) fields.set(currentKey, []);
      if (value) fields.get(currentKey)!.push(value);
      consumedLines = index + 1;
      continue;
    }

    if (foundField && currentKey && (/^\s+/.test(raw) || raw.trim() === "")) {
      const value = raw.trim();
      if (value) fields.get(currentKey)!.push(value);
      consumedLines = index + 1;
      continue;
    }

    if (!foundField && raw.trim() === "") {
      consumedLines = index + 1;
      continue;
    }

    break;
  }

  const pick = (...keys: string[]) =>
    keys
      .flatMap((key) => fields.get(key) ?? [])
      .join("\n")
      .trim() || undefined;

  return {
    title: pick("title"),
    writtenBy: pick("author", "authors"),
    contact: pick("contact"),
    date: pick("draft date", "date"),
    consumedLines: foundField ? consumedLines : 0,
  };
}

function cleanFountainSceneHeading(line: string) {
  return line
    .trim()
    .replace(/^\.(?!\.)/, "")
    .replace(/\s+#.+?#\s*$/, "")
    .trim()
    .toUpperCase();
}

function isFountainSceneHeading(line: string) {
  return sceneHeadingPattern.test(line.trim());
}

export function importFountainProject(fileName: string, content: string): FountainImportResult {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) throw new Error("This Fountain file is empty.");

  const lines = normalized.split("\n");
  const titlePage = parseFountainTitlePage(lines);
  const scriptLines = lines.slice(titlePage.consumedLines);
  const projectId = createId("project");
  const createdAt = nowIso();
  const title = titlePage.title || fileTitle(fileName);
  const scenes: Scene[] = [];
  const versions: SceneVersion[] = [];
  let currentLines: string[] = [];
  let currentHeading = "UNTITLED SCENE";

  const flushScene = () => {
    const text = currentLines.join("\n").trim();
    if (!text) {
      currentLines = [];
      return;
    }

    const sceneId = createId("scene");
    const versionId = createId("version");
    scenes.push({
      sceneId,
      projectId,
      heading: currentHeading,
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
    currentLines = [];
  };

  for (const rawLine of scriptLines) {
    const line = rawLine.trimEnd();
    if (isFountainSceneHeading(line)) {
      const preamble = scenes.length === 0 && currentLines.some((item) => item.trim())
        ? currentLines
        : [];
      if (preamble.length === 0) flushScene();
      currentHeading = cleanFountainSceneHeading(line);
      currentLines = preamble.length > 0 ? [currentHeading, "", ...preamble] : [currentHeading];
      continue;
    }
    currentLines.push(line);
  }

  flushScene();

  if (scenes.length === 0) {
    const fallbackText = scriptLines.join("\n").trim();
    if (!fallbackText) throw new Error("This Fountain file does not contain script text.");
    const sceneId = createId("scene");
    const versionId = createId("version");
    scenes.push({
      sceneId,
      projectId,
      heading: currentHeading,
      order: 1,
      currentVersionId: versionId,
      status: "For Review",
      createdAt,
      updatedAt: createdAt,
    });
    versions.push({
      versionId,
      sceneId,
      versionNumber: 1,
      text: fallbackText,
      createdAt,
      isCurrent: true,
    });
  }

  return {
    project: {
      projectId,
      title,
      writingMode: "script",
      createdAt,
      updatedAt: createdAt,
      coverPage: {
        title,
        writtenBy: titlePage.writtenBy ?? "",
        contact: titlePage.contact ?? "",
        date: titlePage.date ?? createdAt.slice(0, 10),
      },
      drafts: [],
      scenes,
    },
    versions,
  };
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
