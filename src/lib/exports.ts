import jsPDF from "jspdf";
import type { AppData, CoverPage, Project, ReviewNote, Scene, SceneVersion } from "../types";
import { savePortableFile, type FileSaveResult } from "./fileService";
import { PROJECT_FILE_MIME, projectFileName, serializeProjectFile } from "./projectFile";
import { parseScreenplayText, type ScreenplayTextBlock } from "./screenplay";

export type ProjectFileSaveResult = FileSaveResult;

export async function exportProjectFile(project: Project, data: AppData): Promise<ProjectFileSaveResult> {
  return savePortableFile(
    {
      name: projectFileName(project),
      mimeType: PROJECT_FILE_MIME,
      content: serializeProjectFile(project, data),
    },
    {
      description: "Forward Draft project",
      accept: {
        [PROJECT_FILE_MIME]: [".frdx"],
      },
    },
  );
}

function safeFileStem(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim() || "Untitled Draft";
}

function coverPageFor(project: Project): CoverPage {
  return {
    title: project.coverPage?.title || project.title,
    writtenBy: project.coverPage?.writtenBy ?? "",
    contact: project.coverPage?.contact ?? "",
    date: project.coverPage?.date || project.createdAt.slice(0, 10),
  };
}

function currentScenes(project: Project, data: AppData) {
  return [...project.scenes]
    .sort((a, b) => a.order - b.order)
    .map((scene) => ({
      scene,
      version: data.versions.find((version) => version.versionId === scene.currentVersionId),
    }))
    .filter((item): item is { scene: Scene; version: SceneVersion } => Boolean(item.version));
}

function fullScript(project: Project, data: AppData) {
  return currentScenes(project, data)
    .map(({ version }) => version.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function coverText(project: Project) {
  const cover = coverPageFor(project);
  return [
    cover.title.toUpperCase(),
    "",
    "Written by",
    cover.writtenBy,
    "",
    "Contact:",
    cover.contact,
    "",
    cover.date,
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");
}

function fountainCover(project: Project) {
  const cover = coverPageFor(project);
  const lines = [`Title: ${cover.title}`, "Credit: Written by"];
  if (cover.writtenBy.trim()) lines.push(`Author: ${cover.writtenBy}`);
  if (cover.contact.trim()) {
    lines.push("Contact:");
    cover.contact.split("\n").forEach((line) => lines.push(`    ${line}`));
  }
  if (cover.date.trim()) lines.push(`Draft date: ${cover.date}`);
  return `${lines.join("\n")}\n\n`;
}

function hasUnicodeText(text: string) {
  return /[^\u0000-\u00ff]/.test(text);
}

function wrapUnicodeText(pdf: jsPDF, text: string, width: number) {
  if (!hasUnicodeText(text)) return pdf.splitTextToSize(text, width) as string[];
  const averageCharWidth = pdf.getFontSize() * 0.3528 * 0.56;
  const maxChars = Math.max(8, Math.floor(width / averageCharWidth));
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = `${line}${word}`;
    if (line.trim() && next.length > maxChars) {
      lines.push(line.trimEnd());
      line = word.trimStart();
    } else {
      line = next;
    }
  });
  if (line.trim()) lines.push(line.trimEnd());
  return lines.length ? lines : [" "];
}

function drawUnicodeLine(pdf: jsPDF, text: string, x: number, y: number, options: { align?: "left" | "center" | "right" } = {}) {
  if (!hasUnicodeText(text) || typeof document === "undefined") {
    pdf.text(text, x, y, options);
    return;
  }

  const scale = 3;
  const fontSize = pdf.getFontSize();
  const fontPx = Math.ceil((fontSize * 96 * scale) / 72);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    pdf.text(text, x, y, options);
    return;
  }
  context.font = `${fontPx}px "Courier New", Menlo, monospace`;
  const metrics = context.measureText(text || " ");
  canvas.width = Math.max(2, Math.ceil(metrics.width + 8 * scale));
  canvas.height = Math.ceil(fontPx * 1.45);
  context.font = `${fontPx}px "Courier New", Menlo, monospace`;
  context.fillStyle = "#141414";
  context.textBaseline = "alphabetic";
  context.fillText(text || " ", 4 * scale, fontPx);

  const widthMm = (canvas.width / scale) * (25.4 / 96);
  const heightMm = (canvas.height / scale) * (25.4 / 96);
  const left = options.align === "center" ? x - widthMm / 2 : options.align === "right" ? x - widthMm : x;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", left, y - heightMm * 0.74, widthMm, heightMm);
}

