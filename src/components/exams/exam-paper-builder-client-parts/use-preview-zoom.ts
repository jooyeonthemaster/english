"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { PAPER_SIZE_SPECS, PREVIEW_PAGE_WIDTH } from "../paper-builder/constants";
import type { PaperSize } from "../paper-builder/types";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "./preview-zoom-controls";

// ---------------------------------------------------------------------------
// 미리보기 영역의 zoom/base-width 상태와 zoom 컨트롤 드래그 동작을
// 한 번에 묶어두는 훅.
// ---------------------------------------------------------------------------

export function usePreviewZoom(paperSize: PaperSize = "A4") {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [controlsPos, setControlsPos] = useState({ top: 12, right: 12 });
  const baseWidth = Math.round(PREVIEW_PAGE_WIDTH * PAPER_SIZE_SPECS[paperSize].widthRatio);
  const zoom = useMemo(() => manualZoom ?? fitZoom, [fitZoom, manualZoom]);
  const lastFitWidthRef = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // baseWidth changed (e.g. paper size) → force the next measurement to apply.
    lastFitWidthRef.current = 0;

    // Width wobbles smaller than a scrollbar are ignored. When the page count
    // changes (e.g. pressing undo repeatedly) the vertical scrollbar can appear
    // or disappear, nudging clientWidth by ~17px. Reacting to that would change
    // the zoom → change the content height → toggle the scrollbar again — a
    // measure→zoom→resize feedback loop that makes the paper flicker bigger and
    // smaller. The deadband keeps the fit zoom stable through those wobbles
    // while still responding to real container resizes.
    const SCROLLBAR_DEADBAND = 24;

    const updateFitZoom = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(320, scroller.clientWidth - paddingX);
      if (
        lastFitWidthRef.current > 0 &&
        Math.abs(availableWidth - lastFitWidthRef.current) < SCROLLBAR_DEADBAND
      ) {
        return;
      }
      lastFitWidthRef.current = availableWidth;
      const nextFit = Math.min(1, Math.max(PREVIEW_ZOOM_MIN, availableWidth / baseWidth));
      setFitZoom(Math.round(nextFit * 100) / 100);
    };

    updateFitZoom();
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [baseWidth]);

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
    baseWidth,
    controlsPos,
    zoomIn,
    zoomOut,
    reset,
    handleControlsDragStart,
  };
}
