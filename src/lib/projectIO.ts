import type { AppData, Project } from "../types";
import { importFountainProject } from "./fountain";
import { appendProjectFileDocument, parseProjectFileText, projectTitleFromFileName } from "./projectFile";

export interface TextFileSource {
  name: string;
  text: string;
}

export interface OpenProjectResult {
  data: AppData;
  importedAsCopy: boolean;
  originalTitle: string;
  title: string;
}

export interface ImportScriptResult {
  data: AppData;
  projectId: string;
  title: string;
}

function uniqueProjectTitle(title: string, data: AppData) {
  const existing = new Set(data.projects.map((project) => project.title));
  if (!existing.has(title)) return title;
  const copyTitle = `${title} Copy`;
  if (!existing.has(copyTitle)) return copyTitle;
  let index = 2;
  while (existing.has(`${copyTitle} ${index}`)) index += 1;
  return `${copyTitle} ${index}`;
}

export function openProjectFileIntoData(data: AppData, source: TextFileSource): OpenProjectResult {
  const projectFile = parseProjectFileText(source.text);
  const result = appendProjectFileDocument(data, projectFile, { preferredTitle: projectTitleFromFileName(source.name) });
  return {
    data: result.data,
    importedAsCopy: result.importedAsCopy,
    originalTitle: projectFile.project.title,
    title: result.title,
  };
}

export function importFountainIntoData(data: AppData, source: TextFileSource): ImportScriptResult {
  const imported = importFountainProject(source.name, source.text);
  const title = uniqueProjectTitle(imported.project.title, data);
  const project: Project = {
    ...imported.project,
    title,
    coverPage: {
      title: imported.project.coverPage?.title || title,
      writtenBy: imported.project.coverPage?.writtenBy ?? "",
      contact: imported.project.coverPage?.contact ?? "",
      date: imported.project.coverPage?.date ?? imported.project.createdAt.slice(0, 10),
    },
  };

  return {
    data: {
      ...data,
      projects: [...data.projects, project],
      versions: [...data.versions, ...imported.versions],
      activeProjectId: project.projectId,
    },
    projectId: project.projectId,
    title: project.title,
  };
}
