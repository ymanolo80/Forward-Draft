import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importFountainProject } from "../../src/lib/fountain";
import { importFdxProject, importTxtProject } from "../../src/lib/scriptImport";

function fixtureText(name: string) {
  return readFileSync(resolve(process.cwd(), "tests", "fixtures", name), "utf8");
}

describe("script imports", () => {
  it("imports Fountain title-page data and scene order", () => {
    const imported = importFountainProject("basic-script.fountain", fixtureText("basic-script.fountain"));

    expect(imported.project.title).toBe("Fixture Screenplay");
    expect(imported.project.coverPage?.writtenBy).toBe("Forward Draft QA");
    expect(imported.project.scenes.map((scene) => scene.heading)).toEqual([
      "INT. WRITING ROOM - NIGHT",
      "EXT. CITY STREET - MORNING",
    ]);
    expect(imported.versions[0]?.text).toContain("The cursor waits.");
  });

  it("imports screenplay-shaped TXT files as script projects", () => {
    const imported = importTxtProject("basic-script.txt", fixtureText("basic-script.txt"));

    expect(imported.project.writingMode).toBe("script");
    expect(imported.project.title).toBe("Fixture TXT Screenplay");
    expect(imported.project.coverPage?.writtenBy).toBe("Forward Draft QA");
    expect(imported.project.scenes).toHaveLength(2);
    expect(imported.project.scenes[1]?.heading).toBe("EXT. CITY STREET - MORNING");
  });

  it("imports chapter-shaped TXT files as freewriting projects", () => {
    const imported = importTxtProject("basic-freewrite.txt", fixtureText("basic-freewrite.txt"));

    expect(imported.project.writingMode).toBe("freewrite");
    expect(imported.project.scenes.map((scene) => scene.heading)).toEqual(["Chapter One", "Chapter Two"]);
    expect(imported.project.drafts.some((draft) => draft.element === "Chapter Heading")).toBe(true);
    expect(imported.project.drafts.some((draft) => draft.text.includes("quiet desk"))).toBe(true);
  });

  it("imports Final Draft title-page data and scene content", () => {
    const imported = importFdxProject("basic-script.fdx", fixtureText("basic-script.fdx"));

    expect(imported.project.title).toBe("Fixture Final Draft");
    expect(imported.project.coverPage?.writtenBy).toBe("Forward Draft QA");
    expect(imported.project.scenes).toHaveLength(2);
    expect(imported.project.scenes[0]?.heading).toBe("INT. WRITING ROOM - NIGHT");
    expect(imported.versions[0]?.text).toContain("Not tonight. Tonight we move forward.");
  });

  it("rejects empty TXT imports cleanly", () => {
    expect(() => importTxtProject("invalid-import.txt", fixtureText("invalid-import.txt"))).toThrow(/empty/i);
  });
});
