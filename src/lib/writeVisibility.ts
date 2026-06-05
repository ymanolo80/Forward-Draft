import type { DraftBlock, FadeTiming, VisibilityRule, WritingMode } from "../types";

export interface VisibleDraftBlock {
  block: DraftBlock;
  displayText?: string;
  fragmentId?: string;
  faded: boolean;
}

function visibleCount(rule: VisibilityRule) {
  if (rule === "last2") return 2;
  if (rule === "last3") return 3;
  if (rule === "last4") return 4;
  if (rule === "last5") return 5;
  return 1;
}

function visualLineWidth(block: DraftBlock) {
  if (block.element === "Dialogue") return 36;
  if (block.element === "Parenthetical") return 30;
  if (block.element === "Character" || block.element === "Transition") return 28;
  return 62;
}

function splitVisualLines(block: DraftBlock) {
  const width = visualLineWidth(block);
  const paragraphs = block.text.split("\n");
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      return;
    }

    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
  });

  return lines.length ? lines : [block.text];
}

function visualFragments(blocks: DraftBlock[]) {
  return blocks.flatMap((block) =>
    splitVisualLines(block).map((displayText, index) => ({
      block,
      displayText,
      fragmentId: `${block.blockId}-${index}`,
    })),
  );
}

function currentAndPreviousSection(blocks: DraftBlock[], headingElement: DraftBlock["element"]) {
  const headingIndexes = blocks
    .map((block, index) => (block.element === headingElement ? index : -1))
    .filter((index) => index >= 0);
  const startIndex = headingIndexes.at(-2) ?? headingIndexes.at(-1) ?? 0;
  return blocks.slice(startIndex);
}

function currentSection(blocks: DraftBlock[], writingMode: WritingMode) {
  const headingElement = writingMode === "script" ? "Scene Heading" : "Chapter Heading";
  const startIndex = blocks.findLastIndex((block) => block.element === headingElement);
  return blocks.slice(Math.max(startIndex, 0));
}

export function visibleDraftBlocks(blocks: DraftBlock[], writingMode: WritingMode, visibility: VisibilityRule) {
  if (visibility === "previousScene" && writingMode === "script") {
    return currentAndPreviousSection(blocks, "Scene Heading");
  }
  if (visibility === "previousChapter" && writingMode === "freewrite") {
    return currentAndPreviousSection(blocks, "Chapter Heading");
  }
  return currentSection(blocks, writingMode).slice(-visibleCount(visibility));
}

function heldLineWindow(blocks: DraftBlock[], writingMode: WritingMode, visibility: VisibilityRule) {
  const sectionBlocks = visualFragments(currentSection(blocks, writingMode));
  const count = visibleCount(visibility);
  return sectionBlocks.slice(-count).map((item) => ({
    ...item,
    faded: false,
  }));
}

function heldSectionWindow(blocks: DraftBlock[], headingElement: DraftBlock["element"]) {
  const headingIndexes = blocks
    .map((block, index) => (block.element === headingElement ? index : -1))
    .filter((index) => index >= 0);
  const visibleStart = headingIndexes.at(-3) ?? 0;
  const readableStart = headingIndexes.at(-2) ?? visibleStart;
  return blocks.slice(visibleStart).map((block, index) => ({
    block,
    faded: visibleStart + index < readableStart,
  }));
}

export function visibleDraftWindow(
  blocks: DraftBlock[],
  writingMode: WritingMode,
  visibility: VisibilityRule,
  fadeTiming: FadeTiming,
  timedFadeReached: boolean,
): VisibleDraftBlock[] {
  const sectionContext =
    (writingMode === "script" && visibility === "previousScene") ||
    (writingMode === "freewrite" && visibility === "previousChapter");
  if (fadeTiming === "nextBlock" && sectionContext) {
    return heldSectionWindow(blocks, writingMode === "script" ? "Scene Heading" : "Chapter Heading");
  }
  if (fadeTiming === "nextBlock") return heldLineWindow(blocks, writingMode, visibility);
  const visibleItems = sectionContext
    ? visibleDraftBlocks(blocks, writingMode, visibility).map((block) => ({ block }))
    : visualFragments(currentSection(blocks, writingMode)).slice(-visibleCount(visibility));
  return visibleItems.map((item) => ({
    ...item,
    faded: timedFadeReached,
  }));
}
