function markerTag(marker: string) {
  if (marker === "**") return "strong";
  if (marker === "*") return "em";
  if (marker === "_") return "u";
  return undefined;
}

function rangeIsInside(root: HTMLElement, range: Range) {
  return root.contains(range.startContainer) && root.contains(range.endContainer);
}

export function editableSelection(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (!rangeIsInside(root, range)) return undefined;
  return range.cloneRange();
}

function activeEditableRange(root: HTMLElement, fallback?: Range) {
  const current = editableSelection(root);
  if (current) return current;
  if (fallback && !fallback.collapsed && rangeIsInside(root, fallback)) return fallback.cloneRange();
  return undefined;
}

function restoreSelection(range: Range) {
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function matchingStyledAncestor(root: HTMLElement, range: Range, tag: string) {
  let node = range.commonAncestorContainer;
  let element = node instanceof HTMLElement ? node : node.parentElement;
  while (element && element !== root) {
    if (element.tagName.toLowerCase() === tag && element.contains(range.startContainer) && element.contains(range.endContainer)) {
      return element;
    }
    element = element.parentElement;
  }
  return undefined;
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return false;
  const first = element.firstChild;
  const last = element.lastChild;
  if (!first || !last) {
    element.remove();
    return true;
  }

  const nextRange = document.createRange();
  nextRange.setStartBefore(first);
  nextRange.setEndAfter(last);
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
  return restoreSelection(nextRange);
}

export function wrapEditableSelection(root: HTMLElement, marker: string, savedRange?: Range) {
  const tag = markerTag(marker);
  const range = activeEditableRange(root, savedRange);
  if (!tag || !range) return false;

  const styledAncestor = matchingStyledAncestor(root, range, tag);
  if (styledAncestor) return unwrapElement(styledAncestor);

  const wrapper = document.createElement(tag);
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  return restoreSelection(nextRange);
}
