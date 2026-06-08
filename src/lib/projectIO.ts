import type { AppData, Project, ProjectFileReference } from "../types";
import { importFountainProject } from "./fountain";
import { appendProjectFileDocument, parseProjectFileText, projectTitleFromFileName } from "./projectFile";
import { importFdxProject, importTxtProject, type ImportedScriptProject } from "./scriptImport";

export interface TextFileSource {
  name: string;
  text: string;
  fileReference?: ProjectFileReference;
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
  const fileTitle = projectTitleFromFileName(source.name);
  const existingProject = data.projects.find((project) => project.projectId === projectFile.project.projectId);
  if (existingProject) {
    const oldSceneIds = new Set(existingProject.scenes.map((scene) => scene.sceneId));
    const title = fileTitle ?? projectFile.project.title;
    const project: Project = {
      ...projectFile.project,
      title,
      coverPage: projectFile.project.coverPage ? { ...projectFile.project.coverPage, title } : undefined,
      fileReference: source.fileReference ? { ...source.fileReference, name: source.name } : existingProject.fileReference,
    };

    return {
      data: {
        ...data,
        projects: data.projects.map((item) => (item.projectId === project.projectId ? project : item)),
        versions: [...data.versions.filter((version) => !oldSceneIds.has(version.sceneId)), ...projectFile.versions],
        notes: [...data.notes.filter((note) => !oldSceneIds.has(note.sceneId)), ...projectFile.notes],
        highlights: [...data.highlights.filter((highlight) => !oldSceneIds.has(highlight.sceneId)), ...projectFile.highlights],
        tasks: [...data.tasks.filter((task) => !oldSceneIds.has(task.sceneId)), ...projectFile.tasks],
        activeProjectId: project.projectId,
      },
      importedAsCopy: false,
      originalTitle: projectFile.project.title,
      title: project.title,
    };
  }

  const result = appendProjectFileDocument(data, projectFile, { preferredTitle: projectTitleFromFileName(source.name) });
  const fileReference = source.fileReference;
  const nextData = fileReference
    ? {
        ...result.data,
        projects: result.data.projects.map((project) =>
          project.projectId === result.projectId
            ? { ...project, fileReference: { ...fileReference, name: source.name } }
            : project,
        ),
      }
    : result.data;
  return {
    data: nextData,
    importedAsCopy: result.importedAsCopy,
    originalTitle: projectFile.project.title,
    title: result.title,
  };
}

export function importFountainIntoData(data: AppData, source: TextFileSource): ImportScriptResult {
  const imported = importFountainProject(source.name, source.text);
  return appendImportedScript(data, imported);
}

export function importTxtIntoData(data: AppData, source: TextFileSource): ImportScriptResult {
  return appendImportedScript(data, importTxtProject(source.name, source.text));
}

export function importFdxIntoData(data: AppData, source: TextFileSource): ImportScriptResult {
  return appendImportedScript(data, importFdxProject(source.name, source.text));
}

function appendImportedScript(data: AppData, imported: ImportedScriptProject): ImportScriptResult {
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
