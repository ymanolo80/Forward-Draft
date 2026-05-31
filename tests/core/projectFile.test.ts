import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openProjectFileIntoData } from "../../src/lib/projectIO";
import {
  parseProjectFileText,
  projectFileName,
  projectTitleFromFileName,
  serializeProjectFile,
} from "../../src/lib/projectFile";
import type { AppData } from "../../src/types";

function fixtureText(name: string) {
  return readFileSync(resolve(process.cwd(), "tests", "fixtures", name), "utf8");
}

function emptyData(): AppData {
  return {
    projects: [],
    versions: [],
    notes: [],
    highlights: [],
    tasks: [],
  };
}

describe("Forward Draft project files", () => {
  it("parses a valid .frdx project with scenes, notes, highlights, and tasks", () => {
    const document = parseProjectFileText(fixtureText("basic-project.frdx"));

    expect(document.project.title).toBe("Fixture Project");
    expect(document.project.scenes).toHaveLength(2);
    expect(document.versions).toHaveLength(2);
    expect(document.notes[0]?.selectedText).toBe("cursor waits");
    expect(document.highlights[0]?.noteId).toBe(document.notes[0]?.noteId);
    expect(document.tasks[0]?.linkedNoteIds).toContain(document.notes[0]?.noteId);
  });

  it("rejects files that were not saved by Forward Draft", () => {
    expect(() => parseProjectFileText(fixtureText("invalid-project.frdx"))).toThrow(/not a valid \.frdx/i);
  });

  it("uses the opened filename as the project title, so renamed files open as renamed projects", () => {
    const result = openProjectFileIntoData(emptyData(), {
      name: "Renamed Fixture.frdx",
      text: fixtureText("basic-project.frdx"),
    });

    expect(result.importedAsCopy).toBe(false);
    expect(result.originalTitle).toBe("Fixture Project");
    expect(result.title).toBe("Renamed Fixture");
    expect(result.data.projects[0]?.title).toBe("Renamed Fixture");
  });

  it("imports a duplicate .frdx as a safe copy with new ids", () => {
    const first = openProjectFileIntoData(emptyData(), {
      name: "Fixture Project.frdx",
      text: fixtureText("basic-project.frdx"),
    });
    const second = openProjectFileIntoData(first.data, {
      name: "Fixture Project.frdx",
      text: fixtureText("basic-project.frdx"),
    });

    expect(second.importedAsCopy).toBe(true);
    expect(second.data.projects).toHaveLength(2);
    expect(second.data.projects[1]?.title).toBe("Fixture Project Copy");
    expect(second.data.projects[1]?.projectId).not.toBe(second.data.projects[0]?.projectId);
    expect(second.data.projects[1]?.scenes[0]?.sceneId).not.toBe(second.data.projects[0]?.scenes[0]?.sceneId);
  });

  it("serializes a parsed project back to the .frdx signature format", () => {
    const document = parseProjectFileText(fixtureText("basic-project.frdx"));
    const data: AppData = {
      projects: [document.project],
      versions: document.versions,
      notes: document.notes,
      highlights: document.highlights,
      tasks: document.tasks,
      activeProjectId: document.project.projectId,
    };

    const serialized = serializeProjectFile(document.project, data);
    const reparsed = parseProjectFileText(serialized);

    expect(serialized.startsWith("FRDX/1\n")).toBe(true);
    expect(reparsed.project.title).toBe("Fixture Project");
    expect(reparsed.notes).toHaveLength(1);
  });

  it("creates clean project filenames and titles", () => {
    const document = parseProjectFileText(fixtureText("basic-project.frdx"));

    expect(projectFileName({ ...document.project, title: "My Draft: Final?" })).toBe("My Draft Final.frdx");
    expect(projectTitleFromFileName("Duplicated Draft.frdx")).toBe("Duplicated Draft");
  });
});
