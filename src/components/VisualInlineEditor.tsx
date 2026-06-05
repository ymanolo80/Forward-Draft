import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { parseInlineFountain } from "../lib/screenplay";

export interface VisualInlineEditorHandle {
  focus: () => void;
  formatSelection: (marker: string) => void;
}

interface VisualInlineEditorProps {
  ariaLabel: string;
  className?: string;
  onChange: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder: string;
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

function editorText(root: HTMLElement) {
  return Array.from(root.childNodes).map(serializeInline).join("");
}

export const VisualInlineEditor = forwardRef<VisualInlineEditorHandle, VisualInlineEditorProps>(function VisualInlineEditor(
  { ariaLabel, className = "", onChange, onKeyDown, placeholder, text },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastTextRef = useRef("");

  const emitChange = () => {
    const root = rootRef.current;
    if (!root) return;
    const nextText = editorText(root).replace(/\n/g, "");
    lastTextRef.current = nextText;
    onChange(nextText);
  };

  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus(),
    formatSelection: (marker: string) => {
      const root = rootRef.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.isCollapsed || !selection.anchorNode || !root.contains(selection.anchorNode)) return;
      const command = marker === "**" ? "bold" : marker === "*" ? "italic" : "underline";
      document.execCommand(command, false);
      emitChange();
    },
  }));

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || lastTextRef.current === text) return;
    root.replaceChildren();
    appendInlineText(root, text);
    lastTextRef.current = text;
  }, [text]);

  return (
    <div
      aria-label={ariaLabel}
      className={`visual-inline-editor ${className}`}
      contentEditable
      data-placeholder={placeholder}
      onBlur={emitChange}
      onInput={emitChange}
      onKeyDown={onKeyDown}
      ref={rootRef}
      role="textbox"
      spellCheck
      suppressContentEditableWarning
    />
  );
});
