import { parseScreenplayText } from "./screenplay";

export function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function wrappedLineCount(text: string, charactersPerLine: number) {
  if (!text.trim()) return 1;
  return text
    .split("\n")
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.trim().length / charactersPerLine)), 0);
}

export function screenplayPageCount(text: string) {
  if (!text.trim()) return 1;
  const blocks = parseScreenplayText(text);
  const lines = blocks.reduce((count, block) => {
    const charactersPerLine =
      block.element === "Dialogue"
        ? 34
        : block.element === "Parenthetical"
          ? 28
          : block.element === "Character" || block.element === "Transition" || block.element === "Scene Heading"
            ? 60
            : 58;
    const gap = block.hasGapBefore ? 1 : 0;
    return count + gap + wrappedLineCount(block.text, charactersPerLine);
  }, 0);
  return Math.max(1, Math.ceil(lines / 55));
}

export function prosePageCount(text: string) {
  return Math.max(1, Math.ceil(wordCount(text) / 250));
}

export function writingModePageCount(writingMode: "script" | "freewrite", text: string) {
  return writingMode === "script" ? screenplayPageCount(text) : prosePageCount(text);
}

export function pageCountLabel(pages: number) {
  return `${pages} page${pages === 1 ? "" : "s"}`;
}
