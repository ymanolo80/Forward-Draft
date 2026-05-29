export type AppMode = "write" | "review" | "rewrite";
export type WritingMode = "script" | "freewrite";
export type ScriptElement =
  | "Scene Heading"
  | "Action"
  | "Character"
  | "Dialogue"
  | "Parenthetical"
  | "Transition"
  | "Shot"
  | "Note"
  | "Chapter Heading"
  | "General Text";

export type VisibilityRule =
  | "current"
  | "last2"
  | "last3"
  | "last4"
  | "last5"
  | "previousBlock"
  | "previousScene"
  | "previousChapter";

export type FadeTiming = "immediate" | "3s" | "5s" | "10s" | "nextBlock";
export type SceneStatus = "For Review" | "Needs Rewrite" | "Rewritten" | "Approved";
export type NoteType =
  | "Rewrite"
  | "Cut"
  | "Clarify"
  | "Dialogue"
  | "Character"
  | "Structure"
  | "Visual Idea"
  | "Continuity"
  | "Research"
  | "Keep"
  | "Question";
export type Priority = "Low" | "Medium" | "High";
export type RewriteTaskStatus = "Open" | "Done" | "Archived";

export interface DraftBlock {
  blockId: string;
  element: ScriptElement;
  text: string;
  createdAt: string;
}

export interface Project {
  projectId: string;
  title: string;
  writingMode: WritingMode;
  createdAt: string;
  updatedAt: string;
  drafts: DraftBlock[];
  scenes: Scene[];
}

export interface Scene {
  sceneId: string;
  projectId: string;
  heading: string;
  order: number;
  currentVersionId: string;
  status: SceneStatus;
  createdAt: string;
  updatedAt: string;
  source?: "draft";
}

export interface SceneVersion {
  versionId: string;
  sceneId: string;
  versionNumber: number;
  text: string;
  createdAt: string;
  isCurrent: boolean;
  basedOnVersionId?: string;
  changeSummary?: string;
}

export interface ReviewNote {
  noteId: string;
  sceneId: string;
  versionId: string;
  selectedText: string;
  rangeStart: number;
  rangeEnd: number;
  noteText: string;
  noteType: NoteType;
  priority: Priority;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Highlight {
  highlightId: string;
  sceneId: string;
  versionId: string;
  selectedText: string;
  rangeStart: number;
  rangeEnd: number;
  color: string;
  hasNote: boolean;
  noteId?: string;
}

export interface RewriteTask {
  taskId: string;
  sceneId: string;
  sourceVersionId: string;
  linkedNoteIds: string[];
  priority: Priority;
  status: RewriteTaskStatus;
  createdAt: string;
  completedAt?: string;
}

export interface AppData {
  projects: Project[];
  versions: SceneVersion[];
  notes: ReviewNote[];
  highlights: Highlight[];
  tasks: RewriteTask[];
  activeProjectId?: string;
}
