import type { Scene } from "../types";

export type DraftInsertPlacement = "append" | "before" | "after";

export function draftScenesInWritingOrder(scenes: Scene[]) {
  return scenes
    .filter((scene) => scene.source === "draft")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.order - b.order);
}

export function mergeDraftSceneOrder(
  currentScenes: Scene[],
  updatedDraftScenes: Scene[],
  placement: DraftInsertPlacement,
  targetSceneId: string,
) {
  const orderedCurrent = [...currentScenes].sort((a, b) => a.order - b.order);
  const existingDraftIds = new Set(orderedCurrent.filter((scene) => scene.source === "draft").map((scene) => scene.sceneId));
  const updatedById = new Map(
    updatedDraftScenes
      .filter((scene) => existingDraftIds.has(scene.sceneId))
      .map((scene) => [scene.sceneId, scene]),
  );
  const newDraftScenes = updatedDraftScenes.filter((scene) => !existingDraftIds.has(scene.sceneId));
  const merged = orderedCurrent
    .filter((scene) => scene.source !== "draft" || updatedById.has(scene.sceneId))
    .map((scene) => updatedById.get(scene.sceneId) ?? scene);

  let insertIndex = merged.length;
  if (placement !== "append" && targetSceneId) {
    const targetIndex = merged.findIndex((scene) => scene.sceneId === targetSceneId);
    if (targetIndex >= 0) insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
    if (placement === "after") {
      while (insertIndex < merged.length && merged[insertIndex]?.source === "draft") insertIndex += 1;
    }
  }
  merged.splice(insertIndex, 0, ...newDraftScenes);
  return merged.map((scene, index) => ({ ...scene, order: index + 1 }));
}
