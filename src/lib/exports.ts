import jsPDF from "jspdf";
import type { AppData, Project, Scene, SceneVersion } from "../types";
import { exportFountain } from "./fountain";

function download(name: string, type: string, content: BlobPart) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportProjectBackup(project: Project, data: AppData) {
  const backup = {
    project,
    versions: data.versions.filter((version) => project.scenes.some((scene) => scene.sceneId === version.sceneId)),
    notes: data.notes.filter((note) => project.scenes.some((scene) => scene.sceneId === note.sceneId)),
    highlights: data.highlights.filter((highlight) => project.scenes.some((scene) => scene.sceneId === highlight.sceneId)),
    tasks: data.tasks.filter((task) => project.scenes.some((scene) => scene.sceneId === task.sceneId)),
  };
  download(`${project.title}.json`, "application/json", JSON.stringify(backup, null, 2));
}

export function exportText(project: Project, versions: SceneVersion[]) {
  download(`${project.title}.txt`, "text/plain", exportFountain(project, project.scenes, versions));
}

export function exportFountainFile(project: Project, versions: SceneVersion[]) {
  download(`${project.title}.fountain`, "text/plain", exportFountain(project, project.scenes, versions));
}

function addPdfText(pdf: jsPDF, lines: string[]) {
  let y = 18;
  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(line || " ", 174) as string[];
    for (const wrappedLine of wrapped) {
      if (y > 280) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(wrappedLine, 18, y);
      y += 6;
    }
  }
}

export function exportFullPdf(project: Project, versions: SceneVersion[], revisionMarked = false) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("courier", "normal");
  pdf.setFontSize(11);
  const lines: string[] = [project.title.toUpperCase(), ""];
  for (const scene of project.scenes.sort((a, b) => a.order - b.order)) {
    const version = versions.find((candidate) => candidate.versionId === scene.currentVersionId);
    if (!version) continue;
    if (revisionMarked && version.versionNumber > 1) {
      lines.push(`[REVISION: ${scene.heading} · VERSION ${version.versionNumber}]`);
    }
    lines.push(...version.text.split("\n"), "");
  }
  addPdfText(pdf, lines);
  pdf.save(`${project.title}${revisionMarked ? "-revisions" : ""}.pdf`);
}

export function exportChangesPdf(project: Project, versions: SceneVersion[]) {
  const changedScenes = project.scenes.filter((scene) => {
    const version = versions.find((candidate) => candidate.versionId === scene.currentVersionId);
    return scene.status === "Rewritten" || (version?.versionNumber ?? 1) > 1;
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("courier", "normal");
  pdf.setFontSize(11);
  const lines: string[] = [`${project.title.toUpperCase()} - CHANGES ONLY`, ""];
  for (const scene of changedScenes.sort((a, b) => a.order - b.order)) {
    const version = versions.find((candidate) => candidate.versionId === scene.currentVersionId);
    if (!version) continue;
    lines.push(`${scene.heading} · VERSION ${version.versionNumber}`);
    if (version.basedOnVersionId) lines.push(`Previous version: ${version.basedOnVersionId}`);
    lines.push("", ...version.text.split("\n"), "");
  }
  addPdfText(pdf, lines);
  pdf.save(`${project.title}-changes-only.pdf`);
}
