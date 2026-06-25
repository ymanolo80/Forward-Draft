import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { editableSelection, wrapEditableSelection } from "../lib/inlineEditing";
import { appendInlineText, serializeInline } from "../lib/inlineFountainDom";

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

function editorText(root: HTMLElement) {
  return Array.from(root.childNodes).map(serializeInline).join("");
}

export const VisualInlineEditor = forwardRef<VisualInlineEditorHandle, VisualInlineEditorProps>(function VisualInlineEditor(
  { ariaLabel, className = "", onChange, onKeyDown, placeholder, text },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastTextRef = useRef("");
  const selectionRef = useRef<Range | undefined>(undefined);

  const emitChange = () => {
    const root = rootRef.current;
    if (!root) return;
    const nextText = editorText(root).replace(/\n/g, "");
    lastTextRef.current = nextText;
    onChange(nextText);
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

  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus(),
    formatSelection: (marker: string) => {
      const root = rootRef.current;
      if (!root || !wrapEditableSelection(root, marker, selectionRef.current)) return;
      selectionRef.current = editableSelection(root);
      emitChange();
    },
  }));

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || lastTextRef.current === text) return;
    const wasFocused = document.activeElement === root;
    root.replaceChildren();
    appendInlineText(root, text);
    lastTextRef.current = text;
    selectionRef.current = undefined;
    // When the text is replaced externally while focused (e.g. choosing an
    // autocomplete suggestion), place the caret at the end so continued typing
    // follows the inserted text instead of landing before it.
    if (wasFocused && text) {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
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
      onKeyUp={rememberSelection}
      onMouseUp={rememberSelection}
      onSelect={rememberSelection}
      onTouchEnd={rememberSelection}
      ref={rootRef}
      role="textbox"
      spellCheck
      suppressContentEditableWarning
    />
  );
});
