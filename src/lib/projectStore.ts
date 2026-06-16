import type { AppData, Project, ProjectFileReference } from "../types";
import { autosaveProjectFile } from "./exports";
import {
  deleteAppProjectFile,
  isNativeFileServiceAvailable,
  listAppProjectFiles,
  writeAppProjectFile,
} from "./fileService";
import { PROJECT_FILE_EXTENSION, parseProjectFileText, serializeProjectFile, type ProjectFileDocument } from "./projectFile";

const APP_FILE_EXTENSION = PROJECT_FILE_EXTENSION.replace(/^\./, "");

export function appProjectFileName(projectId: string): string {
  return `${projectId}${PROJECT_FILE_EXTENSION}`;
}

export interface PersistProjectOutcome {
  // True when the project was written to at least one durable, non-evictable
  // location (the app-owned store and/or a linked external file).
  durablySaved: boolean;
  // An updated external file reference, when a linked external file was saved.
  fileReference?: ProjectFileReference;
}

// Writes the project's durable copies: always the app-owned store on native
// (the eviction-proof guarantee), plus the user's linked external file when one
// exists (a convenience copy in their chosen Files/iCloud location).
export async function persistProject(project: Project, data: AppData): Promise<PersistProjectOutcome> {
  let durablySaved = false;

  if (isNativeFileServiceAvailable()) {
    const text = serializeProjectFile(project, data);
    durablySaved = await writeAppProjectFile(appProjectFileName(project.projectId), text);
  }

  let fileReference: ProjectFileReference | undefined;
  if (project.fileReference) {
    const outcome = await autosaveProjectFile(project, data);
    if (outcome.status === "saved") {
      durablySaved = true;
      fileReference = outcome.fileReference;
    }
  }

  return { durablySaved, fileReference };
}

export async function deleteProjectFromAppStore(projectId: string): Promise<void> {
  await deleteAppProjectFile(appProjectFileName(projectId));
}

// Reads and parses every project backup in the app-owned store. Corrupt or
// unreadable backups are skipped so a single bad file cannot block recovery.
export async function loadAppStoreProjectDocuments(): Promise<ProjectFileDocument[]> {
  if (!isNativeFileServiceAvailable()) return [];
  const files = await listAppProjectFiles(APP_FILE_EXTENSION);
  const documents: ProjectFileDocument[] = [];
  for (const file of files) {
    try {
      documents.push(parseProjectFileText(file.text));
    } catch {
      // Ignore unreadable backups.
    }
  }
  return documents;
}

// Merges app-owned backups into the IndexedDB-loaded data. IndexedDB is treated
// as the live cache: any project it already holds is left as-is, and only
// projects found solely in the app-owned store are restored (the recovery path
// after IndexedDB is evicted or cleared). This never lets a stale backup
// overwrite fresher cached work.
export function reconcileWithAppStore(stored: AppData, documents: ProjectFileDocument[]): AppData {
  const knownProjectIds = new Set(stored.projects.map((project) => project.projectId));
  let next = stored;
  let recovered = false;

  for (const document of documents) {
    const projectId = document.project.projectId;
    if (knownProjectIds.has(projectId)) continue;
    knownProjectIds.add(projectId);
    recovered = true;
    next = {
      ...next,
      projects: [...next.projects, document.project as Project],
      versions: [...next.versions, ...document.versions],
      notes: [...next.notes, ...document.notes],
      highlights: [...next.highlights, ...document.highlights],
      tasks: [...next.tasks, ...document.tasks],
    };
  }

  if (recovered && !next.activeProjectId) {
    next = { ...next, activeProjectId: next.projects[0]?.projectId };
  }
  return next;
}
