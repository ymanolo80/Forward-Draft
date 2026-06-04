import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importFountainProject } from "../../src/lib/fountain";
import { importFdxProject, importTxtProject } from "../../src/lib/scriptImport";
import { parseScreenplayText } from "../../src/lib/screenplay";

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
    expect(parseScreenplayText(imported.versions[0]?.text ?? "").map((block) => block.element)).toEqual([
      "Scene Heading",
      "Action",
      "Character",
      "Dialogue",
    ]);
  });

  it("preserves consecutive Final Draft dialogue paragraphs as dialogue", () => {
    const imported = importFdxProject(
      "dialogue.fdx",
      `<?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. ROOM - NIGHT</Text></Paragraph>
          <Paragraph Type="Character"><Text>Mira</Text></Paragraph>
          <Paragraph Type="Dialogue"><Text>First line.</Text></Paragraph>
          <Paragraph Type="Dialogue"><Text>Second line.</Text></Paragraph>
          <Paragraph Type="Action"><Text>She waits.</Text></Paragraph>
        </Content>
      </FinalDraft>`,
    );

    expect(parseScreenplayText(imported.versions[0]?.text ?? "").map((block) => block.element)).toEqual([
      "Scene Heading",
      "Character",
      "Dialogue",
      "Dialogue",
      "Action",
    ]);
  });

  it("preserves Greek Final Draft character and dialogue classification", () => {
    const imported = importFdxProject(
      "greek-dialogue.fdx",
      `<?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. KITCHEN - NIGHT</Text></Paragraph>
          <Paragraph Type="Character"><Text>Αντρονίκη</Text></Paragraph>
          <Paragraph Type="Parenthetical"><Text>ψιθυριστά</Text></Paragraph>
          <Paragraph Type="Dialogue"><Text>Καλά δεν μπορούσες να μου το πεις;</Text></Paragraph>
        </Content>
      </FinalDraft>`,
    );

    expect(parseScreenplayText(imported.versions[0]?.text ?? "").map((block) => block.element)).toEqual([
      "Scene Heading",
      "Character",
      "Parenthetical",
      "Dialogue",
    ]);
  });

  it("rejects empty TXT imports cleanly", () => {
    expect(() => importTxtProject("invalid-import.txt", fixtureText("invalid-import.txt"))).toThrow(/empty/i);
  });
});
