import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { ScriptElement } from "../types";
import { cycleElement, elementClass, inferNextElement } from "../lib/fountain";
import { formatScreenplayLine, parseInlineFountain, parseScreenplayText } from "../lib/screenplay";

export interface VisualScreenplayEditorHandle {
  applyElement: (element: ScriptElement) => void;
  focus: () => void;
  formatSelection: (marker: string) => void;
  replaceActiveLine: (text: string) => void;
}

interface VisualScreenplayEditorProps {
  currentElement: ScriptElement;
  onChange: (text: string) => void;
  onElementChange: (element: ScriptElement) => void;
  onActiveLineChange: (text: string) => void;
  text: string;
}

function appendInlineText(element: HTMLElement, text: string) {
  parseInlineFountain(text).forEach((segment) => {
    let node: Node = document.createTextNode(segment.text);
    if (segment.style === "bold" || segment.style === "bold-italic") {
      const strong = document.createElement("strong");
      strong.append(node);
      node = strong;
    }
    if (segment.style === "italic" || segment.style === "bold-italic") {
      const em = document.createElement("em");
      em.append(node);
      node = em;
    }
    if (segment.style === "underline") {
      const underline = document.createElement("u");
      underline.append(node);
      node = underline;
    }
    element.append(node);
  });
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "";
  const content = Array.from(node.childNodes).map(serializeInline).join("");
  const tag = node.tagName.toLowerCase();
  const weight = node.style.fontWeight;
  const isBold = tag === "strong" || tag === "b" || weight === "bold" || Number(weight) >= 600;
  const isItalic = tag === "em" || tag === "i" || node.style.fontStyle === "italic";
  const isUnderline = tag === "u" || node.style.textDecoration.includes("underline");
  if (isBold && isItalic) return `***${content}***`;
  if (isBold) return `**${content}**`;
  if (isItalic) return `*${content}*`;
  if (isUnderline) return `_${content}_`;
  return content;
}

function lineElement(line: HTMLElement): ScriptElement {
  return (line.dataset.element as ScriptElement | undefined) ?? "Action";
}

function serializeLine(line: HTMLElement) {
  const text = Array.from(line.childNodes).map(serializeInline).join("");
  const element = lineElement(line);
  return element === "Scene Heading" || element === "Character" || element === "Transition" ? text.toUpperCase() : text;
}

function editorText(root: HTMLElement) {
  return Array.from(root.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.dataset.editorLine === "true")
    .map(serializeLine)
    .join("\n");
}

function activeLine(root: HTMLElement) {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const element = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
  const line = element?.closest<HTMLElement>("[data-editor-line='true']");
  return line && root.contains(line) ? line : undefined;
}

