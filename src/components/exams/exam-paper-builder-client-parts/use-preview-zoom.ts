"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { PREVIEW_PAGE_WIDTH } from "../paper-builder/constants";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "./preview-zoom-controls";

// ---------------------------------------------------------------------------
// 미리보기 영역의 zoom/base-width 상태와 zoom 컨트롤 드래그 동작을
// 한 번에 묶어두는 훅.
// ---------------------------------------------------------------------------

export function usePreviewZoom() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [controlsPos, setControlsPos] = useState({ top: 12, right: 12 });
  const zoom = useMemo(() => manualZoom ?? fitZoom, [fitZoom, manualZoom]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateFitZoom = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(320, scroller.clientWidth - paddingX);
      const nextFit = Math.min(1, Math.max(PREVIEW_ZOOM_MIN, availableWidth / PREVIEW_PAGE_WIDTH));
      setFitZoom(Math.round(nextFit * 100) / 100);
    };

    updateFitZoom();
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  function zoomIn() {
    setManualZoom((current) =>
      Math.min(PREVIEW_ZOOM_MAX, Math.round(((current ?? zoom) + PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }

  function zoomOut() {
    setManualZoom((current) =>
      Math.max(PREVIEW_ZOOM_MIN, Math.round(((current ?? zoom) - PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }

  function reset() {
    setManualZoom(null);
  }

  function handleControlsDragStart(event: ReactMouseEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startMouseX = event.clientX;
    const startMouseY = event.clientY;
    const startTop = controlsPos.top;
    const startRight = controlsPos.right;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: MouseEvent) => {
      setControlsPos({
        top: Math.max(0, startTop + (moveEvent.clientY - startMouseY)),
        right: Math.max(0, startRight - (moveEvent.clientX - startMouseX)),
      });
    };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }

  return {
    scrollerRef,
    zoom,
    baseWidth: PREVIEW_PAGE_WIDTH,
    controlsPos,
    zoomIn,
    zoomOut,
    reset,
    handleControlsDragStart,
  };
}
