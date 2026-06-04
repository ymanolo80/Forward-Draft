export interface TextSelectionRange {
  text: string;
  rangeStart: number;
  rangeEnd: number;
}

function selectionRegion(root: HTMLElement, node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  const region = element?.closest<HTMLElement>("[data-script-offset]");
  return region && root.contains(region) ? region : undefined;
}

function textLengthBefore(region: HTMLElement, node: Node, offset: number) {
  const prefix = document.createRange();
  prefix.selectNodeContents(region);
  prefix.setEnd(node, offset);
  const fragment = prefix.cloneContents();
  fragment.querySelectorAll("[data-selection-ignore]").forEach((item) => item.remove());
  return fragment.textContent?.length ?? 0;
}

function cleanSelectedText(range: Range) {
  const fragment = range.cloneContents();
  fragment.querySelectorAll("[data-selection-ignore]").forEach((item) => item.remove());
  return fragment.textContent ?? "";
}

export function selectedTextRange(root: HTMLElement, sourceText: string): TextSelectionRange | undefined {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;

  const range = selection.getRangeAt(0);
  const startRegion = selectionRegion(root, range.startContainer);
  const endRegion = selectionRegion(root, range.endContainer);
  const selectedText = cleanSelectedText(range);
  if (!selectedText.trim()) return undefined;

  if (startRegion && startRegion === endRegion) {
    const baseOffset = Number(startRegion.dataset.scriptOffset ?? 0);
    const rangeStart = baseOffset + textLengthBefore(startRegion, range.startContainer, range.startOffset);
    const rangeEnd = baseOffset + textLengthBefore(startRegion, range.endContainer, range.endOffset);
    if (rangeEnd > rangeStart && sourceText.slice(rangeStart, rangeEnd) === selectedText) {
      return { text: selectedText, rangeStart, rangeEnd };
    }
  }

  const rangeStart = sourceText.indexOf(selectedText);
  if (rangeStart < 0) return undefined;
  return { text: selectedText, rangeStart, rangeEnd: rangeStart + selectedText.length };
}
