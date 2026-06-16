import type { AppData, Highlight, Project, ReviewNote, RewriteTask, SceneVersion } from "../types";

// Undo/redo is scoped per project. Each history entry is a snapshot of a single
// project's own records (the project plus the versions/notes/highlights/tasks
// belonging to its scenes), never the whole AppData. This guarantees that
// undoing an edit in one project can neither revert another project's work nor
// silently switch the active project.

export interface ProjectSnapshot {
  project: Project;
  versions: SceneVersion[];
  notes: ReviewNote[];
  highlights: Highlight[];
  tasks: RewriteTask[];
}

export interface ProjectHistory {
  undo: ProjectSnapshot[];
  redo: ProjectSnapshot[];
}

export type HistoryMap = Record<string, ProjectHistory>;

export const HISTORY_LIMIT = 50;

const emptyHistory: ProjectHistory = { undo: [], redo: [] };

export function snapshotProject(data: AppData, projectId: string): ProjectSnapshot | undefined {
  const project = data.projects.find((item) => item.projectId === projectId);
  if (!project) return undefined;
  const sceneIds = new Set(project.scenes.map((scene) => scene.sceneId));
  return {
    project,
    versions: data.versions.filter((version) => sceneIds.has(version.sceneId)),
    notes: data.notes.filter((note) => sceneIds.has(note.sceneId)),
    highlights: data.highlights.filter((highlight) => sceneIds.has(highlight.sceneId)),
    tasks: data.tasks.filter((task) => sceneIds.has(task.sceneId)),
  };
}

export function applyProjectSnapshot(data: AppData, snapshot: ProjectSnapshot): AppData {
  const projectId = snapshot.project.projectId;
  const snapshotSceneIds = new Set(snapshot.project.scenes.map((scene) => scene.sceneId));
  const current = data.projects.find((item) => item.projectId === projectId);
  const currentSceneIds = new Set(current?.scenes.map((scene) => scene.sceneId) ?? []);
  // A record belongs to this project if its scene is in the snapshot OR in the
  // project's current scene set — so scenes added since the snapshot are removed
  // on undo, and records for other projects are always left untouched.
  const foreign = (sceneId: string) => !snapshotSceneIds.has(sceneId) && !currentSceneIds.has(sceneId);
  const projectExists = data.projects.some((item) => item.projectId === projectId);
  return {
    ...data,
    projects: projectExists
      ? data.projects.map((item) => (item.projectId === projectId ? snapshot.project : item))
      : [...data.projects, snapshot.project],
    versions: [...data.versions.filter((version) => foreign(version.sceneId)), ...snapshot.versions],
    notes: [...data.notes.filter((note) => foreign(note.sceneId)), ...snapshot.notes],
    highlights: [...data.highlights.filter((highlight) => foreign(highlight.sceneId)), ...snapshot.highlights],
    tasks: [...data.tasks.filter((task) => foreign(task.sceneId)), ...snapshot.tasks],
  };
}

export function snapshotsEqual(left: ProjectSnapshot | undefined, right: ProjectSnapshot | undefined): boolean {
  if (!left || !right) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function historyFor(history: HistoryMap, projectId: string): ProjectHistory {
  return history[projectId] ?? emptyHistory;
}

export function canUndo(history: HistoryMap, projectId: string | undefined): boolean {
  return Boolean(projectId) && historyFor(history, projectId!).undo.length > 0;
}

export function canRedo(history: HistoryMap, projectId: string | undefined): boolean {
  return Boolean(projectId) && historyFor(history, projectId!).redo.length > 0;
}

// Record the pre-edit snapshot of `projectId` before an in-place edit is applied.
// Returns the unchanged map when there is nothing meaningful to record (no such
// project, or the project's records did not actually change).
export function recordEdit(
  history: HistoryMap,
  projectId: string | undefined,
  before: AppData,
  after: AppData,
): HistoryMap {
  if (!projectId) return history;
  const beforeSnapshot = snapshotProject(before, projectId);
  const afterSnapshot = snapshotProject(after, projectId);
  if (!beforeSnapshot || !afterSnapshot) return history;
  if (snapshotsEqual(beforeSnapshot, afterSnapshot)) return history;
  const entry = historyFor(history, projectId);
  return {
    ...history,
    [projectId]: {
      undo: [...entry.undo, beforeSnapshot].slice(-HISTORY_LIMIT),
      redo: [],
    },
  };
}

export interface StepResult {
  history: HistoryMap;
  data: AppData;
}

export function undo(history: HistoryMap, projectId: string | undefined, data: AppData): StepResult | undefined {
  if (!projectId) return undefined;
  const entry = historyFor(history, projectId);
  const previous = entry.undo.at(-1);
  if (!previous) return undefined;
  const current = snapshotProject(data, projectId);
  return {
    history: {
      ...history,
      [projectId]: {
        undo: entry.undo.slice(0, -1),
        redo: current ? [...entry.redo, current].slice(-HISTORY_LIMIT) : entry.redo,
      },
    },
    data: applyProjectSnapshot(data, previous),
  };
}

export function redo(history: HistoryMap, projectId: string | undefined, data: AppData): StepResult | undefined {
  if (!projectId) return undefined;
  const entry = historyFor(history, projectId);
  const next = entry.redo.at(-1);
  if (!next) return undefined;
  const current = snapshotProject(data, projectId);
  return {
    history: {
      ...history,
      [projectId]: {
        undo: current ? [...entry.undo, current].slice(-HISTORY_LIMIT) : entry.undo,
        redo: entry.redo.slice(0, -1),
      },
    },
    data: applyProjectSnapshot(data, next),
  };
}

export function clearProjectHistory(history: HistoryMap, projectId: string): HistoryMap {
  if (!(projectId in history)) return history;
  const next = { ...history };
  delete next[projectId];
  return next;
}
