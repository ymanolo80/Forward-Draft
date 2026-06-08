import type { AppData, CoverPage, DraftBlock, Highlight, NoteType, Priority, Project, ReviewNote, RewriteTask, RewriteTaskStatus, Scene, SceneStatus, SceneVersion, ScriptElement, WritingMode } from "../types";
import { createId, nowIso } from "./ids";

export const PROJECT_FILE_SCHEMA_VERSION = 1;
export const PROJECT_FILE_EXTENSION = ".frdx";
export const PROJECT_FILE_MIME = "application/vnd.forward-draft.project";
export const PROJECT_FILE_SIGNATURE = `FRDX/${PROJECT_FILE_SCHEMA_VERSION}`;

const APP_NAME = "Forward Draft";
const PROJECT_FILE_KIND = "forward-draft-project";

const writingModes = new Set<WritingMode>(["script", "freewrite"]);
const scriptElements = new Set<ScriptElement>([
  "Scene Heading",
  "Action",
  "Character",
  "Dialogue",
  "Parenthetical",
  "Transition",
  "Shot",
  "Note",
  "Chapter Heading",
  "General Text",
]);
const sceneStatuses = new Set<SceneStatus>(["For Review", "Needs Rewrite", "Rewritten", "Approved"]);
const noteTypes = new Set<NoteType>([
  "Rewrite",
  "Cut",
  "Clarify",
  "Dialogue",
  "Character",
  "Structure",
  "Visual Idea",
  "Continuity",
  "Research",
  "Keep",
  "Question",
]);
const priorities = new Set<Priority>(["Low", "Medium", "High"]);
const taskStatuses = new Set<RewriteTaskStatus>(["Open", "Done", "Archived"]);

type JsonRecord = Record<string, unknown>;

export interface ProjectFileSync {
  provider?: "local" | "google-drive" | "dropbox" | "icloud-drive";
  remoteId?: string;
  remoteRevision?: string;
}

export interface ProjectFileDocument {
  app: typeof APP_NAME;
  kind: typeof PROJECT_FILE_KIND;
  schemaVersion: typeof PROJECT_FILE_SCHEMA_VERSION;
  savedAt: string;
  project: Project;
  versions: SceneVersion[];
  notes: ReviewNote[];
  highlights: Highlight[];
  tasks: RewriteTask[];
  sync?: ProjectFileSync;
}

export interface ProjectFileImportResult {
  data: AppData;
  projectId: string;
  importedAsCopy: boolean;
  title: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) fail(`${path} must be an object.`);
  return value;
}

function stringValue(source: JsonRecord, key: string, path: string, allowEmpty = false) {
  const value = source[key];
  if (typeof value !== "string") fail(`${path}.${key} must be text.`);
  if (!allowEmpty && value.trim().length === 0) fail(`${path}.${key} cannot be empty.`);
  return value;
}

function optionalStringValue(source: JsonRecord, key: string, path: string) {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(`${path}.${key} must be text.`);
  return value;
}

