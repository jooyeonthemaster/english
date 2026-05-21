"use client";

import type * as React from "react";
import { useCallback, useState } from "react";

export type DropPlacement = "before" | "after";

interface DragState {
  draggingId: string | null;
  dragOverId: string | null;
  placement: DropPlacement;
}

interface UseBlockDragParams {
  onMove: (sourceId: string, targetId: string, placement: DropPlacement) => void;
}

/**
 * Pointer-based DnD for editing-panel block rows. Mirrors the pattern used
 * by the exam paper-builder: bind to the grip handle's `onPointerDown`,
 * track until release, resolve drop target via `elementFromPoint` +
 * `[data-editing-block-id]` lookup, and fire `onMove` once.
 */
export function useBlockDrag({ onMove }: UseBlockDragParams) {
  const [dragState, setDragState] = useState<DragState>({
    draggingId: null,
    dragOverId: null,
    placement: "before",
  });

  const startDrag = useCallback(
    (sourceId: string) => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setDragState({ draggingId: sourceId, dragOverId: null, placement: "before" });
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      let resolved: { id: string; placement: DropPlacement } | null = null;

      const updateTarget = (clientX: number, clientY: number) => {
        const el = document
          .elementFromPoint(clientX, clientY)
          ?.closest<HTMLElement>("[data-editing-block-id]");
        const targetId = el?.dataset.editingBlockId || null;
        if (!el || !targetId || targetId === sourceId) {
          resolved = null;
          setDragState((prev) => ({ ...prev, dragOverId: null }));
          return;
        }
        const rect = el.getBoundingClientRect();
        const placement: DropPlacement =
          clientY > rect.top + rect.height / 2 ? "after" : "before";
        resolved = { id: targetId, placement };
        setDragState((prev) => ({ ...prev, dragOverId: targetId, placement }));
      };

      const onPointerMove = (ev: PointerEvent) =>
        updateTarget(ev.clientX, ev.clientY);
      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (resolved && resolved.id !== sourceId) {
          onMove(sourceId, resolved.id, resolved.placement);
        }
        setDragState({ draggingId: null, dragOverId: null, placement: "before" });
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    },
    [onMove],
  );

  return { dragState, startDrag };
}
