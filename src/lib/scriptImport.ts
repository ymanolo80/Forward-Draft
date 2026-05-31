import type { DraftBlock, Project, Scene, SceneVersion, ScriptElement, WritingMode } from "../types";
import { createId, nowIso } from "./ids";

export interface ImportedScriptProject {
  project: Project;
  versions: SceneVersion[];
}

interface ImportedSection {
  heading: string;
  text: string;
}

const sceneHeadingPattern =
  /^\s*(?:(?:INT|EXT|EST|I\/E|INT\/EXT|EXT\/INT|INT\.\/EXT|EXT\.\/INT)[\s./]|\.{1}(?!\.)\S)/i;

function fileTitle(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Imported Script"
  );
}

function normalizeText(content: string) {
  return content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function cleanSceneHeading(line: string) {
  return line
    .trim()
    .replace(/^\.(?!\.)/, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+#.+?#\s*$/, "")
    .trim()
    .toUpperCase();
}

function isSceneHeading(line: string) {
  return sceneHeadingPattern.test(line.trim());
}

function createProjectFromSections(
  title: string,
  writingMode: WritingMode,
  sections: ImportedSection[],
  options: { writtenBy?: string; contact?: string; date?: string; drafts?: DraftBlock[] } = {},
): ImportedScriptProject {
  const projectId = createId("project");
  const createdAt = nowIso();
  const scenes: Scene[] = [];
  const versions: SceneVersion[] = [];

  sections.forEach((section, index) => {
    const sceneId = createId("scene");
    const versionId = createId("version");
    scenes.push({
      sceneId,
      projectId,
      heading: section.heading,
      order: index + 1,
      currentVersionId: versionId,
      status: "For Review",
      createdAt,
      updatedAt: createdAt,
    });
    versions.push({
      versionId,
      sceneId,
      versionNumber: 1,
      text: section.text,
      createdAt,
      isCurrent: true,
    });
  });

  return {
    project: {
      projectId,
      title,
      writingMode,
      createdAt,
      updatedAt: createdAt,
      coverPage: {
        title,
        writtenBy: options.writtenBy ?? "",
        contact: options.contact ?? "",
        date: options.date ?? createdAt.slice(0, 10),
      },
      drafts: options.drafts ?? [],
      scenes,
    },
    versions,
  };
}

function splitScriptSections(lines: string[]): ImportedSection[] {
  const sections: ImportedSection[] = [];
  let currentLines: string[] = [];
  let currentHeading = "UNTITLED SCENE";
  let hasSeenSceneHeading = false;

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (!text) {
      currentLines = [];
      return;
    }
    sections.push({ heading: currentHeading, text });
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (isSceneHeading(line)) {
      const preamble = !hasSeenSceneHeading && currentLines.some((item) => item.trim()) ? currentLines : [];
      if (preamble.length === 0) flush();
      currentHeading = cleanSceneHeading(line);
      currentLines = preamble.length > 0 ? [currentHeading, "", ...preamble] : [currentHeading];
      hasSeenSceneHeading = true;
      continue;
    }
    currentLines.push(line);
  }

  flush();
  return sections;
}

function txtTitlePage(lines: string[], fallbackTitle: string) {
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  const writtenByIndex = nonEmpty.findIndex((line) => /^written by$/i.test(line));
  return {
    title: nonEmpty[0] && !isSceneHeading(nonEmpty[0]) ? nonEmpty[0] : fallbackTitle,
    writtenBy: writtenByIndex >= 0 ? nonEmpty[writtenByIndex + 1] ?? "" : "",
  };
}

function chapterHeading(line: string) {
  const trimmed = line.trim();
  if (/^(chapter|part)\s+[\w\d]+(?:\s*[:.-]\s*.*|.*)$/i.test(trimmed)) return trimmed;
  return undefined;
}

function splitFreewriteSections(lines: string[]): ImportedSection[] {
  const sections: ImportedSection[] = [];
  let currentLines: string[] = [];
  let currentHeading = "Imported Text";

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (!text) {
      currentLines = [];
      return;
    }
    sections.push({ heading: currentHeading, text });
    currentLines = [];
  };

  for (const line of lines) {
    const heading = chapterHeading(line);
    if (heading) {
      flush();
      currentHeading = heading;
      currentLines = [heading];
      continue;
    }
    currentLines.push(line.trimEnd());
  }

  flush();
  return sections.length ? sections : [{ heading: currentHeading, text: lines.join("\n").trim() }];
}

function plainTextDrafts(sections: ImportedSection[]) {
  const createdAt = nowIso();
  return sections.flatMap((section) => {
    const blocks: DraftBlock[] = [
      {
        blockId: createId("block"),
        element: "Chapter Heading",
        text: section.heading,
        createdAt,
      },
    ];
    const body = section.text.replace(section.heading, "").trim();
    if (body) {
      blocks.push({
        blockId: createId("block"),
        element: "General Text",
        text: body,
        createdAt,
      });
    }
    return blocks;
  });
}

