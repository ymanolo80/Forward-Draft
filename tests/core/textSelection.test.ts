import { afterEach, describe, expect, it } from "vitest";
import { selectedTextRange } from "../../src/lib/textSelection";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("review text selection", () => {
  it("calculates heading offsets without including the scene number", () => {
    const sourceText = "INT. WRITING ROOM - NIGHT\n\nAction.";
    const root = document.createElement("div");
    root.innerHTML = `
      <div>
        <span data-selection-ignore="true">12</span>
        <span data-script-offset="0">INT. WRITING ROOM - NIGHT</span>
      </div>
    `;
    document.body.appendChild(root);
    const headingText = root.querySelector<HTMLElement>("[data-script-offset]")?.firstChild;
    if (!headingText) throw new Error("Heading text was not created.");

    const range = document.createRange();
    range.setStart(headingText, 5);
    range.setEnd(headingText, 17);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(selectedTextRange(root, sourceText)).toEqual({
      text: "WRITING ROOM",
      rangeStart: 5,
      rangeEnd: 17,
    });
  });
});
