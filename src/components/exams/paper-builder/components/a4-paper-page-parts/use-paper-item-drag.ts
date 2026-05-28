import type * as React from "react";

import { resolveDropIndicatorPartKey } from "../../drop-indicator-dom";
import type { DropPlacement } from "../../types";

interface UsePaperItemDragParams {
  setActiveItemId: (id: string | null) => void;
  setDraggingItemId: (id: string | null) => void;
  setDragOverItemId: (id: string | null) => void;
  setDragOverPartKey: (key: string | null) => void;
  setDragPlacement: (placement: DropPlacement) => void;
  onMoveItemToDropTarget: (
    sourceLocalId: string,
    targetLocalId: string,
    placement: DropPlacement,
  ) => void;
}

/**
 * Pointer-based drag handlers for paper items. Returns a `startDrag` callback
 * to bind to the grip handle's `onPointerDown`; internally it tracks the
 * pointer until release / cancel, auto-scrolls the preview viewport, and
 * fires `onMoveItemToDropTarget` once a final drop target is resolved.
 */
export function usePaperItemDrag({
  setActiveItemId,
  setDraggingItemId,
  setDragOverItemId,
  setDragOverPartKey,
  setDragPlacement,
  onMoveItemToDropTarget,
}: UsePaperItemDragParams) {
  function updateDragTarget(
    clientX: number,
    clientY: number,
    sourceLocalId: string,
  ) {
    const targetElement = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-paper-item-id]");
    const targetLocalId = targetElement?.dataset.paperItemId || null;

    if (!targetElement || !targetLocalId || targetLocalId === sourceLocalId) {
      setDragOverItemId(null);
      setDragOverPartKey(null);
      return null;
    }

    const rect = targetElement.getBoundingClientRect();
    const placement: DropPlacement =
      clientY > rect.top + rect.height / 2 ? "after" : "before";
    const scroller = document.getElementById("exam-paper-print-root") || document;
    const targetPartKey = resolveDropIndicatorPartKey(
      scroller,
      targetLocalId,
      placement,
    );
    setDragOverItemId(targetLocalId);
    setDragOverPartKey(targetPartKey);
    setDragPlacement(placement);
    return { targetLocalId, placement };
  }

  function autoScrollPaperPreview(clientY: number) {
    const scroller = document.getElementById("exam-paper-print-root");
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    const edgeSize = 72;
    const scrollStep = 18;

    if (clientY < rect.top + edgeSize) {
      scroller.scrollTop -= scrollStep;
    } else if (clientY > rect.bottom - edgeSize) {
      scroller.scrollTop += scrollStep;
    }
  }

  function startDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    sourceLocalId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();

    setActiveItemId(sourceLocalId);
    setDraggingItemId(sourceLocalId);
    setDragOverItemId(null);
    setDragOverPartKey(null);

    let latestDropTarget: {
      targetLocalId: string;
      placement: DropPlacement;
    } | null = null;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      autoScrollPaperPreview(moveEvent.clientY);
      latestDropTarget =
        updateDragTarget(
          moveEvent.clientX,
          moveEvent.clientY,
          sourceLocalId,
        ) || latestDropTarget;
    };

    const finishDrag = (upEvent?: PointerEvent) => {
      if (upEvent) {
        latestDropTarget =
          updateDragTarget(
            upEvent.clientX,
            upEvent.clientY,
            sourceLocalId,
          ) || latestDropTarget;
      }
      if (latestDropTarget) {
        onMoveItemToDropTarget(
          sourceLocalId,
          latestDropTarget.targetLocalId,
          latestDropTarget.placement,
        );
      }

      setDraggingItemId(null);
      setDragOverItemId(null);
      setDragOverPartKey(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };

    const handlePointerUp = (upEvent: PointerEvent) => finishDrag(upEvent);
    const handlePointerCancel = () => finishDrag();

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerCancel, {
      once: true,
    });
  }

  return { startDrag };
}