export function importTxtProject(fileName: string, content: string): ImportedScriptProject {
  const normalized = normalizeText(content);
  if (!normalized.trim()) throw new Error("This TXT file is empty.");

  const title = fileTitle(fileName);
  const lines = normalized.split("\n");
  const firstSceneIndex = lines.findIndex(isSceneHeading);
  if (firstSceneIndex >= 0) {
    const titlePage = txtTitlePage(lines.slice(0, firstSceneIndex), title);
    const scriptSections = splitScriptSections(lines.slice(firstSceneIndex));
    if (scriptSections.length > 0) {
      return createProjectFromSections(titlePage.title, "script", scriptSections, { writtenBy: titlePage.writtenBy });
    }
  }

  const freewriteSections = splitFreewriteSections(lines);
  return createProjectFromSections(title, "freewrite", freewriteSections, { drafts: plainTextDrafts(freewriteSections) });
}

function fdxText(paragraph: Element) {
  const textNodes = Array.from(paragraph.querySelectorAll("Text"));
  const text = textNodes.length
    ? textNodes.map((node) => node.textContent ?? "").join("")
    : paragraph.textContent ?? "";
  return text.replace(/\s+\n/g, "\n").trim();
}

function fdxElementLine(type: string, text: string) {
  if (type === "Scene Heading" || type === "Character" || type === "Transition") return text.toUpperCase();
  if (type === "Parenthetical" && text && !text.startsWith("(")) return `(${text})`;
  return text;
}

function fdxTitlePage(doc: XMLDocument, fallbackTitle: string) {
  const titlePage = doc.querySelector("TitlePage");
  if (!titlePage) return { title: fallbackTitle, writtenBy: "" };
  const paragraphs = Array.from(titlePage.querySelectorAll("Paragraph"))
    .map((paragraph) => ({ type: paragraph.getAttribute("Type") ?? "", text: fdxText(paragraph) }))
    .filter((paragraph) => paragraph.text);
  const title = paragraphs.find((paragraph) => /title/i.test(paragraph.type))?.text || paragraphs[0]?.text || fallbackTitle;
  const authorIndex = paragraphs.findIndex((paragraph) => /author|written by/i.test(paragraph.type) || /written by/i.test(paragraph.text));
  const writtenBy = authorIndex >= 0 ? paragraphs[authorIndex + 1]?.text ?? "" : "";
  return { title, writtenBy };
}

export function importFdxProject(fileName: string, content: string): ImportedScriptProject {
  const normalized = normalizeText(content);
  if (!normalized.trim()) throw new Error("This Final Draft file is empty.");

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalized, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("This Final Draft file could not be read as XML.");

  const titlePage = fdxTitlePage(doc, fileTitle(fileName));
  const contentNode = Array.from(doc.querySelectorAll("Content")).find((node) => !node.closest("TitlePage"));
  const paragraphs = Array.from((contentNode ?? doc).querySelectorAll("Paragraph"))
    .filter((paragraph) => !paragraph.closest("TitlePage"))
    .map((paragraph) => ({
      type: paragraph.getAttribute("Type") ?? "",
      text: fdxText(paragraph),
    }))
    .filter((paragraph) => paragraph.text);

  if (paragraphs.length === 0) throw new Error("This Final Draft file does not contain script text.");

  const sections: ImportedSection[] = [];
  let currentLines: string[] = [];
  let currentHeading = "UNTITLED SCENE";
  let hasSeenSceneHeading = false;

  const flush = () => {
    const text = currentLines.join("\n\n").trim();
    if (!text) {
      currentLines = [];
      return;
    }
    sections.push({ heading: currentHeading, text });
    currentLines = [];
  };

  for (const paragraph of paragraphs) {
    const line = fdxElementLine(paragraph.type, paragraph.text);
    if (paragraph.type === "Scene Heading" || isSceneHeading(line)) {
      const preamble = !hasSeenSceneHeading && currentLines.some((item) => item.trim()) ? currentLines : [];
      if (preamble.length === 0) flush();
      currentHeading = cleanSceneHeading(line);
      currentLines = preamble.length > 0 ? [currentHeading, ...preamble] : [currentHeading];
      hasSeenSceneHeading = true;
      continue;
    }
    currentLines.push(line);
  }

  flush();
  if (sections.length === 0) {
    sections.push({
      heading: "UNTITLED SCENE",
      text: paragraphs.map((paragraph) => fdxElementLine(paragraph.type, paragraph.text)).join("\n\n"),
    });
  }

  return createProjectFromSections(titlePage.title, "script", sections, { writtenBy: titlePage.writtenBy });
}
