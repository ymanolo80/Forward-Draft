import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { ScriptElement } from "../types";
import { cycleElement, elementClass, inferNextElement } from "../lib/fountain";
import { editableSelection, wrapEditableSelection } from "../lib/inlineEditing";
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

function isUppercaseElement(element: ScriptElement) {
  return element === "Scene Heading" || element === "Character" || element === "Transition";
}

function rawLineText(line: HTMLElement) {
  return Array.from(line.childNodes).map(serializeInline).join("");
}

function serializeLine(line: HTMLElement) {
  const text = rawLineText(line);
  const element = lineElement(line);
  return isUppercaseElement(element) ? text.toUpperCase() : text;
}

function lineSelectionOffset(line: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !line.contains(selection.anchorNode)) {
    return rawLineText(line).length;
  }
  const range = document.createRange();
  range.selectNodeContents(line);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function replaceLineText(line: HTMLElement, text: string) {
  line.replaceChildren();
  if (text) appendInlineText(line, text);
  else line.append(document.createElement("br"));
  line.classList.toggle("blank-line", !text);
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
    const selectionRef = useRef<Range | undefined>(undefined);

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
      if (line) {
        onElementChange(lineElement(line));
        onActiveLineChange(serializeLine(line));
      }
    };

    const rememberSelection = () => {
      const root = rootRef.current;
      if (!root) return;
      selectionRef.current = editableSelection(root) ?? selectionRef.current;
    };

    useEffect(() => {
      document.addEventListener("selectionchange", rememberSelection);
      return () => document.removeEventListener("selectionchange", rememberSelection);
    }, []);

    const applyElement = (element: ScriptElement) => {
      const root = rootRef.current;
      if (!root) return;
      const line = resolveActiveLine() ?? root.querySelector<HTMLElement>("[data-editor-line='true']") ?? createLine(currentElement);
      if (!root.contains(line)) root.append(line);
      activeLineRef.current = line;
      const previousElement = lineElement(line);
      const rawText = rawLineText(line);
      if (isUppercaseElement(element) && !isUppercaseElement(previousElement) && rawText.trim()) {
        line.dataset.restoreText = rawText;
      }
      const baseText = !isUppercaseElement(element) && line.dataset.restoreText ? line.dataset.restoreText : serializeLine(line);
      const formatted = formatScreenplayLine(element, baseText);
      replaceLineText(line, formatted);
      if (!isUppercaseElement(element)) delete line.dataset.restoreText;
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
      replaceLineText(line, replacement);
      onElementChange(lineElement(line));
      onActiveLineChange(replacement);
      emitChange();
      focusLine(line);
    };

    const formatSelection = (marker: string) => {
      const root = rootRef.current;
      if (!root || !wrapEditableSelection(root, marker, selectionRef.current)) return;
      selectionRef.current = editableSelection(root);
      emitChange();
    };

    useLayoutEffect(() => {
      const root = rootRef.current;
      if (!root || lastTextRef.current === text) return;
      if (document.activeElement === root) return;
      populateEditor(root, text);
      lastTextRef.current = text;
      selectionRef.current = undefined;
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
            const element = lineElement(line);
            const rawText = rawLineText(line);
            const cursor = lineSelectionOffset(line);
            const canSplit = cursor > 0 && cursor < rawText.length && (element === "Action" || element === "Dialogue");
            const nextElement = canSplit ? element : inferNextElement(element, serializeLine(line));
            const nextText = canSplit ? rawText.slice(cursor).trimStart() : "";
            if (canSplit) replaceLineText(line, rawText.slice(0, cursor).trimEnd());
            const nextLine = createLine(nextElement, nextText, true);
            line.after(nextLine);
            activeLineRef.current = nextLine;
            onElementChange(nextElement);
            emitChange();
            focusLine(nextLine, false);
            return;
          }
          if ((event.key === "Backspace" || event.key === "Delete") && !rawLineText(line).trim()) {
            event.preventDefault();
            const target =
              event.key === "Backspace"
                ? line.previousElementSibling
                : line.nextElementSibling;
            if (target instanceof HTMLElement && target.dataset.editorLine === "true") {
              line.remove();
              activeLineRef.current = target;
              onElementChange(lineElement(target));
              emitChange();
              focusLine(target);
            }
          }
        }}
        onKeyUp={() => {
          const line = resolveActiveLine();
          if (!line) return;
          activeLineRef.current = line;
          if (!line.dataset.explicitElement) styleLine(line, lineElement(line));
          onActiveLineChange(serializeLine(line));
          rememberSelection();
        }}
        onMouseUp={rememberSelection}
        onSelect={rememberSelection}
        onTouchEnd={rememberSelection}
        ref={rootRef}
        role="textbox"
        spellCheck
        suppressContentEditableWarning
      />
    );
  },
);
