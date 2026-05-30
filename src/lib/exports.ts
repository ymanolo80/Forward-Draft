import jsPDF from "jspdf";
import type { AppData, CoverPage, Project, ReviewNote, Scene, SceneVersion } from "../types";
import { PROJECT_FILE_MIME, projectFileName, serializeProjectFile } from "./projectFile";

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

type FileShareNavigator = Navigator & {
  canShare?: (data: { files: File[]; title?: string }) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
};

export type ProjectFileSaveResult = "saved" | "shared" | "downloaded" | "cancelled";

function download(name: string, type: string, content: BlobPart) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

async function saveWithPicker(picker: SaveFilePicker, name: string, type: string, content: BlobPart): Promise<"saved" | "cancelled" | false> {
  const blob = new Blob([content], { type });
  try {
    const handle = await picker({
      suggestedName: name,
      types: [
        {
          description: "Forward Draft project",
          accept: {
            [PROJECT_FILE_MIME]: [".frdx"],
          },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "saved";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    console.error("Save picker failed", error);
    return false;
  }
}

async function shareProjectFile(name: string, type: string, content: BlobPart): Promise<"shared" | "cancelled" | false> {
  const file = new File([content], name, { type });
  const shareData = { files: [file], title: name };
  const shareNavigator = navigator as FileShareNavigator;
  if (!shareNavigator.share || !shareNavigator.canShare?.(shareData)) return false;
  try {
    await shareNavigator.share(shareData);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    console.error("File share failed", error);
    return false;
  }
}

export async function exportProjectFile(project: Project, data: AppData): Promise<ProjectFileSaveResult> {
  const name = projectFileName(project);
  const content = serializeProjectFile(project, data);
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker && window.isSecureContext) {
    const savedWithPicker = await saveWithPicker(picker, name, PROJECT_FILE_MIME, content);
    if (savedWithPicker) return savedWithPicker;
  }
  const shared = await shareProjectFile(name, PROJECT_FILE_MIME, content);
  if (shared) return shared;
  download(name, PROJECT_FILE_MIME, content);
  return "downloaded";
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

export function exportText(project: Project, data: AppData) {
  download(`${safeFileStem(project.title)}.txt`, "text/plain", `${coverText(project)}\n\n\n${fullScript(project, data)}`);
}

export function exportFountainFile(project: Project, data: AppData) {
  download(`${safeFileStem(project.title)}.fountain`, "text/plain", `${fountainCover(project)}${fullScript(project, data)}`);
}

function drawCoverPage(pdf: jsPDF, project: Project) {
  const cover = coverPageFor(project);
  pdf.setFont("courier", "normal");
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(20);
  pdf.text(cover.title.toUpperCase(), 105, 104, { align: "center", maxWidth: 156 });
  pdf.setFontSize(11);
  pdf.text("Written by", 105, 124, { align: "center" });
  if (cover.writtenBy.trim()) pdf.text(cover.writtenBy, 105, 136, { align: "center", maxWidth: 140 });
  pdf.setFontSize(9);
  if (cover.contact.trim()) pdf.text(cover.contact.split("\n"), 24, 260, { maxWidth: 72 });
  if (cover.date.trim()) pdf.text(cover.date, 186, 272, { align: "right" });
}

function addCleanScript(pdf: jsPDF, project: Project, data: AppData) {
  pdf.addPage();
  pdf.setFont("courier", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(20, 20, 20);
  let y = 22;
  const x = 24;
  const width = 162;
  const lineHeight = 5.2;
  for (const scene of currentScenes(project, data)) {
    const wrapped = pdf.splitTextToSize(scene.version.text.trim() || " ", width) as string[];
    for (const line of [...wrapped, ""]) {
      if (y > 276) {
        pdf.addPage();
        y = 22;
      }
      pdf.text(line || " ", x, y);
      y += lineHeight;
    }
  }
}

function noteAnchorLine(note: ReviewNote, text: string, versionId: string) {
  if (note.versionId === versionId && note.rangeStart >= 0) {
    return text.slice(0, Math.min(note.rangeStart, text.length)).split("\n").length - 1;
  }
  if (note.selectedText) {
    const index = text.indexOf(note.selectedText);
    if (index >= 0) return text.slice(0, index).split("\n").length - 1;
  }
  return 0;
}

function sceneNotes(scene: Scene, data: AppData) {
  return data.notes
    .filter((note) => note.sceneId === scene.sceneId)
    .sort((a, b) => a.rangeStart - b.rangeStart || a.createdAt.localeCompare(b.createdAt));
}

function noteCardText(note: ReviewNote) {
  const selected = note.selectedText ? `"${note.selectedText}"` : "Scene note";
  const resolved = note.resolved ? "Resolved" : "Open";
  return [`${note.noteType} / ${note.priority} / ${resolved}`, selected, note.noteText].filter(Boolean).join("\n");
}

function wrapSceneLines(pdf: jsPDF, text: string, width: number) {
  const rows: { text: string; sourceLine: number }[] = [];
  text.split("\n").forEach((line, index) => {
    const wrapped = pdf.splitTextToSize(line || " ", width) as string[];
    wrapped.forEach((part) => rows.push({ text: part, sourceLine: index }));
  });
  return rows;
}

function drawAnnotationCard(pdf: jsPDF, text: string, x: number, y: number, width: number) {
  const lines = pdf.splitTextToSize(text, width - 6) as string[];
  const height = Math.max(16, lines.length * 4 + 8);
  pdf.setDrawColor(151, 171, 183);
  pdf.setFillColor(255, 252, 242);
  pdf.roundedRect(x, y, width, height, 2, 2, "FD");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(44, 54, 64);
  pdf.text(lines, x + 3, y + 6);
  return height;
}

function drawAnnotatedScene(
  pdf: jsPDF,
  title: string,
  sceneText: string,
  notes: ReviewNote[],
  changeAnnotations: string[] = [],
) {
  const scriptX = 18;
  const scriptY = 25;
  const scriptWidth = 118;
  const noteX = 148;
  const noteY = 20;
  const noteWidth = 44;
  const lineHeight = 5;
  const maxRows = 49;
  const rows = wrapSceneLines(pdf, sceneText, scriptWidth);
  const noteAnchors = notes.map((note) => ({ note, line: noteAnchorLine(note, sceneText, note.versionId) }));
  const totalPages = Math.max(1, Math.ceil(rows.length / maxRows));

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const pageRows = rows.slice(pageIndex * maxRows, (pageIndex + 1) * maxRows);
    const startLine = pageRows[0]?.sourceLine ?? 0;
    const endLine = pageRows.at(-1)?.sourceLine ?? startLine;
    pdf.addPage();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(76, 86, 98);
    pdf.text(`${title}${totalPages > 1 ? ` (${pageIndex + 1}/${totalPages})` : ""}`, scriptX, 14, { maxWidth: 170 });
    pdf.setFillColor(244, 247, 248);
    pdf.setDrawColor(213, 222, 228);
    pdf.roundedRect(noteX - 4, 16, 52, 260, 2, 2, "FD");

    pdf.setFont("courier", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(20, 20, 20);
    pageRows.forEach((row, rowIndex) => {
      pdf.text(row.text || " ", scriptX, scriptY + rowIndex * lineHeight);
    });

    const cards: { text: string; anchorY: number }[] = [];
    if (pageIndex === 0) changeAnnotations.forEach((text) => cards.push({ text, anchorY: scriptY }));
    noteAnchors
      .filter(({ line }) => line >= startLine && line <= endLine)
      .forEach(({ note, line }) => {
        const rowIndex = pageRows.findIndex((row) => row.sourceLine >= line);
        cards.push({ text: noteCardText(note), anchorY: scriptY + Math.max(rowIndex, 0) * lineHeight });
      });

    let cardY = noteY;
    cards.forEach((card) => {
      const height = drawAnnotationCard(pdf, card.text, noteX, cardY, noteWidth);
      pdf.setDrawColor(151, 171, 183);
      pdf.line(scriptX + scriptWidth + 2, card.anchorY - 1, noteX - 4, cardY + 6);
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
    const changeAnnotations = changesOnly || version.versionNumber > 1
      ? [
          [
            `Changed scene / V${version.versionNumber}`,
            version.changeSummary || "Scene changed from the previous version.",
            version.basedOnVersionId ? `Based on version: ${version.basedOnVersionId}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ]
      : [];
    drawAnnotatedScene(pdf, `${scene.order}  ${scene.heading}`, version.text, notes, changeAnnotations);
  }
}

export function exportFullPdf(project: Project, data: AppData, revisionMarked = false) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  drawCoverPage(pdf, project);
  if (revisionMarked) drawAnnotatedScript(pdf, project, data, false);
  else addCleanScript(pdf, project, data);
  pdf.save(`${safeFileStem(project.title)}${revisionMarked ? "-revision-notes" : ""}.pdf`);
}

export function exportChangesPdf(project: Project, data: AppData) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  drawCoverPage(pdf, project);
  drawAnnotatedScript(pdf, project, data, true);
  pdf.save(`${safeFileStem(project.title)}-changes-only.pdf`);
}
