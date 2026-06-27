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

// Strip filesystem-unsafe characters so the durable file can be named after the
// project title (readable in Files/iCloud) instead of its UUID.
function sanitizeFileTitle(title: string): string {
  const cleaned = (title || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || "Untitled";
}

type ProjectNameInfo = { projectId: string; title: string };

// Durable filename: just the readable title — clean in Files. A short id tail is
// appended ONLY when another project sanitises to the same title, so two
// same-named projects can't collide onto one file (which would lose one on
// recovery). The tail is the LAST 8 chars (random UUID tail); the first 8 are
// identical across ids (they share a "project_" prefix).
export function appProjectFileName(project: ProjectNameInfo, allProjects: ReadonlyArray<ProjectNameInfo> = []): string {
  const base = sanitizeFileTitle(project.title);
  const collides = allProjects.some((other) => other.projectId !== project.projectId && sanitizeFileTitle(other.title) === base);
  const suffix = collides ? ` ${project.projectId.slice(-8)}` : "";
  return `${base}${suffix}${PROJECT_FILE_EXTENSION}`;
}

// Delete every stored file that belongs to this project except `keepName`,
// identifying ownership by the projectId INSIDE each file. This self-heals any
// past naming scheme (legacy <id>.frdx, renamed titles) without guessing from
// filenames. ponytail: re-reads all app files per save — fine for a personal
// library; add a last-written-name cache if the store ever grows large.
async function pruneProjectFiles(projectId: string, keepName?: string): Promise<void> {
  if (!isNativeFileServiceAvailable()) return;
  const files = await listAppProjectFiles(APP_FILE_EXTENSION);
  await Promise.all(
    files.map(async (file) => {
      if (file.name === keepName) return;
      let ownerId: string | undefined;
      try {
        ownerId = parseProjectFileText(file.text).project.projectId;
      } catch {
        return; // unreadable backup: leave it alone (recovery skips it too)
      }
      if (ownerId === projectId) await deleteAppProjectFile(file.name);
    }),
  );
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
    const name = appProjectFileName(project, data.projects);
    durablySaved = await writeAppProjectFile(name, text);
    // Only after the new copy is safely written, drop any older-named copies of
    // this project (renamed title, legacy <id>.frdx) so it keeps one file each.
    if (durablySaved) await pruneProjectFiles(project.projectId, name);
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

// Deletes every stored copy of a project (no file kept).
export async function deleteProjectFromAppStore(projectId: string): Promise<void> {
  await pruneProjectFiles(projectId);
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
