import * as React from "react";
import { useRef, useState } from "react";
import { clampNumber } from "../paper-item-utils";

export type TemplateFloatingOffset = { x: number; y: number };

/**
 * Manages drag state for the floating template-settings button. The button
 * can be dragged anywhere within the viewport; a plain click (no drag) toggles
 * the panel via `handleClick`.
 */
export function useTemplateFloatingDrag() {
  const [offset, setOffset] = useState<TemplateFloatingOffset>({ x: 0, y: 0 });
  const [panelOpen, setPanelOpen] = useState(false);

  const offsetRef = useRef(offset);
  const frameRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-template-floating-drag-ignore='true']")) return;

    event.stopPropagation();

    const host = hostRef.current;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = offsetRef.current;
    const margin = 8;
    const minDeltaX = margin - rect.left;
    const maxDeltaX = window.innerWidth - margin - rect.right;
    const minDeltaY = margin - rect.top;
    const maxDeltaY = window.innerHeight - margin - rect.bottom;
    const pointerId = event.pointerId;
    let didMove = false;
    let latestOffset = startOffset;
    const previousBodyCursor = document.body.style.cursor;
    const previousBodyUserSelect = document.body.style.userSelect;

    movedRef.current = false;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    host.style.transition = "none";
    host.style.willChange = "transform";

    try {
      event.currentTarget.setPointerCapture(pointerId);
    } catch {
      // Some elements may not keep capture after DOM updates; window listeners still finish the drag.
    }

    const applyFloatingTransform = () => {
      frameRef.current = null;
      host.style.transform = `translate3d(${latestOffset.x}px, ${latestOffset.y}px, 0)`;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rawDeltaX = moveEvent.clientX - startX;
      const rawDeltaY = moveEvent.clientY - startY;
      if (!didMove && Math.hypot(rawDeltaX, rawDeltaY) >= 2) {
        didMove = true;
        movedRef.current = true;
      }
      moveEvent.preventDefault();
      const deltaX = clampNumber(rawDeltaX, minDeltaX, maxDeltaX);
      const deltaY = clampNumber(rawDeltaY, minDeltaY, maxDeltaY);
      latestOffset = {
        x: startOffset.x + deltaX,
        y: startOffset.y + deltaY,
      };
      offsetRef.current = latestOffset;

      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(applyFloatingTransform);
      }
    };

    const finishDrag = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      applyFloatingTransform();
      setOffset(latestOffset);
      document.body.style.cursor = previousBodyCursor;
      document.body.style.userSelect = previousBodyUserSelect;
      host.style.transition = "";
      host.style.willChange = "transform";
      try {
        event.currentTarget.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture is best-effort here.
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag, { once: true });
    window.addEventListener("pointercancel", finishDrag, { once: true });
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (movedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      movedRef.current = false;
      return;
    }
    setPanelOpen((open) => !open);
  }

  return {
    offset,
    panelOpen,
    setPanelOpen,
    hostRef,
    startDrag,
    handleClick,
  };
}
