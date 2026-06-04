import { describe, expect, it } from "vitest";
import {
  formatScreenplayLineAtCursor,
  parseScreenplayText,
  parseInlineFountain,
  replaceScreenplayLineAtCursor,
  screenplayLineAtCursor,
  wrapTextSelection,
} from "../../src/lib/screenplay";

describe("screenplay structure", () => {
  it("recognizes standard screenplay elements and preserves source offsets", () => {
    const text = [
      "INT. WRITING ROOM - NIGHT",
      "",
      "A writer stares at a blank page.",
      "",
      "WRITER",
      "(quietly)",
      "Not tonight.",
      "",
      "CUT TO:",
    ].join("\n");
    const blocks = parseScreenplayText(text);

    expect(blocks.map((block) => block.element)).toEqual([
      "Scene Heading",
      "Action",
      "Character",
      "Parenthetical",
      "Dialogue",
      "Transition",
    ]);
    blocks.forEach((block) => {
      expect(text.slice(block.rangeStart, block.rangeEnd)).toBe(block.text);
    });
  });

  it("recognizes Final Draft-style dialogue separated from its character by a blank line", () => {
    const blocks = parseScreenplayText("WRITER\n\nNot tonight.");

    expect(blocks.map((block) => block.element)).toEqual(["Character", "Dialogue"]);
  });

  it("recognizes uppercase Unicode character names", () => {
    const blocks = parseScreenplayText("ΑΝΤΡΟΝΙΚΗ\n(ψιθυριστά)\nΚαλά δεν μπορούσες να μου το πεις;");

    expect(blocks.map((block) => block.element)).toEqual(["Character", "Parenthetical", "Dialogue"]);
  });

  it("classifies screenplay elements even when inline formatting is present", () => {
    const blocks = parseScreenplayText("**INT. ROOM - NIGHT**\n\n**WRITER**\nA line.");

    expect(blocks.map((block) => block.element)).toEqual(["Scene Heading", "Character", "Dialogue"]);
  });

  it("formats only the active screenplay line", () => {
    const result = formatScreenplayLineAtCursor("Action line\nwriter\nDialogue line", 16, "Character");

    expect(result.text).toBe("Action line\nWRITER\nDialogue line");
  });

  it("reads and replaces only the active screenplay line", () => {
    expect(screenplayLineAtCursor("First\nSecond\nThird", 8).text).toBe("Second");
    expect(replaceScreenplayLineAtCursor("First\nSecond\nThird", 8, "REPLACED")).toEqual({
      text: "First\nREPLACED\nThird",
      cursor: 14,
    });
  });

  it("wraps only selected text in Fountain-compatible formatting markers", () => {
    expect(wrapTextSelection("Make this bold", 5, 9, "**")).toEqual({
      text: "Make **this** bold",
      selectionStart: 7,
      selectionEnd: 11,
    });
    expect(wrapTextSelection("No selection", 3, 3, "*")).toBeUndefined();
  });

  it("parses portable Fountain formatting for visual rendering", () => {
    expect(parseInlineFountain("A **bold** and _underlined_ word.")).toEqual([
      { text: "A " },
      { text: "bold", style: "bold" },
      { text: " and " },
      { text: "underlined", style: "underline" },
      { text: " word." },
    ]);
  });
});