function numberValue(source: JsonRecord, key: string, path: string) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path}.${key} must be a number.`);
  return value;
}

function booleanValue(source: JsonRecord, key: string, path: string) {
  const value = source[key];
  if (typeof value !== "boolean") fail(`${path}.${key} must be true or false.`);
  return value;
}

function enumValue<T extends string>(source: JsonRecord, key: string, path: string, allowed: Set<T>) {
  const value = stringValue(source, key, path);
  if (!allowed.has(value as T)) fail(`${path}.${key} has an unsupported value.`);
  return value as T;
}

function optionalEnumValue<T extends string>(source: JsonRecord, key: string, path: string, allowed: Set<T>) {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.has(value as T)) fail(`${path}.${key} has an unsupported value.`);
  return value as T;
}

function arrayValue<T>(source: JsonRecord, key: string, path: string, validator: (value: unknown, path: string) => T) {
  const value = source[key] ?? [];
  if (!Array.isArray(value)) fail(`${path}.${key} must be a list.`);
  return value.map((item, index) => validator(item, `${path}.${key}[${index}]`));
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(`${label} contains a duplicate id: ${value}`);
    seen.add(value);
  }
}

function validateDraftBlock(value: unknown, path: string): DraftBlock {
  const item = record(value, path);
  return {
    blockId: stringValue(item, "blockId", path),
    element: enumValue(item, "element", path, scriptElements),
    text: stringValue(item, "text", path, true),
    createdAt: stringValue(item, "createdAt", path),
  };
}

function validateCoverPage(value: unknown, path: string): CoverPage | undefined {
  if (value === undefined) return undefined;
  const item = record(value, path);
  return {
    title: stringValue(item, "title", path),
    writtenBy: stringValue(item, "writtenBy", path, true),
    contact: stringValue(item, "contact", path, true),
    date: stringValue(item, "date", path, true),
  };
}

function validateProject(value: unknown, path: string): Project {
  const item = record(value, path);
  const drafts = arrayValue(item, "drafts", path, validateDraftBlock);
  const scenes = arrayValue(item, "scenes", path, validateScene);
  assertUnique(drafts.map((draft) => draft.blockId), `${path}.drafts`);
  assertUnique(scenes.map((scene) => scene.sceneId), `${path}.scenes`);
  return {
    projectId: stringValue(item, "projectId", path),
    title: stringValue(item, "title", path),
    writingMode: enumValue(item, "writingMode", path, writingModes),
    createdAt: stringValue(item, "createdAt", path),
    updatedAt: stringValue(item, "updatedAt", path),
    drafts,
    scenes,
    coverPage: validateCoverPage(item.coverPage, `${path}.coverPage`),
  };
}

function validateScene(value: unknown, path: string): Scene {
  const item = record(value, path);
  return {
    sceneId: stringValue(item, "sceneId", path),
    projectId: stringValue(item, "projectId", path),
    heading: stringValue(item, "heading", path, true),
    order: numberValue(item, "order", path),
    currentVersionId: stringValue(item, "currentVersionId", path),
    status: enumValue(item, "status", path, sceneStatuses),
    createdAt: stringValue(item, "createdAt", path),
    updatedAt: stringValue(item, "updatedAt", path),
    source: optionalEnumValue(item, "source", path, new Set(["draft"])),
  };
}

function validateVersion(value: unknown, path: string): SceneVersion {
  const item = record(value, path);
  const version: SceneVersion = {
    versionId: stringValue(item, "versionId", path),
    sceneId: stringValue(item, "sceneId", path),
    versionNumber: numberValue(item, "versionNumber", path),
    text: stringValue(item, "text", path, true),
    createdAt: stringValue(item, "createdAt", path),
    isCurrent: booleanValue(item, "isCurrent", path),
  };
  const basedOnVersionId = optionalStringValue(item, "basedOnVersionId", path);
  const changeSummary = optionalStringValue(item, "changeSummary", path);
  if (basedOnVersionId) version.basedOnVersionId = basedOnVersionId;
  if (changeSummary !== undefined) version.changeSummary = changeSummary;
  return version;
}

function validateNote(value: unknown, path: string): ReviewNote {
  const item = record(value, path);
  return {
    noteId: stringValue(item, "noteId", path),
    sceneId: stringValue(item, "sceneId", path),
    versionId: stringValue(item, "versionId", path),
    selectedText: stringValue(item, "selectedText", path, true),
    rangeStart: numberValue(item, "rangeStart", path),
    rangeEnd: numberValue(item, "rangeEnd", path),
    noteText: stringValue(item, "noteText", path, true),
    noteType: enumValue(item, "noteType", path, noteTypes),
    priority: enumValue(item, "priority", path, priorities),
    resolved: booleanValue(item, "resolved", path),
    createdAt: stringValue(item, "createdAt", path),
    updatedAt: stringValue(item, "updatedAt", path),
  };
}

function validateHighlight(value: unknown, path: string): Highlight {
  const item = record(value, path);
  const highlight: Highlight = {
    highlightId: stringValue(item, "highlightId", path),
    sceneId: stringValue(item, "sceneId", path),
    versionId: stringValue(item, "versionId", path),
    selectedText: stringValue(item, "selectedText", path, true),
    rangeStart: numberValue(item, "rangeStart", path),
    rangeEnd: numberValue(item, "rangeEnd", path),
    color: stringValue(item, "color", path),
    hasNote: booleanValue(item, "hasNote", path),
  };
  const noteId = optionalStringValue(item, "noteId", path);
  if (noteId) highlight.noteId = noteId;
  return highlight;
}

function validateTask(value: unknown, path: string): RewriteTask {
  const item = record(value, path);
  const linkedNoteIds = item.linkedNoteIds;
  if (!Array.isArray(linkedNoteIds) || !linkedNoteIds.every((id) => typeof id === "string")) {
    fail(`${path}.linkedNoteIds must be a list of note ids.`);
  }
  const task: RewriteTask = {
    taskId: stringValue(item, "taskId", path),
    sceneId: stringValue(item, "sceneId", path),
    sourceVersionId: stringValue(item, "sourceVersionId", path),
    linkedNoteIds,
    priority: enumValue(item, "priority", path, priorities),
    status: enumValue(item, "status", path, taskStatuses),
    createdAt: stringValue(item, "createdAt", path),
  };
  const completedAt = optionalStringValue(item, "completedAt", path);
  if (completedAt) task.completedAt = completedAt;
  return task;
}

function validateSync(value: unknown, path: string): ProjectFileSync | undefined {
  if (value === undefined) return undefined;
  const item = record(value, path);
  return {
    provider: optionalEnumValue(item, "provider", path, new Set(["local", "google-drive", "dropbox", "icloud-drive"])),
    remoteId: optionalStringValue(item, "remoteId", path),
    remoteRevision: optionalStringValue(item, "remoteRevision", path),
  };
}

function validateReferences(document: ProjectFileDocument) {
  const sceneIds = new Set(document.project.scenes.map((scene) => scene.sceneId));
  const versionIds = new Set(document.versions.map((version) => version.versionId));
  const noteIds = new Set(document.notes.map((note) => note.noteId));

  for (const scene of document.project.scenes) {
    if (scene.projectId !== document.project.projectId) fail(`Scene "${scene.heading || scene.sceneId}" belongs to another project.`);
    const currentVersion = document.versions.find((version) => version.versionId === scene.currentVersionId);
    if (!currentVersion || currentVersion.sceneId !== scene.sceneId) {
      fail(`Scene "${scene.heading || scene.sceneId}" is missing its current version.`);
    }
  }
  for (const version of document.versions) {
    if (!sceneIds.has(version.sceneId)) fail(`Version "${version.versionId}" points to a missing scene.`);
    if (version.basedOnVersionId && !versionIds.has(version.basedOnVersionId)) fail(`Version "${version.versionId}" points to a missing base version.`);
  }
  for (const note of document.notes) {
    if (!sceneIds.has(note.sceneId)) fail(`Note "${note.noteId}" points to a missing scene.`);
    if (!versionIds.has(note.versionId)) fail(`Note "${note.noteId}" points to a missing version.`);
  }
  for (const highlight of document.highlights) {
    if (!sceneIds.has(highlight.sceneId)) fail(`Highlight "${highlight.highlightId}" points to a missing scene.`);
    if (!versionIds.has(highlight.versionId)) fail(`Highlight "${highlight.highlightId}" points to a missing version.`);
    if (highlight.noteId && !noteIds.has(highlight.noteId)) fail(`Highlight "${highlight.highlightId}" points to a missing note.`);
  }
  for (const task of document.tasks) {
    if (!sceneIds.has(task.sceneId)) fail(`Rewrite task "${task.taskId}" points to a missing scene.`);
    if (!versionIds.has(task.sourceVersionId)) fail(`Rewrite task "${task.taskId}" points to a missing source version.`);
    for (const noteId of task.linkedNoteIds) {
      if (!noteIds.has(noteId)) fail(`Rewrite task "${task.taskId}" points to a missing note.`);
    }
  }
}

function validateProjectFile(value: unknown): ProjectFileDocument {
  const item = record(value, "project file");
  if (item.app !== APP_NAME || item.kind !== PROJECT_FILE_KIND) fail("This is not a Forward Draft project file.");
  if (item.schemaVersion !== PROJECT_FILE_SCHEMA_VERSION) {
    fail(`This project file uses schema version ${String(item.schemaVersion)}. This version of Forward Draft opens schema version ${PROJECT_FILE_SCHEMA_VERSION}.`);
  }

  const document: ProjectFileDocument = {
    app: APP_NAME,
    kind: PROJECT_FILE_KIND,
    schemaVersion: PROJECT_FILE_SCHEMA_VERSION,
    savedAt: stringValue(item, "savedAt", "project file"),
    project: validateProject(item.project, "project file.project"),
    versions: arrayValue(item, "versions", "project file", validateVersion),
    notes: arrayValue(item, "notes", "project file", validateNote),
    highlights: arrayValue(item, "highlights", "project file", validateHighlight),
    tasks: arrayValue(item, "tasks", "project file", validateTask),
    sync: validateSync(item.sync, "project file.sync"),
  };

  assertUnique(document.versions.map((version) => version.versionId), "project file.versions");
  assertUnique(document.notes.map((note) => note.noteId), "project file.notes");
  assertUnique(document.highlights.map((highlight) => highlight.highlightId), "project file.highlights");
  assertUnique(document.tasks.map((task) => task.taskId), "project file.tasks");
  validateReferences(document);
  return document;
}

export function parseProjectFileText(text: string): ProjectFileDocument {
  const normalizedText = text.replace(/^\uFEFF/, "");
  if (normalizedText.trim().length === 0) fail("This .frdx file is empty. Save the project again from Forward Draft.");
  if (normalizedText.startsWith(PROJECT_FILE_SIGNATURE)) {
    const payload = normalizedText.slice(PROJECT_FILE_SIGNATURE.length).replace(/^\r?\n/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      fail("This .frdx project file is damaged or incomplete.");
    }
    return validateProjectFile(parsed);
  }

  fail("This is not a valid .frdx project file. Choose a project file saved from Forward Draft.");
}

export function createProjectFileDocument(project: Project, data: AppData): ProjectFileDocument {
  const sceneIds = new Set(project.scenes.map((scene) => scene.sceneId));
  const portableProject: Project = {
    projectId: project.projectId,
    title: project.title,
    writingMode: project.writingMode,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    drafts: project.drafts,
    scenes: project.scenes,
    coverPage: project.coverPage,
  };
  return {
    app: APP_NAME,
    kind: PROJECT_FILE_KIND,
    schemaVersion: PROJECT_FILE_SCHEMA_VERSION,
    savedAt: nowIso(),
    project: portableProject,
    versions: data.versions.filter((version) => sceneIds.has(version.sceneId)),
    notes: data.notes.filter((note) => sceneIds.has(note.sceneId)),
    highlights: data.highlights.filter((highlight) => sceneIds.has(highlight.sceneId)),
    tasks: data.tasks.filter((task) => sceneIds.has(task.sceneId)),
    sync: {
      provider: "local",
    },
  };
}

export function serializeProjectFile(project: Project, data: AppData) {
  return `${PROJECT_FILE_SIGNATURE}\n${JSON.stringify(createProjectFileDocument(project, data), null, 2)}\n`;
}

export function projectFileName(project: Project) {
  const base = project.title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.frdx$/i, "")
    .slice(0, 90) || "Untitled Draft";
  return `${base}${PROJECT_FILE_EXTENSION}`;
}

export function projectTitleFromFileName(name: string) {
  const title = name
    .replace(/\.frdx$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return title || undefined;
}

function importedIds(document: ProjectFileDocument) {
  return [
    document.project.projectId,
    ...document.project.drafts.map((draft) => draft.blockId),
    ...document.project.scenes.map((scene) => scene.sceneId),
    ...document.versions.map((version) => version.versionId),
    ...document.notes.map((note) => note.noteId),
    ...document.highlights.map((highlight) => highlight.highlightId),
    ...document.tasks.map((task) => task.taskId),
  ];
}

function existingIds(data: AppData) {
  return new Set([
    ...data.projects.map((project) => project.projectId),
    ...data.projects.flatMap((project) => project.drafts.map((draft) => draft.blockId)),
    ...data.projects.flatMap((project) => project.scenes.map((scene) => scene.sceneId)),
    ...data.versions.map((version) => version.versionId),
    ...data.notes.map((note) => note.noteId),
    ...data.highlights.map((highlight) => highlight.highlightId),
    ...data.tasks.map((task) => task.taskId),
  ]);
}

function hasAnyIdCollision(document: ProjectFileDocument, data: AppData) {
  const ids = existingIds(data);
  return importedIds(document).some((id) => ids.has(id));
}

function uniqueTitle(title: string, data: AppData) {
  const existing = new Set(data.projects.map((project) => project.title));
  if (!existing.has(title)) return title;
  const copyTitle = `${title} Copy`;
  if (!existing.has(copyTitle)) return copyTitle;
  let index = 2;
  while (existing.has(`${copyTitle} ${index}`)) index += 1;
  return `${copyTitle} ${index}`;
}

function copyProjectDocument(document: ProjectFileDocument, data: AppData, preferredTitle?: string): ProjectFileDocument {
  const projectId = createId("project");
  const blockIdMap = new Map(document.project.drafts.map((draft) => [draft.blockId, createId("block")]));
  const sceneIdMap = new Map(document.project.scenes.map((scene) => [scene.sceneId, createId("scene")]));
  const versionIdMap = new Map(document.versions.map((version) => [version.versionId, createId("version")]));
  const noteIdMap = new Map(document.notes.map((note) => [note.noteId, createId("note")]));
  const now = nowIso();
  const title = uniqueTitle(preferredTitle ?? document.project.title, data);

  return {
    ...document,
    savedAt: now,
    project: {
      ...document.project,
      projectId,
      title,
      coverPage: document.project.coverPage
        ? { ...document.project.coverPage, title }
        : undefined,
      updatedAt: now,
      drafts: document.project.drafts.map((draft) => ({
        ...draft,
        blockId: blockIdMap.get(draft.blockId)!,
      })),
      scenes: document.project.scenes.map((scene) => ({
        ...scene,
        sceneId: sceneIdMap.get(scene.sceneId)!,
        projectId,
        currentVersionId: versionIdMap.get(scene.currentVersionId)!,
        updatedAt: now,
      })),
    },
    versions: document.versions.map((version) => ({
      ...version,
      versionId: versionIdMap.get(version.versionId)!,
      sceneId: sceneIdMap.get(version.sceneId)!,
      basedOnVersionId: version.basedOnVersionId ? versionIdMap.get(version.basedOnVersionId) : undefined,
    })),
    notes: document.notes.map((note) => ({
      ...note,
      noteId: noteIdMap.get(note.noteId)!,
      sceneId: sceneIdMap.get(note.sceneId)!,
      versionId: versionIdMap.get(note.versionId)!,
      updatedAt: now,
    })),
    highlights: document.highlights.map((highlight) => ({
      ...highlight,
      highlightId: createId("highlight"),
      sceneId: sceneIdMap.get(highlight.sceneId)!,
      versionId: versionIdMap.get(highlight.versionId)!,
      noteId: highlight.noteId ? noteIdMap.get(highlight.noteId) : undefined,
    })),
    tasks: document.tasks.map((task) => ({
      ...task,
      taskId: createId("task"),
      sceneId: sceneIdMap.get(task.sceneId)!,
      sourceVersionId: versionIdMap.get(task.sourceVersionId)!,
      linkedNoteIds: task.linkedNoteIds.map((noteId) => noteIdMap.get(noteId)!),
    })),
    sync: {
      provider: "local",
    },
  };
}

export function appendProjectFileDocument(data: AppData, document: ProjectFileDocument, options: { preferredTitle?: string } = {}): ProjectFileImportResult {
  const shouldCopy = hasAnyIdCollision(document, data);
  const title = uniqueTitle(options.preferredTitle ?? document.project.title, data);
  const nextDocument = shouldCopy ? copyProjectDocument(document, data, title) : {
    ...document,
    project: {
      ...document.project,
      title,
      coverPage: document.project.coverPage ? { ...document.project.coverPage, title } : undefined,
    },
  };

  return {
    data: {
      ...data,
      projects: [...data.projects, nextDocument.project],
      versions: [...data.versions, ...nextDocument.versions],
      notes: [...data.notes, ...nextDocument.notes],
      highlights: [...data.highlights, ...nextDocument.highlights],
      tasks: [...data.tasks, ...nextDocument.tasks],
      activeProjectId: nextDocument.project.projectId,
    },
    projectId: nextDocument.project.projectId,
    importedAsCopy: shouldCopy,
    title: nextDocument.project.title,
  };
}