function focusLine(line: HTMLElement, atEnd = true) {
  line.focus();
  const range = document.createRange();
  range.selectNodeContents(line);
  range.collapse(!atEnd);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function styleLine(line: HTMLElement, element: ScriptElement, explicit = false) {
  line.dataset.element = element;
  if (explicit) line.dataset.explicitElement = "true";
  line.className = `rewrite-visual-line screenplay-block ${elementClass(element)}`;
}

function createLine(element: ScriptElement, text = "", explicit = false) {
  const line = document.createElement("div");
  line.dataset.editorLine = "true";
  styleLine(line, element, explicit);
  if (text) appendInlineText(line, text);
  else line.append(document.createElement("br"));
  return line;
}

function populateEditor(root: HTMLElement, text: string) {
  const parsed = new Map(parseScreenplayText(text).map((block) => [block.rangeStart, block]));
  let offset = 0;
  root.replaceChildren(
    ...text.split("\n").map((rawLine) => {
      const block = parsed.get(offset);
      const line = createLine(block?.element ?? "Action", rawLine);
      if (!rawLine) line.classList.add("blank-line");
      offset += rawLine.length + 1;
      return line;
    }),
  );
}

export const VisualScreenplayEditor = forwardRef<VisualScreenplayEditorHandle, VisualScreenplayEditorProps>(
  function VisualScreenplayEditor({ currentElement, onActiveLineChange, onChange, onElementChange, text }, forwardedRef) {
    const rootRef = useRef<HTMLDivElement>(null);
    const activeLineRef = useRef<HTMLElement | null>(null);
    const lastTextRef = useRef("");

    const resolveActiveLine = () => {
      const root = rootRef.current;
      if (!root) return undefined;
      return activeLineRef.current && root.contains(activeLineRef.current)
        ? activeLineRef.current
        : activeLine(root);
    };

    const emitChange = () => {
      const root = rootRef.current;
      if (!root) return;
      const nextText = editorText(root);
      lastTextRef.current = nextText;
      onChange(nextText);
      const line = resolveActiveLine();
      if (line) onActiveLineChange(serializeLine(line));
    };

    const applyElement = (element: ScriptElement) => {
      const root = rootRef.current;
      if (!root) return;
      const line = resolveActiveLine() ?? root.querySelector<HTMLElement>("[data-editor-line='true']") ?? createLine(currentElement);
      if (!root.contains(line)) root.append(line);
      activeLineRef.current = line;
      const formatted = formatScreenplayLine(element, serializeLine(line));
      line.replaceChildren();
      appendInlineText(line, formatted);
      styleLine(line, element, true);
      onElementChange(element);
      emitChange();
      focusLine(line);
    };

    const replaceActiveLine = (replacement: string) => {
      const root = rootRef.current;
      const line = root ? resolveActiveLine() : undefined;
      if (!line) return;
      activeLineRef.current = line;
      line.replaceChildren();
      appendInlineText(line, replacement);
      emitChange();
      focusLine(line);
    };

    const formatSelection = (marker: string) => {
      const root = rootRef.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.isCollapsed || !selection.anchorNode || !root.contains(selection.anchorNode)) return;
      const command = marker === "**" ? "bold" : marker === "*" ? "italic" : "underline";
      document.execCommand(command, false);
      emitChange();
    };

    useLayoutEffect(() => {
      const root = rootRef.current;
      if (!root || lastTextRef.current === text) return;
      if (document.activeElement === root) return;
      populateEditor(root, text);
      lastTextRef.current = text;
    }, [text]);

    useImperativeHandle(forwardedRef, () => ({
      applyElement,
      focus: () => rootRef.current?.focus(),
      formatSelection,
      replaceActiveLine,
    }));

    return (
      <div
        aria-label="Rewrite screenplay editor"
        className="rewrite-editor rewrite-visual-editor"
        contentEditable
        onBlur={emitChange}
        onClick={(event) => {
          const target = event.target instanceof HTMLElement ? event.target : undefined;
          const line = target?.closest<HTMLElement>("[data-editor-line='true']") ?? resolveActiveLine();
          if (!line) return;
          activeLineRef.current = line;
          onElementChange(lineElement(line));
          onActiveLineChange(serializeLine(line));
        }}
        onInput={emitChange}
        onKeyDown={(event) => {
          const root = rootRef.current;
          const line = root ? resolveActiveLine() : undefined;
          if (!root || !line) return;
          activeLineRef.current = line;
          if (event.key === "Tab") {
            event.preventDefault();
            applyElement(cycleElement(lineElement(line)));
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const nextElement = inferNextElement(lineElement(line), serializeLine(line));
            const nextLine = createLine(nextElement, "", true);
            line.after(nextLine);
            activeLineRef.current = nextLine;
            onElementChange(nextElement);
            emitChange();
            focusLine(nextLine, false);
          }
        }}
        onKeyUp={() => {
          const line = resolveActiveLine();
          if (!line) return;
          activeLineRef.current = line;
          if (!line.dataset.explicitElement) styleLine(line, lineElement(line));
          onActiveLineChange(serializeLine(line));
        }}
        ref={rootRef}
        role="textbox"
        spellCheck
        suppressContentEditableWarning
      />
    );
  },
);
