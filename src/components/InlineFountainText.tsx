import { Fragment } from "react";
import { parseInlineFountain } from "../lib/screenplay";

export function InlineFountainText({ text }: { text: string }) {
  return parseInlineFountain(text).map((segment, index) => {
    const key = `${index}-${segment.style ?? "plain"}`;
    if (segment.style === "bold") return <strong key={key}>{segment.text}</strong>;
    if (segment.style === "italic") return <em key={key}>{segment.text}</em>;
    if (segment.style === "underline") return <u key={key}>{segment.text}</u>;
    if (segment.style === "bold-italic") {
      return (
        <strong key={key}>
          <em>{segment.text}</em>
        </strong>
      );
    }
    return <Fragment key={key}>{segment.text}</Fragment>;
  });
}
