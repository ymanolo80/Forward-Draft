import { describe, expect, it } from "vitest";
import { draftScenesInWritingOrder, mergeDraftSceneOrder } from "../../src/lib/draftSceneOrder";
import type { Scene } from "../../src/types";

function scene(sceneId: string, order: number, source?: "draft", createdAt = "2026-06-04T00:00:00.000Z"): Scene {
  return {
    sceneId,
    projectId: "project",
    heading: sceneId.toUpperCase(),
    order,
    currentVersionId: `${sceneId}-version`,
    status: "For Review",
    createdAt,
    updatedAt: "2026-06-04T00:00:00.000Z",
    source,
  };
}

describe("draft scene insertion", () => {
  it("inserts a new draft scene before any existing scene", () => {
    const current = [scene("one", 1), scene("two", 2), scene("three", 3)];
    const merged = mergeDraftSceneOrder(current, [scene("draft", 1, "draft")], "before", "two");

    expect(merged.map((item) => item.sceneId)).toEqual(["one", "draft", "two", "three"]);
    expect(merged.map((item) => item.order)).toEqual([1, 2, 3, 4]);
  });

  it("inserts a new draft scene after an existing draft scene without moving that scene", () => {
    const current = [scene("one", 1), scene("existing-draft", 2, "draft"), scene("two", 3)];
    const updatedDrafts = [scene("existing-draft", 2, "draft"), scene("new-draft", 3, "draft")];
    const merged = mergeDraftSceneOrder(current, updatedDrafts, "after", "existing-draft");

    expect(merged.map((item) => item.sceneId)).toEqual(["one", "existing-draft", "new-draft", "two"]);
  });

  it("keeps draft content association in writing order after scenes are visually reordered", () => {
    const olderDraft = scene("older-draft", 3, "draft", "2026-06-04T10:00:00.000Z");
    const newerDraft = scene("newer-draft", 1, "draft", "2026-06-04T11:00:00.000Z");

    expect(draftScenesInWritingOrder([newerDraft, olderDraft]).map((item) => item.sceneId)).toEqual([
      "older-draft",
      "newer-draft",
    ]);
  });

  it("uses the same insertion ordering for freewriting chapters", () => {
    const chapters = [scene("chapter-one", 1), scene("chapter-two", 2), scene("chapter-three", 3)];
    const inserted = mergeDraftSceneOrder(chapters, [scene("new-chapter", 1, "draft")], "after", "chapter-two");

    expect(inserted.map((item) => item.sceneId)).toEqual(["chapter-one", "chapter-two", "new-chapter", "chapter-three"]);
  });

  it("keeps consecutively written scenes after a target in writing order", () => {
    const current = [scene("one", 1), scene("first-new", 2, "draft"), scene("two", 3)];
    const updatedDrafts = [scene("first-new", 2, "draft"), scene("second-new", 3, "draft")];
    const merged = mergeDraftSceneOrder(current, updatedDrafts, "after", "one");

    expect(merged.map((item) => item.sceneId)).toEqual(["one", "first-new", "second-new", "two"]);
  });
});