function drawPdfText(
  pdf: jsPDF,
  text: string | string[],
  x: number,
  y: number,
  options: { align?: "left" | "center" | "right"; maxWidth?: number } = {},
) {
  const lines = Array.isArray(text) ? text : String(text).split("\n");
  const lineHeight = pdf.getFontSize() * 0.3528 * 1.18;
  lines.forEach((line, index) => drawUnicodeLine(pdf, line || " ", x, y + index * lineHeight, options));
}

function pdfTextWidth(pdf: jsPDF, text: string) {
  if (!hasUnicodeText(text)) return pdf.getTextWidth(text);
  return text.length * pdf.getFontSize() * 0.3528 * 0.56;
}

export function exportText(project: Project, data: AppData) {
  return savePortableFile(
    {
      name: `${safeFileStem(project.title)}.txt`,
      mimeType: "text/plain",
      content: `${coverText(project)}\n\n\n${fullScript(project, data)}`,
    },
    {
      description: "Plain text",
      accept: {
        "text/plain": [".txt"],
      },
    },
  );
}

export function exportFountainFile(project: Project, data: AppData) {
  return savePortableFile(
    {
      name: `${safeFileStem(project.title)}.fountain`,
      mimeType: "text/plain",
      content: `${fountainCover(project)}${fullScript(project, data)}`,
    },
    {
      description: "Fountain screenplay",
      accept: {
        "text/plain": [".fountain"],
      },
    },
  );
}

function drawCoverPage(pdf: jsPDF, project: Project) {
  const cover = coverPageFor(project);
  pdf.setFont("courier", "normal");
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(20);
  drawPdfText(pdf, cover.title.toUpperCase(), 105, 104, { align: "center", maxWidth: 156 });
  pdf.setFontSize(11);
  drawPdfText(pdf, "Written by", 105, 124, { align: "center" });
  if (cover.writtenBy.trim()) drawPdfText(pdf, cover.writtenBy, 105, 136, { align: "center", maxWidth: 140 });
  pdf.setFontSize(9);
  if (cover.contact.trim()) drawPdfText(pdf, cover.contact.split("\n"), 24, 260, { maxWidth: 72 });
  if (cover.date.trim()) drawPdfText(pdf, cover.date, 186, 272, { align: "right" });
}

function cleanBlockLayout(block: ScreenplayTextBlock) {
  if (block.element === "Scene Heading") return { x: 36, width: 138, align: "left" as const, gap: block.hasGapBefore ? 8 : 0 };
  if (block.element === "Character") return { x: 83, width: 48, align: "center" as const, gap: block.hasGapBefore ? 8 : 5 };
  if (block.element === "Dialogue") return { x: 58, width: 86, align: "left" as const, gap: 0 };
  if (block.element === "Parenthetical") return { x: 72, width: 62, align: "left" as const, gap: 0 };
  if (block.element === "Transition") return { x: 122, width: 54, align: "right" as const, gap: block.hasGapBefore ? 8 : 5 };
  return { x: 36, width: 138, align: "left" as const, gap: block.hasGapBefore ? 8 : 5 };
}

