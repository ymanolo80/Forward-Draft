import { afterEach, describe, expect, it, vi } from "vitest";
import { savePortableFile } from "../../src/lib/fileService";

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  document.body.replaceChildren();
});

describe("portable file saving", () => {
  it("downloads directly when a browser save picker is unavailable", async () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const share = vi.fn();
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:forward-draft") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const result = await savePortableFile(
      {
        name: "Test Project.frdx",
        mimeType: "application/vnd.forward-draft.project",
        content: "FRDX/1\n{}",
      },
      {
        description: "Forward Draft project",
        accept: { "application/vnd.forward-draft.project": [".frdx"] },
      },
    );

    expect(result).toBe("downloaded");
    expect(click).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
  });
});
