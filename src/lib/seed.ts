import type { AppData, Project } from "../types";
import { createId, nowIso } from "./ids";

export function createProject(title = "Untitled Draft"): AppData {
  const projectId = createId("project");
  const sceneOne = createId("scene");
  const sceneTwo = createId("scene");
  const versionOne = createId("version");
  const versionTwo = createId("version");
  const noteId = createId("note");
  const highlightId = createId("highlight");
  const taskId = createId("task");
  const createdAt = nowIso();
  const project: Project = {
    projectId,
    title,
    writingMode: "script",
    createdAt,
    updatedAt: createdAt,
    coverPage: {
      title,
      writtenBy: "",
      contact: "",
      date: createdAt.slice(0, 10),
    },
    drafts: [],
    scenes: [
      {
        sceneId: sceneOne,
        projectId,
        heading: "INT. WRITING ROOM - NIGHT",
        order: 1,
        currentVersionId: versionOne,
        status: "Needs Rewrite",
        createdAt,
        updatedAt: createdAt,
      },
      {
        sceneId: sceneTwo,
        projectId,
        heading: "EXT. CITY STREET - MORNING",
        order: 2,
        currentVersionId: versionTwo,
        status: "For Review",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };

  return {
    projects: [project],
    versions: [
      {
        versionId: versionOne,
        sceneId: sceneOne,
        versionNumber: 1,
        text: "INT. WRITING ROOM - NIGHT\n\nA writer stares at a blank page. The cursor waits.\n\nWRITER\nNot tonight. Tonight we move forward.",
        createdAt,
        isCurrent: true,
      },
      {
        versionId: versionTwo,
        sceneId: sceneTwo,
        versionNumber: 1,
        text: "EXT. CITY STREET - MORNING\n\nThe first buses sigh awake. A notebook opens in someone's hands.",
        createdAt,
        isCurrent: true,
      },
    ],
    notes: [
      {
        noteId,
        sceneId: sceneOne,
        versionId: versionOne,
        selectedText: "The cursor waits.",
        rangeStart: 58,
        rangeEnd: 75,
        noteText: "Clarify the visual action and make the resistance more specific.",
        noteType: "Clarify",
        priority: "High",
        resolved: false,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    highlights: [
      {
        highlightId,
        sceneId: sceneOne,
        versionId: versionOne,
        selectedText: "The cursor waits.",
        rangeStart: 58,
        rangeEnd: 75,
        color: "#ffe08a",
        hasNote: true,
        noteId,
      },
    ],
    tasks: [
      {
        taskId,
        sceneId: sceneOne,
        sourceVersionId: versionOne,
        linkedNoteIds: [noteId],
        priority: "High",
        status: "Open",
        createdAt,
      },
    ],
    activeProjectId: projectId,
  };
}
