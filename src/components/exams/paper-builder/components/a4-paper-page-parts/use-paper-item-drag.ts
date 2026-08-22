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

    // 포인터 캡처 — 커서가 그립을 벗어나도 드래그가 끊기지 않는다.
    // (body pointerEvents:'none' 은 elementFromPoint 히트테스트를 무력화하므로
    //  이 사이트에는 절대 넣지 않는다 — 좌표→드롭 대상 판정이 동작 그 자체.)
    const handleEl = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      handleEl.setPointerCapture(pointerId);
    } catch {
      // 캡처 미지원 브라우저는 window 리스너로 폴백
    }

    let latestDropTarget: {
      targetLocalId: string;
      placement: DropPlacement;
    } | null = null;

    // rAF 코얼레싱 — updateDragTarget 의 elementFromPoint +
    // getBoundingClientRect(강제 레이아웃)와 setState 버스트를 프레임당 1회로
    // 줄인다. 좌표는 최신값만 담아 두고 flush 에서 읽는다. 자동 스크롤은
    // 이동 속도가 move 발생 빈도에 종속이므로 반드시 매 move 유지한다.
    let pendingPoint: { x: number; y: number } | null = null;
    let rafId: number | null = null;
    const flush = () => {
      rafId = null;
      const point = pendingPoint;
      if (!point) return;
      pendingPoint = null;
      latestDropTarget =
        updateDragTarget(point.x, point.y, sourceLocalId) || latestDropTarget;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      autoScrollPaperPreview(moveEvent.clientY);
      pendingPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (rafId === null) rafId = requestAnimationFrame(flush);
    };

    const finishDrag = (upEvent?: PointerEvent) => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (upEvent) {
        latestDropTarget =
          updateDragTarget(
            upEvent.clientX,
            upEvent.clientY,
            sourceLocalId,
          ) || latestDropTarget;
      } else if (pendingPoint) {
        // pointercancel — 미처 flush 못 한 마지막 좌표로 종전과 동일하게 판정.
        const point = pendingPoint;
        pendingPoint = null;
        latestDropTarget =
          updateDragTarget(point.x, point.y, sourceLocalId) || latestDropTarget;
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
      try {
        handleEl.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
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
