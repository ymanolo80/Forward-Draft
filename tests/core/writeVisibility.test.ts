import { describe, expect, it } from "vitest";
import { visibleDraftBlocks, visibleDraftWindow } from "../../src/lib/writeVisibility";
import type { DraftBlock } from "../../src/types";

function block(element: DraftBlock["element"], text: string): DraftBlock {
  return {
    blockId: `${element}-${text}`,
    element,
    text,
    createdAt: "2026-06-04T00:00:00.000Z",
  };
}

describe("Write visible text window", () => {
  const scriptBlocks = [
    block("Scene Heading", "INT. FIRST ROOM - DAY"),
    block("Action", "First scene action."),
    block("Scene Heading", "INT. SECOND ROOM - NIGHT"),
    block("Action", "Second scene action."),
    block("Dialogue", "Second scene dialogue."),
  ];

  it("keeps the selected number of recent lines together", () => {
    expect(visibleDraftBlocks(scriptBlocks, "script", "last3").map((item) => item.text)).toEqual([
      "INT. SECOND ROOM - NIGHT",
      "Second scene action.",
      "Second scene dialogue.",
    ]);
  });

  it("does not borrow lines from the previous scene when the current scene is shorter than the selected window", () => {
    const shortCurrentScene = [
      block("Scene Heading", "INT. FIRST ROOM - DAY"),
      block("Action", "First scene action."),
      block("Dialogue", "First scene dialogue."),
      block("Scene Heading", "INT. SECOND ROOM - NIGHT"),
      block("Action", "Only current action."),
    ];

    expect(visibleDraftBlocks(shortCurrentScene, "script", "last5").map((item) => item.text)).toEqual([
      "INT. SECOND ROOM - NIGHT",
      "Only current action.",
    ]);
  });

  it("shows both the previous and current scene", () => {
    expect(visibleDraftBlocks(scriptBlocks, "script", "previousScene")).toEqual(scriptBlocks);
  });

  it("shows both the previous and current chapter", () => {
    const chapters = [
      block("Chapter Heading", "Chapter One"),
      block("General Text", "First chapter."),
      block("Chapter Heading", "Chapter Two"),
      block("General Text", "Second chapter."),
    ];

    expect(visibleDraftBlocks(chapters, "freewrite", "previousChapter")).toEqual(chapters);
  });

  it("fades every visible block when a timed fade is reached", () => {
    expect(visibleDraftWindow(scriptBlocks, "script", "last3", "3s", true).map((item) => item.faded)).toEqual([
      true,
      true,
      true,
    ]);
    expect(visibleDraftWindow(scriptBlocks, "script", "last3", "3s", false).map((item) => item.faded)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("keeps a rolling line window when fading after the next block", () => {
    const firstSix = [
      block("Action", "One"),
      block("Action", "Two"),
      block("Action", "Three"),
      block("Action", "Four"),
      block("Action", "Five"),
      block("Action", "Six"),
    ];
    expect(visibleDraftWindow(firstSix.slice(0, 5), "script", "last3", "nextBlock", false).map((item) => [item.block.text, item.faded])).toEqual([
      ["Three", false],
      ["Four", false],
      ["Five", false],
    ]);
    expect(visibleDraftWindow(firstSix, "script", "last3", "nextBlock", false).map((item) => [item.block.text, item.faded])).toEqual([
      ["Four", false],
      ["Five", false],
      ["Six", false],
    ]);
  });

  it("holds line windows only within the current chapter", () => {
    const chapters = [
      block("Chapter Heading", "Chapter One"),
      block("General Text", "Old paragraph."),
      block("Chapter Heading", "Chapter Two"),
      block("General Text", "Current paragraph."),
    ];

    expect(visibleDraftWindow(chapters, "freewrite", "last5", "nextBlock", false).map((item) => item.block.text)).toEqual([
      "Chapter Two",
      "Current paragraph.",
    ]);
  });

  it("keeps previous scene context readable until the following scene begins", () => {
    expect(visibleDraftWindow(scriptBlocks, "script", "previousScene", "nextBlock", false).every((item) => !item.faded)).toBe(true);
  });

  it("fades the oldest scene only after the following scene begins", () => {
    const threeScenes = [
      block("Scene Heading", "INT. FIRST - DAY"),
      block("Action", "First."),
      block("Scene Heading", "INT. SECOND - DAY"),
      block("Action", "Second."),
      block("Scene Heading", "INT. THIRD - DAY"),
      block("Action", "Third."),
    ];

    expect(visibleDraftWindow(threeScenes, "script", "previousScene", "nextBlock", false).map((item) => [item.block.text, item.faded])).toEqual([
      ["INT. FIRST - DAY", true],
      ["First.", true],
      ["INT. SECOND - DAY", false],
      ["Second.", false],
      ["INT. THIRD - DAY", false],
      ["Third.", false],
    ]);
  });
});