function addCleanScript(pdf: jsPDF, project: Project, data: AppData) {
  pdf.addPage();
  pdf.setFont("courier", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(20, 20, 20);
  let y = 22;
  const lineHeight = 5.2;
  const bottom = 276;

  const ensureRoom = (needed = lineHeight) => {
    if (y + needed <= bottom) return;
    pdf.addPage();
    y = 22;
  };

  for (const { scene, version } of currentScenes(project, data)) {
    const blocks = parseScreenplayText(version.text.trim());
    blocks.forEach((block) => {
      const layout = cleanBlockLayout(block);
      y += layout.gap;
      ensureRoom();

      if (block.element === "Scene Heading") {
        pdf.text(String(scene.order), 24, y, { align: "right" });
      }

      const lines = wrapUnicodeText(pdf, block.text.trim() || " ", layout.width);
      lines.forEach((line) => {
        ensureRoom();
        drawPdfText(pdf, line || " ", layout.x, y, { align: layout.align, maxWidth: layout.width });
        y += lineHeight;
      });
    });
    y += lineHeight;
  }
}

function sceneNotes(scene: Scene, data: AppData) {
  return data.notes
    .filter((note) => note.sceneId === scene.sceneId)
    .sort((a, b) => a.rangeStart - b.rangeStart || a.createdAt.localeCompare(b.createdAt));
}

function noteCardText(note: ReviewNote) {
  const selected = note.selectedText ? `"${note.selectedText}"` : "Scene note";
  return [selected, note.noteText || "No note"].join("\n");
}

interface AnnotatedRow {
  text: string;
  element: ScreenplayTextBlock["element"];
  rangeStart: number;
  rangeEnd: number;
  x: number;
  width: number;
  align: "left" | "center" | "right";
  gap: number;
}

function annotatedBlockLayout(block: ScreenplayTextBlock) {
  const gap = block.hasGapBefore ? 8 : block.element === "Character" || block.element === "Transition" ? 5 : 0;
  if (block.element === "Scene Heading") return { x: 34, width: 114, align: "left" as const, gap };
  if (block.element === "Character") return { x: 88, width: 44, align: "center" as const, gap };
  if (block.element === "Dialogue") return { x: 56, width: 86, align: "left" as const, gap };
  if (block.element === "Parenthetical") return { x: 68, width: 58, align: "left" as const, gap };
  if (block.element === "Transition") return { x: 140, width: 38, align: "right" as const, gap };
  return { x: 34, width: 114, align: "left" as const, gap: block.hasGapBefore ? 8 : 5 };
}

function layoutAnnotatedRows(pdf: jsPDF, text: string): AnnotatedRow[] {
  const rows: AnnotatedRow[] = [];
  parseScreenplayText(text).forEach((block) => {
    const layout = annotatedBlockLayout(block);
    const displayText = block.text.trim() || " ";
    const leadingOffset = block.text.indexOf(displayText.trim()) >= 0 ? block.text.indexOf(displayText.trim()) : 0;
    const wrapped = wrapUnicodeText(pdf, displayText, layout.width);
    let cursor = 0;
    wrapped.forEach((part, index) => {
      const partIndex = displayText.indexOf(part, cursor);
      const start = partIndex >= 0 ? partIndex : cursor;
      const end = start + part.length;
      rows.push({
        text: part,
        element: block.element,
        rangeStart: block.rangeStart + leadingOffset + start,
        rangeEnd: block.rangeStart + leadingOffset + end,
        x: layout.x,
        width: layout.width,
        align: layout.align,
        gap: index === 0 ? layout.gap : 0,
      });
      cursor = end;
    });
  });
  return rows;
}

function clampRange(start: number, end: number, length: number) {
  const safeStart = Math.max(0, Math.min(start, length));
  const safeEnd = Math.max(safeStart, Math.min(end, length));
  return { start: safeStart, end: safeEnd };
}

function exactSelectedSpan(note: ReviewNote, text: string) {
  if (!note.selectedText) return undefined;
  const expected = clampRange(note.rangeStart, note.rangeEnd, text.length);
  if (text.slice(expected.start, expected.end) === note.selectedText) return expected;
  const index = text.indexOf(note.selectedText);
  if (index < 0) return undefined;
  return { start: index, end: index + note.selectedText.length };
}

function contextEndInNewText(beforeContext: string, text: string) {
  if (!beforeContext) return 0;
  const maxLength = Math.min(beforeContext.length, 80);
  for (let length = maxLength; length >= 8; length -= 1) {
    const fragment = beforeContext.slice(-length);
    const index = text.indexOf(fragment);
    if (index >= 0) return index + fragment.length;
  }
  return undefined;
}

function contextStartInNewText(afterContext: string, text: string, from: number) {
  if (!afterContext) return text.length;
  const maxLength = Math.min(afterContext.length, 80);
  for (let length = maxLength; length >= 8; length -= 1) {
    const fragment = afterContext.slice(0, length);
    const index = text.indexOf(fragment, from);
    if (index >= 0) return index;
  }
  return undefined;
}

function mappedNoteAnchor(note: ReviewNote, oldText: string | undefined, currentText: string, currentVersionId: string) {
  if (note.versionId === currentVersionId) {
    const direct = clampRange(note.rangeStart, note.rangeEnd, currentText.length);
    if (direct.end > direct.start) return { span: direct };
  }

  if (oldText) {
    const oldRange = clampRange(note.rangeStart, note.rangeEnd, oldText.length);
    const beforeContext = oldText.slice(Math.max(0, oldRange.start - 80), oldRange.start);
    const afterContext = oldText.slice(oldRange.end, Math.min(oldText.length, oldRange.end + 80));
    const newStart = contextEndInNewText(beforeContext, currentText);
    if (newStart !== undefined) {
      const newEnd = contextStartInNewText(afterContext, currentText, newStart);
      if (newEnd !== undefined && newEnd >= newStart) {
        if (newEnd > newStart) return { span: { start: newStart, end: newEnd } };
        return { deletionAt: newStart };
      }
    }
  }

  const exact = exactSelectedSpan(note, currentText);
  if (exact && exact.end > exact.start) return { span: exact };
  return undefined;
}

function rowTextLeft(pdf: jsPDF, row: AnnotatedRow) {
  const width = pdfTextWidth(pdf, row.text);
  if (row.align === "center") return row.x - width / 2;
  if (row.align === "right") return row.x - width;
  return row.x;
}

function basicChangeAnchor(oldText: string | undefined, currentText: string) {
  if (!oldText || oldText === currentText) return undefined;
  let prefix = 0;
  while (prefix < oldText.length && prefix < currentText.length && oldText[prefix] === currentText[prefix]) prefix += 1;
  let oldSuffix = oldText.length;
  let currentSuffix = currentText.length;
  while (oldSuffix > prefix && currentSuffix > prefix && oldText[oldSuffix - 1] === currentText[currentSuffix - 1]) {
    oldSuffix -= 1;
    currentSuffix -= 1;
  }
  const oldChanged = oldText.slice(prefix, oldSuffix).trim();
  const newChanged = currentText.slice(prefix, currentSuffix).trim();
  if (newChanged) {
    const start = currentText.indexOf(newChanged, prefix);
    if (start >= 0) {
      return {
        text: [`"${oldChanged || "Added text"}"`, "Changed in rewrite"].join("\n"),
        span: { start, end: start + newChanged.length },
      };
    }
  }
  if (oldChanged) return { text: [`"${oldChanged}"`, "Deleted in rewrite"].join("\n"), deletionAt: prefix };
  return undefined;
}

interface ChangeAnchor {
  text: string;
  span?: { start: number; end: number };
  deletionAt?: number;
}

function wordTokens(text: string) {
  return [...text.matchAll(/\S+/g)].map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function compactQuoted(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > 120 ? `${normalized.slice(0, 117).trim()}...` : normalized;
}

function changeCardText(oldText: string, hasNewText: boolean) {
  const oldLine = compactQuoted(oldText);
  if (oldLine) return [`"${oldLine}"`, hasNewText ? "Changed in rewrite" : "Deleted in rewrite"].join("\n");
  return "Added in rewrite";
}

function diffChangeAnchors(oldText: string | undefined, currentText: string): ChangeAnchor[] {
  if (!oldText || oldText === currentText) return [];
  const oldWords = wordTokens(oldText);
  const currentWords = wordTokens(currentText);
  if (!oldWords.length || !currentWords.length || oldWords.length * currentWords.length > 2_000_000) {
    const fallback = basicChangeAnchor(oldText, currentText);
    return fallback ? [fallback] : [];
  }

  const columnCount = currentWords.length + 1;
  const lcs = new Uint16Array((oldWords.length + 1) * columnCount);
  for (let oldIndex = 1; oldIndex <= oldWords.length; oldIndex += 1) {
    for (let currentIndex = 1; currentIndex <= currentWords.length; currentIndex += 1) {
      const offset = oldIndex * columnCount + currentIndex;
      if (oldWords[oldIndex - 1].text === currentWords[currentIndex - 1].text) {
        lcs[offset] = lcs[(oldIndex - 1) * columnCount + currentIndex - 1] + 1;
      } else {
        lcs[offset] = Math.max(lcs[(oldIndex - 1) * columnCount + currentIndex], lcs[oldIndex * columnCount + currentIndex - 1]);
      }
    }
  }

  const operations: Array<{ type: "same" | "delete" | "insert"; oldIndex?: number; currentIndex?: number }> = [];
  let oldIndex = oldWords.length;
  let currentIndex = currentWords.length;
  while (oldIndex > 0 || currentIndex > 0) {
    if (oldIndex > 0 && currentIndex > 0 && oldWords[oldIndex - 1].text === currentWords[currentIndex - 1].text) {
      operations.push({ type: "same", oldIndex: oldIndex - 1, currentIndex: currentIndex - 1 });
      oldIndex -= 1;
      currentIndex -= 1;
    } else if (
      currentIndex > 0 &&
      (oldIndex === 0 || lcs[oldIndex * columnCount + currentIndex - 1] >= lcs[(oldIndex - 1) * columnCount + currentIndex])
    ) {
      operations.push({ type: "insert", currentIndex: currentIndex - 1 });
      currentIndex -= 1;
    } else {
      operations.push({ type: "delete", oldIndex: oldIndex - 1 });
      oldIndex -= 1;
    }
  }
  operations.reverse();

  const anchors: ChangeAnchor[] = [];
  let cursor = 0;
  let lastCurrentEnd = 0;
  while (cursor < operations.length) {
    const operation = operations[cursor];
    if (operation.type === "same") {
      lastCurrentEnd = currentWords[operation.currentIndex ?? 0]?.end ?? lastCurrentEnd;
      cursor += 1;
      continue;
    }

    const deleted: number[] = [];
    const inserted: number[] = [];
    while (cursor < operations.length && operations[cursor].type !== "same") {
      const item = operations[cursor];
      if (item.type === "delete" && item.oldIndex !== undefined) deleted.push(item.oldIndex);
      if (item.type === "insert" && item.currentIndex !== undefined) inserted.push(item.currentIndex);
      cursor += 1;
    }

    const oldStart = deleted.length ? oldWords[Math.min(...deleted)].start : 0;
    const oldEnd = deleted.length ? oldWords[Math.max(...deleted)].end : oldStart;
    const oldChanged = oldText.slice(oldStart, oldEnd);
    if (inserted.length) {
      const start = currentWords[Math.min(...inserted)].start;
      const end = currentWords[Math.max(...inserted)].end;
      anchors.push({ text: changeCardText(oldChanged, true), span: { start, end } });
      lastCurrentEnd = end;
    } else if (deleted.length) {
      const nextSame = operations.slice(cursor).find((item) => item.type === "same" && item.currentIndex !== undefined);
      const deletionAt = lastCurrentEnd || (nextSame?.currentIndex !== undefined ? currentWords[nextSame.currentIndex].start : 0);
      anchors.push({ text: changeCardText(oldChanged, false), deletionAt });
    }
  }

  return anchors;
}

function anchorsOverlap(a: ChangeAnchor, b: ChangeAnchor) {
  if (a.span && b.span) return a.span.end > b.span.start && a.span.start < b.span.end;
  if (a.span && b.deletionAt !== undefined) return b.deletionAt >= a.span.start && b.deletionAt <= a.span.end;
  if (a.deletionAt !== undefined && b.span) return a.deletionAt >= b.span.start && a.deletionAt <= b.span.end;
  if (a.deletionAt !== undefined && b.deletionAt !== undefined) return Math.abs(a.deletionAt - b.deletionAt) <= 4;
  return false;
}

function rowAnchorX(pdf: jsPDF, row: AnnotatedRow, anchor: Pick<ChangeAnchor, "span" | "deletionAt">) {
  const textLeft = rowTextLeft(pdf, row);
  if (anchor.span) {
    const start = Math.max(0, anchor.span.start - row.rangeStart);
    const end = Math.min(row.text.length, anchor.span.end - row.rangeStart);
    const prefix = row.text.slice(0, start);
    const highlighted = row.text.slice(start, Math.max(start, end));
    return textLeft + pdfTextWidth(pdf, prefix) + pdfTextWidth(pdf, highlighted) / 2;
  }
  if (anchor.deletionAt !== undefined) {
    const position = Math.max(0, Math.min(row.text.length, anchor.deletionAt - row.rangeStart));
    return textLeft + pdfTextWidth(pdf, row.text.slice(0, position));
  }
  return textLeft;
}

function drawAnnotationCard(pdf: jsPDF, text: string, x: number, y: number, width: number) {
  const lines = wrapUnicodeText(pdf, text, width - 6);
  const height = Math.max(16, lines.length * 4 + 8);
  pdf.setDrawColor(151, 171, 183);
  pdf.setFillColor(255, 252, 242);
  pdf.roundedRect(x, y, width, height, 2, 2, "FD");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(44, 54, 64);
  drawPdfText(pdf, lines, x + 3, y + 6);
  return height;
}

function drawAnnotatedScene(
  pdf: jsPDF,
  sceneOrder: number,
  sceneText: string,
  notes: ReviewNote[],
  currentVersionId: string,
  oldVersionsById: Map<string, string>,
  baseVersionText?: string,
) {
  const scriptX = 34;
  const sceneNumberX = 27;
  const scriptY = 24;
  const scriptWidth = 114;
  const noteX = 160;
  const noteY = 18;
  const noteWidth = 32;
  const noteRailX = 155;
  const lineHeight = 5;
  const pageBottom = 272;
  pdf.setFont("courier", "normal");
  pdf.setFontSize(10);
  const rows = layoutAnnotatedRows(pdf, sceneText);
  const noteAnchors: ChangeAnchor[] = notes.flatMap((note) => {
    const anchor = mappedNoteAnchor(note, oldVersionsById.get(note.versionId), sceneText, currentVersionId);
    return anchor ? [{ text: noteCardText(note), ...anchor }] : [];
  });
  const changeAnchors = diffChangeAnchors(baseVersionText, sceneText).filter((change) => !noteAnchors.some((noteAnchor) => anchorsOverlap(change, noteAnchor)));
  noteAnchors.push(...changeAnchors);

  const pages: AnnotatedRow[][] = [[]];
  let pageY = scriptY;
  rows.forEach((row) => {
    const extraRoom = row.element === "Character" ? lineHeight * 2 : 0;
    if (pages.at(-1)!.length && pageY + row.gap + lineHeight + extraRoom > pageBottom) {
      pages.push([]);
      pageY = scriptY;
    }
    pages.at(-1)!.push(row);
    pageY += row.gap + lineHeight;
  });

  for (const pageRows of pages) {
    pdf.addPage();
    pdf.setFont("courier", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(20, 20, 20);
    const rowY = new Map<AnnotatedRow, number>();
    let y = scriptY;
    let sceneNumberDrawn = false;
    pageRows.forEach((row) => {
      y += row.gap;
      rowY.set(row, y);
      const rowHighlights = noteAnchors.filter(({ span }) => span && span.end > row.rangeStart && span.start < row.rangeEnd);
      rowHighlights.forEach(({ span }) => {
        if (!span) return;
        const start = Math.max(0, span.start - row.rangeStart);
        const end = Math.min(row.text.length, span.end - row.rangeStart);
        if (end <= start) return;
        const prefix = row.text.slice(0, start);
        const highlighted = row.text.slice(start, end);
        const textLeft = rowTextLeft(pdf, row);
        pdf.setFillColor(255, 244, 151);
        pdf.rect(
          textLeft + pdfTextWidth(pdf, prefix) - 0.6,
          y - 3.5,
          Math.max(1.4, pdfTextWidth(pdf, highlighted) + 1.2),
          4.6,
          "F",
        );
        pdf.setFillColor(244, 247, 248);
      });
      if (!sceneNumberDrawn && row.element === "Scene Heading") {
        pdf.text(String(sceneOrder), sceneNumberX, y, { align: "right" });
        sceneNumberDrawn = true;
      }
      drawPdfText(pdf, row.text || " ", row.x, y, { align: row.align, maxWidth: row.width });
      y += lineHeight;
    });

    const cards: { text: string; anchorX: number; anchorY: number }[] = [];
    noteAnchors
      .filter(({ span, deletionAt }) =>
        pageRows.some((row) =>
          span
            ? span.end > row.rangeStart && span.start < row.rangeEnd
            : deletionAt !== undefined && deletionAt >= row.rangeStart && deletionAt <= row.rangeEnd,
        ),
      )
      .forEach(({ text, span, deletionAt }) => {
        const row =
          pageRows.find((candidate) =>
            span
              ? span.start <= candidate.rangeEnd && span.end >= candidate.rangeStart
              : deletionAt !== undefined && deletionAt >= candidate.rangeStart && deletionAt <= candidate.rangeEnd,
          ) ?? pageRows[0];
        cards.push({
          text,
          anchorX: row ? rowAnchorX(pdf, row, { span, deletionAt }) : scriptX + scriptWidth,
          anchorY: row ? rowY.get(row) ?? scriptY : scriptY,
        });
      });

    if (cards.length) {
      pdf.setFillColor(244, 247, 248);
      pdf.setDrawColor(213, 222, 228);
      pdf.roundedRect(noteRailX, 18, 41, 258, 2, 2, "FD");
    }

    let cardY = noteY;
    cards.forEach((card) => {
      const height = drawAnnotationCard(pdf, card.text, noteX, cardY, noteWidth);
      pdf.setDrawColor(151, 171, 183);
      pdf.line(Math.min(card.anchorX + 2, noteRailX - 3), card.anchorY - 1, noteRailX, cardY + 6);
      cardY += height + 5;
    });
  }
}

function drawAnnotatedScript(pdf: jsPDF, project: Project, data: AppData, changesOnly = false) {
  const scenes = currentScenes(project, data).filter(({ scene, version }) => {
    if (!changesOnly) return true;
    return scene.status === "Rewritten" || version.versionNumber > 1;
  });

  if (changesOnly && scenes.length === 0) {
    pdf.addPage();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(76, 86, 98);
    pdf.text("No changed scenes in this project.", 24, 28);
    return;
  }

  for (const { scene, version } of scenes) {
    const notes = sceneNotes(scene, data);
    const oldVersionsById = new Map(data.versions.filter((item) => item.sceneId === scene.sceneId).map((item) => [item.versionId, item.text]));
    drawAnnotatedScene(
      pdf,
      scene.order,
      version.text,
      notes,
      version.versionId,
      oldVersionsById,
      version.basedOnVersionId ? oldVersionsById.get(version.basedOnVersionId) : undefined,
    );
  }
}

export function exportFullPdf(project: Project, data: AppData, revisionMarked = false) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  drawCoverPage(pdf, project);
  if (revisionMarked) drawAnnotatedScript(pdf, project, data, false);
  else addCleanScript(pdf, project, data);
  return savePortableFile(
    {
      name: `${safeFileStem(project.title)}${revisionMarked ? "-revision-notes" : ""}.pdf`,
      mimeType: "application/pdf",
      content: pdf.output("blob"),
    },
    {
      description: "PDF",
      accept: {
        "application/pdf": [".pdf"],
      },
    },
  );
}

export function exportChangesPdf(project: Project, data: AppData) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  drawCoverPage(pdf, project);
  drawAnnotatedScript(pdf, project, data, true);
  return savePortableFile(
    {
      name: `${safeFileStem(project.title)}-changes-only.pdf`,
      mimeType: "application/pdf",
      content: pdf.output("blob"),
    },
    {
      description: "PDF",
      accept: {
        "application/pdf": [".pdf"],
      },
    },
  );
}
