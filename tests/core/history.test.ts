import { describe, expect, it } from "vitest";
import {
  applyProjectSnapshot,
  canRedo,
  canUndo,
  clearProjectHistory,
  HISTORY_LIMIT,
  recordEdit,
  redo,
  snapshotProject,
  undo,
  type HistoryMap,
} from "../../src/lib/history";
import type { AppData, Project, SceneVersion } from "../../src/types";

const at = "2026-06-16T00:00:00.000Z";

function project(projectId: string, versionText: string): { project: Project; version: SceneVersion } {
  const sceneId = `${projectId}-scene`;
  const versionId = `${projectId}-version`;
  return {
    project: {
      projectId,
      title: projectId,
      writingMode: "script",
      createdAt: at,
      updatedAt: at,
      drafts: [],
      scenes: [
        { sceneId, projectId, heading: "INT. ROOM", order: 1, currentVersionId: versionId, status: "For Review", createdAt: at, updatedAt: at },
      ],
    },
    version: { versionId, sceneId, versionNumber: 1, text: versionText, createdAt: at, isCurrent: true },
  };
}

function makeData(): AppData {
  const a = project("a", "alpha original");
  const b = project("b", "beta original");
  return {
    projects: [a.project, b.project],
    versions: [a.version, b.version],
    notes: [],
    highlights: [],
    tasks: [],
    activeProjectId: "a",
  };
}

function editVersion(data: AppData, projectId: string, text: string): AppData {
  return {
    ...data,
    versions: data.versions.map((version) =>
      version.versionId === `${projectId}-version` ? { ...version, text } : version,
    ),
  };
}

describe("per-project history", () => {
  it("snapshots only the target project's records", () => {
    const data = makeData();
    const snapshot = snapshotProject(data, "a");
    expect(snapshot?.project.projectId).toBe("a");
    expect(snapshot?.versions).toHaveLength(1);
    expect(snapshot?.versions[0].versionId).toBe("a-version");
  });

  it("records an edit and reports canUndo for that project only", () => {
    const data = makeData();
    const edited = editVersion(data, "a", "alpha edited");
    const history = recordEdit({}, "a", data, edited);
    expect(canUndo(history, "a")).toBe(true);
    expect(canUndo(history, "b")).toBe(false);
    expect(canRedo(history, "a")).toBe(false);
  });

  it("does not record when the project's records are unchanged (e.g. a project switch)", () => {
    const data = makeData();
    const switched = { ...data, activeProjectId: "b" };
    const history = recordEdit({}, "a", data, switched);
    expect(canUndo(history, "a")).toBe(false);
  });

  it("undo restores the previous text and enables redo", () => {
    const data = makeData();
    const edited = editVersion(data, "a", "alpha edited");
    const history = recordEdit({}, "a", data, edited);

    const undone = undo(history, "a", edited);
    expect(undone).toBeDefined();
    expect(undone!.data.versions.find((v) => v.versionId === "a-version")?.text).toBe("alpha original");
    expect(canUndo(undone!.history, "a")).toBe(false);
    expect(canRedo(undone!.history, "a")).toBe(true);

    const redone = redo(undone!.history, "a", undone!.data);
    expect(redone!.data.versions.find((v) => v.versionId === "a-version")?.text).toBe("alpha edited");
  });

  it("undoing project A never alters project B's records", () => {
    let data = makeData();
    let history: HistoryMap = {};

    const editedA = editVersion(data, "a", "alpha edited");
    history = recordEdit(history, "a", data, editedA);
    data = editedA;

    const editedB = editVersion(data, "b", "beta edited");
    history = recordEdit(history, "b", data, editedB);
    data = editedB;

    const undone = undo(history, "a", data)!;
    expect(undone.data.versions.find((v) => v.versionId === "a-version")?.text).toBe("alpha original");
    // B keeps its edit despite A being undone.
    expect(undone.data.versions.find((v) => v.versionId === "b-version")?.text).toBe("beta edited");
  });

  it("applyProjectSnapshot leaves other projects untouched", () => {
    const data = makeData();
    const snapshot = snapshotProject(editVersion(data, "a", "alpha v2"), "a")!;
    const applied = applyProjectSnapshot(editVersion(data, "b", "beta v2"), snapshot);
    expect(applied.versions.find((v) => v.versionId === "a-version")?.text).toBe("alpha v2");
    expect(applied.versions.find((v) => v.versionId === "b-version")?.text).toBe("beta v2");
  });

  it("recording a new edit clears the redo stack", () => {
    const data = makeData();
    const edited = editVersion(data, "a", "alpha edited");
    let history = recordEdit({}, "a", data, edited);
    const undone = undo(history, "a", edited)!;
    expect(canRedo(undone.history, "a")).toBe(true);

    const reEdited = editVersion(undone.data, "a", "alpha rewritten");
    history = recordEdit(undone.history, "a", undone.data, reEdited);
    expect(canRedo(history, "a")).toBe(false);
  });

  it("caps the undo stack at HISTORY_LIMIT", () => {
    let data = makeData();
    let history: HistoryMap = {};
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      const edited = editVersion(data, "a", `alpha ${index}`);
      history = recordEdit(history, "a", data, edited);
      data = edited;
    }
    expect(history.a.undo).toHaveLength(HISTORY_LIMIT);
  });

  it("clears a project's history on delete", () => {
    const data = makeData();
    const edited = editVersion(data, "a", "alpha edited");
    const history = recordEdit({}, "a", data, edited);
    expect(canUndo(clearProjectHistory(history, "a"), "a")).toBe(false);
  });
});
