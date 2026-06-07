import { describe, expect, it } from "vitest";
import { cycleElement, importFountainProject } from "../../src/lib/fountain";
import { characterNameSuggestions, projectCharacterNames, sceneHeadingSuggestions, screenplayElementSuggestions } from "../../src/lib/scriptSuggestions";
import type { DraftBlock } from "../../src/types";

describe("script suggestions", () => {
  it("suggests character names found in imported scene versions", () => {
    const imported = importFountainProject(
      "characters.fountain",
      "INT. ROOM - NIGHT\n\nWRITER\nWe begin.\n\nMIRA (V.O.)\nKeep moving.",
    );

    expect(projectCharacterNames(imported.project, imported.versions)).toEqual(["MIRA (V.O.)", "WRITER"]);
    expect(characterNameSuggestions("mi", imported.project, imported.versions)).toEqual(["MIRA (V.O.)"]);
  });

  it("includes explicit Character blocks from the current writing draft", () => {
    const imported = importFountainProject("characters.fountain", "INT. ROOM - NIGHT\n\nAction.");
    const characterBlock: DraftBlock = {
      blockId: "character",
      element: "Character",
      text: "Alex",
      createdAt: "2026-06-04T00:00:00.000Z",
    };
    imported.project.drafts = [characterBlock];

    expect(characterNameSuggestions("a", imported.project, imported.versions)).toEqual(["ALEX"]);
  });

  it("suggests uppercase Unicode character names", () => {
    const imported = importFountainProject("greek.fountain", "INT. KITCHEN - NIGHT\n\nΑΝΤΡΟΝΙΚΗ\nΚαλά δεν μπορούσες;");

    expect(characterNameSuggestions("αν", imported.project, imported.versions)).toEqual(["ΑΝΤΡΟΝΙΚΗ"]);
  });

  it("suggests existing Unicode scene headings", () => {
    const imported = importFountainProject("greek.fountain", "INT. ΚΟΥΖΙΝΑ - NIGHT\n\nΑΝΤΡΟΝΙΚΗ\nΚαλά δεν μπορούσες;");

    expect(sceneHeadingSuggestions("int. κου", imported.project)).toContain("INT. ΚΟΥΖΙΝΑ - NIGHT");
  });

  it("cycles only through the visible writing elements", () => {
    expect(cycleElement("Transition")).toBe("Scene Heading");
    expect(cycleElement("Parenthetical")).toBe("Transition");
  });

  it("shares screenplay suggestions between writing and rewriting", () => {
    const imported = importFountainProject("suggestions.fountain", "INT. KITCHEN - NIGHT\n\nMIRA\nKeep moving.");

    expect(screenplayElementSuggestions("Scene Heading", "INT. K", imported.project, imported.versions)).toContain("INT. KITCHEN - ");
    expect(screenplayElementSuggestions("Character", "mi", imported.project, imported.versions)).toEqual(["MIRA"]);
    expect(screenplayElementSuggestions("Transition", "cut", imported.project, imported.versions)).toEqual(["CUT TO:"]);
  });
});
