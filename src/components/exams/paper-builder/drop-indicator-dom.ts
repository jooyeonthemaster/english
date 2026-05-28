import type { DropPlacement } from "./types";

export function resolveDropIndicatorPartKey(
  root: ParentNode,
  targetLocalId: string | null,
  placement: DropPlacement,
) {
  if (!targetLocalId) return null;

  const parts = Array.from(
    root.querySelectorAll<HTMLElement>("[data-paper-item-id]"),
  ).filter((element) => {
    if (element.dataset.paperItemId !== targetLocalId) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  const anchor = placement === "after" ? parts[parts.length - 1] : parts[0];
  return anchor?.dataset.paperPartKey || null;
}
