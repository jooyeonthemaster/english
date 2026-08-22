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
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      // body pointerEvents:'none' 은 elementFromPoint 히트테스트를 무력화하므로
      // 이 사이트에는 넣지 않는다(계약 ④ 의도적 부분 적용).

      // 포인터 캡처 — 커서가 그립을 벗어나도 드래그가 끊기지 않는다.
      const handleEl = e.currentTarget;
      const pointerId = e.pointerId;
      try {
        handleEl.setPointerCapture(pointerId);
      } catch {
        // 캡처 미지원 브라우저는 document 리스너로 폴백
      }

      let resolved: { id: string; placement: DropPlacement } | null = null;

      const updateTarget = (clientX: number, clientY: number) => {
        const el = document
          .elementFromPoint(clientX, clientY)
          ?.closest<HTMLElement>("[data-editing-block-id]");
        const targetId = el?.dataset.editingBlockId || null;
        if (!el || !targetId || targetId === sourceId) {
          resolved = null;
          // 값이 같으면 prev 를 그대로 반환 — React bail-out 으로 무의미
          // 리렌더(편집 패널 블록 행 전량)를 막는다. 동작 동일.
          setDragState((prev) =>
            prev.dragOverId === null ? prev : { ...prev, dragOverId: null },
          );
          return;
        }
        const rect = el.getBoundingClientRect();
        const placement: DropPlacement =
          clientY > rect.top + rect.height / 2 ? "after" : "before";
        resolved = { id: targetId, placement };
        setDragState((prev) =>
          prev.dragOverId === targetId && prev.placement === placement
            ? prev
            : { ...prev, dragOverId: targetId, placement },
        );
      };

      // rAF 코얼레싱 — elementFromPoint + getBoundingClientRect(강제 레이아웃)를
      // 프레임당 1회로 줄인다. 좌표는 최신값만 담아 두고 flush 에서 읽는다.
      let pendingPoint: { x: number; y: number } | null = null;
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        const point = pendingPoint;
        if (!point) return;
        pendingPoint = null;
        updateTarget(point.x, point.y);
      };

      const onPointerMove = (ev: PointerEvent) => {
        pendingPoint = { x: ev.clientX, y: ev.clientY };
        if (rafId === null) rafId = requestAnimationFrame(flush);
      };
      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        // 미처 flush 못 한 마지막 좌표가 있으면 종전과 동일하게 드롭 판정.
        if (pendingPoint) {
          const point = pendingPoint;
          pendingPoint = null;
          updateTarget(point.x, point.y);
        }
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        try {
          handleEl.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
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
