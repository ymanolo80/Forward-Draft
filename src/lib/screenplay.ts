import type { ScriptElement } from "../types";

export interface ScreenplayTextBlock {
  element: ScriptElement;
  text: string;
  rangeStart: number;
  rangeEnd: number;
  hasGapBefore: boolean;
}

const sceneHeadingPattern = /^(?:INT|EXT|EST|I\/E|INT\/EXT|EXT\/INT|INT\.\/EXT|EXT\.\/INT)[\s./]/i;
const transitionPattern = /^(?:FADE IN:|FADE OUT\.?|CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|JUMP CUT TO:|BACK TO:|INTERCUT WITH:)$/i;

function likelyCharacterLine(value: string) {
  const plain = stripInlineFountain(value);
  if (!plain || plain.length > 48 || plain !== plain.toUpperCase() || !/\p{Lu}/u.test(plain)) return false;
  if (sceneHeadingPattern.test(plain) || transitionPattern.test(plain)) return false;
  if (plain.startsWith("(") || plain.startsWith(">") || plain.startsWith("#") || plain.startsWith("[[")) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N} .,'’()\-]*$/u.test(plain);
}

export function parseScreenplayText(text: string): ScreenplayTextBlock[] {
  const rows: { text: string; rangeStart: number; rangeEnd: number }[] = [];
  let start = 0;
  text.split("\n").forEach((line) => {
    rows.push({ text: line, rangeStart: start, rangeEnd: start + line.length });
    start += line.length + 1;
  });

  const blocks: ScreenplayTextBlock[] = [];
  let blankLines = 0;
  let dialogueMode = false;
  let previousElement: ScriptElement | undefined;

  rows.forEach((row) => {
    const value = row.text.trim();
    if (!value) {
      blankLines += 1;
      if (previousElement === "Dialogue") dialogueMode = false;
      return;
    }

    const plainValue = stripInlineFountain(value);
    let element: ScriptElement = "Action";
    if (sceneHeadingPattern.test(plainValue)) {
      element = "Scene Heading";
      dialogueMode = false;
    } else if (transitionPattern.test(plainValue) || (plainValue.startsWith(">") && plainValue.endsWith(":"))) {
      element = "Transition";
      dialogueMode = false;
    } else if (dialogueMode && plainValue.startsWith("(") && plainValue.endsWith(")")) {
      element = "Parenthetical";
    } else if (likelyCharacterLine(value)) {
      element = "Character";
      dialogueMode = true;
    } else if (dialogueMode) {
      element = "Dialogue";
    }

    blocks.push({
      element,
      text: row.text,
      rangeStart: row.rangeStart,
      rangeEnd: row.rangeEnd,
      hasGapBefore: blankLines > 0,
    });
    blankLines = 0;
    previousElement = element;
  });

  return blocks;
}

export function formatScreenplayLine(element: ScriptElement, line: string) {
  const value = line.trim();
  if (element === "Scene Heading" || element === "Character" || element === "Transition") return value.toUpperCase();
  if (element === "Parenthetical" && value) return value.startsWith("(") ? value : `(${value})`;
  return line;
}

export function formatScreenplayLineAtCursor(text: string, cursor: number, element: ScriptElement) {
  const { lineStart, lineEnd } = screenplayLineAtCursor(text, cursor);
  const line = text.slice(lineStart, lineEnd);
  const formatted = formatScreenplayLine(element, line);
  const nextText = `${text.slice(0, lineStart)}${formatted}${text.slice(lineEnd)}`;
  return {
    text: nextText,
    cursor: lineStart + Math.min(formatted.length, Math.max(0, cursor - lineStart + formatted.length - line.length)),
  };
}

export function screenplayLineAtCursor(text: string, cursor: number) {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const lineStart = text.lastIndexOf("\n", Math.max(0, safeCursor - 1)) + 1;
  const nextLineBreak = text.indexOf("\n", safeCursor);
  const lineEnd = nextLineBreak < 0 ? text.length : nextLineBreak;
  return { lineStart, lineEnd, text: text.slice(lineStart, lineEnd) };
}

export function replaceScreenplayLineAtCursor(text: string, cursor: number, replacement: string) {
  const { lineStart, lineEnd } = screenplayLineAtCursor(text, cursor);
  return {
    text: `${text.slice(0, lineStart)}${replacement}${text.slice(lineEnd)}`,
    cursor: lineStart + replacement.length,
  };
}

export function wrapTextSelection(text: string, start: number, end: number, marker: string) {
  if (start === end) return undefined;
  const selectionStart = Math.max(0, Math.min(start, end, text.length));
  const selectionEnd = Math.max(selectionStart, Math.min(Math.max(start, end), text.length));
  return {
    text: `${text.slice(0, selectionStart)}${marker}${text.slice(selectionStart, selectionEnd)}${marker}${text.slice(selectionEnd)}`,
    selectionStart: selectionStart + marker.length,
    selectionEnd: selectionEnd + marker.length,
  };
}

export type InlineFountainStyle = "bold" | "italic" | "underline" | "bold-italic";

export interface InlineFountainSegment {
  text: string;
  style?: InlineFountainStyle;
}

export function parseInlineFountain(text: string): InlineFountainSegment[] {
  const segments: InlineFountainSegment[] = [];
  const pattern = /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|_[^_\n]+_|\*[^*\n]+\*)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: text.slice(cursor, index) });
    const token = match[0];
    if (token.startsWith("***")) segments.push({ text: token.slice(3, -3), style: "bold-italic" });
    else if (token.startsWith("**")) segments.push({ text: token.slice(2, -2), style: "bold" });
    else if (token.startsWith("_")) segments.push({ text: token.slice(1, -1), style: "underline" });
    else segments.push({ text: token.slice(1, -1), style: "italic" });
    cursor = index + token.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments.length ? segments : [{ text }];
}

export function stripInlineFountain(text: string) {
  return parseInlineFountain(text).map((segment) => segment.text).join("");
}
