"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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
  const [zoom, setZoom] = useState(1);
  const [baseWidth, setBaseWidth] = useState(PREVIEW_PAGE_WIDTH);
  const [controlsPos, setControlsPos] = useState({ top: 12, right: 12 });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateBaseWidth = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(320, scroller.clientWidth - paddingX);
      setBaseWidth(Math.min(PREVIEW_PAGE_WIDTH, availableWidth));
    };

    updateBaseWidth();
    const observer = new ResizeObserver(updateBaseWidth);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  function zoomIn() {
    setZoom((z) => Math.min(PREVIEW_ZOOM_MAX, Math.round((z + PREVIEW_ZOOM_STEP) * 100) / 100));
  }

  function zoomOut() {
    setZoom((z) => Math.max(PREVIEW_ZOOM_MIN, Math.round((z - PREVIEW_ZOOM_STEP) * 100) / 100));
  }

  function reset() {
    setZoom(1);
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
    baseWidth,
    controlsPos,
    zoomIn,
    zoomOut,
    reset,
    handleControlsDragStart,
  };
}
