import { parseInlineFountain } from "./screenplay";

// Shared inline-Fountain <-> DOM helpers for the contentEditable editors.

export function appendInlineText(element: HTMLElement, text: string) {
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

export function serializeInline(node: Node): string {
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
