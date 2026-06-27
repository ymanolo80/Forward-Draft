import { describe, expect, it } from "vitest";
import { appProjectFileName, reconcileWithAppStore } from "../../src/lib/projectStore";
import type { ProjectFileDocument } from "../../src/lib/projectFile";
import type { AppData, Project } from "../../src/types";

const at = "2026-06-16T00:00:00.000Z";

function project(id: string, title = id): Project {
  return {
    projectId: id,
    title,
    writingMode: "script",
    createdAt: at,
    updatedAt: at,
    drafts: [],
    scenes: [
      { sceneId: `${id}-s`, projectId: id, heading: "INT", order: 1, currentVersionId: `${id}-v`, status: "For Review", createdAt: at, updatedAt: at },
    ],
  };
}

function doc(id: string, title = id): ProjectFileDocument {
  return {
    app: "Forward Draft",
    kind: "forward-draft-project",
    schemaVersion: 1,
    savedAt: at,
    project: project(id, title),
    versions: [{ versionId: `${id}-v`, sceneId: `${id}-s`, versionNumber: 1, text: `${id} text`, createdAt: at, isCurrent: true }],
    notes: [],
    highlights: [],
    tasks: [],
  };
}

function data(projects: Project[], activeProjectId?: string): AppData {
  return {
    projects,
    versions: projects.map((p) => ({ versionId: `${p.projectId}-v`, sceneId: `${p.projectId}-s`, versionNumber: 1, text: "cached", createdAt: at, isCurrent: true })),
    notes: [],
    highlights: [],
    tasks: [],
    activeProjectId,
  };
}

describe("reconcileWithAppStore", () => {
  it("recovers a project found only in the app-owned store", () => {
    const merged = reconcileWithAppStore(data([]), [doc("a")]);
    expect(merged.projects.map((p) => p.projectId)).toEqual(["a"]);
    expect(merged.versions.find((v) => v.versionId === "a-v")?.text).toBe("a text");
    expect(merged.activeProjectId).toBe("a");
  });

  it("keeps the cached project and never overwrites it with a backup", () => {
    const merged = reconcileWithAppStore(data([project("a", "Cached")], "a"), [doc("a", "Backup")]);
    expect(merged.projects).toHaveLength(1);
    expect(merged.projects[0].title).toBe("Cached");
    expect(merged.versions.find((v) => v.versionId === "a-v")?.text).toBe("cached");
  });

  it("recovers only the missing projects alongside cached ones", () => {
    const merged = reconcileWithAppStore(data([project("a")], "a"), [doc("a"), doc("b")]);
    expect(merged.projects.map((p) => p.projectId).sort()).toEqual(["a", "b"]);
    expect(merged.activeProjectId).toBe("a");
  });

  it("returns the stored data unchanged when there are no backups", () => {
    const stored = data([project("a")], "a");
    expect(reconcileWithAppStore(stored, [])).toBe(stored);
  });

  it("derives an active project only when recovering into empty data", () => {
    const merged = reconcileWithAppStore(data([]), [doc("a"), doc("b")]);
    expect(merged.activeProjectId).toBe("a");
  });

  it("names backups by readable title alone, sanitising unsafe chars", () => {
    const p = { projectId: "project_abcd1234", title: "The Lighthouse Keeper" };
    expect(appProjectFileName(p, [p])).toBe("The Lighthouse Keeper.frdx");
    expect(appProjectFileName({ projectId: "project_zzzzzzzz", title: 'Act 1: "Dawn"/End' }, [])).toBe("Act 1- -Dawn--End.frdx");
    expect(appProjectFileName({ projectId: "project_qqqqqqqq", title: "   " }, [])).toBe("Untitled.frdx");
  });

  it("adds a unique suffix only when two projects share a title", () => {
    const a = { projectId: "project_aaaaaaaa", title: "Same" };
    const b = { projectId: "project_bbbbbbbb", title: "Same" };
    expect(appProjectFileName(a, [a, b])).toBe("Same aaaaaaaa.frdx");
    expect(appProjectFileName(b, [a, b])).toBe("Same bbbbbbbb.frdx");
    expect(appProjectFileName(a, [a])).toBe("Same.frdx"); // no clash → clean
  });
});
