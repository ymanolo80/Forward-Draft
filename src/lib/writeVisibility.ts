import type { DraftBlock, FadeTiming, VisibilityRule, WritingMode } from "../types";

export interface VisibleDraftBlock {
  block: DraftBlock;
  faded: boolean;
}

function visibleCount(rule: VisibilityRule) {
  if (rule === "last2") return 2;
  if (rule === "last3") return 3;
  if (rule === "last4") return 4;
  if (rule === "last5") return 5;
  return 1;
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
  const sectionBlocks = currentSection(blocks, writingMode);
  const count = visibleCount(visibility);
  if (sectionBlocks.length === 0) return [];
  const currentStart = Math.floor((sectionBlocks.length - 1) / count) * count;
  const currentComplete = sectionBlocks.length - currentStart === count;
  const previousStart = Math.max(0, currentStart - count);
  return sectionBlocks.slice(previousStart).map((block, index) => ({
    block,
    faded: currentComplete && previousStart < currentStart && previousStart + index < currentStart,
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
  return visibleDraftBlocks(blocks, writingMode, visibility).map((block) => ({
    block,
    faded: timedFadeReached,
  }));
}
