"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";

// ---------------------------------------------------------------------------
// 동형 모의고사 중앙 미리보기 줌 훅.
// 시험지 생성의 usePreviewZoom 과 동작은 같지만, A4 비율 상수에 묶이지 않고
// 업로드한 페이지 이미지의 실제 가로세로비(pageAspectRatio = 높이/너비)로
// "화면에 맞추기"를 계산한다. 컨트롤 UI는 공유 PreviewZoomControls 재사용.
// ---------------------------------------------------------------------------

export function useSimilarPreviewZoom(baseWidth: number, pageAspectRatio: number) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [controlsPos, setControlsPos] = useState({ top: 12, right: 12 });
  const zoom = useMemo(() => manualZoom ?? fitZoom, [fitZoom, manualZoom]);
  const lastFitWidthRef = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // baseWidth 가 바뀌면 다음 측정을 강제 적용.
    lastFitWidthRef.current = 0;

    // 스크롤바 출현으로 ~17px 폭이 흔들릴 때 줌이 출렁이는 피드백 루프를
    // 막는 데드밴드 (시험지 생성과 동일한 처리).
    const SCROLLBAR_DEADBAND = 24;

    const updateFitZoom = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(280, scroller.clientWidth - paddingX);
      if (
        lastFitWidthRef.current > 0 &&
        Math.abs(availableWidth - lastFitWidthRef.current) < SCROLLBAR_DEADBAND
      ) {
        return;
      }
      lastFitWidthRef.current = availableWidth;
      const nextFit = Math.min(
        1,
        Math.max(PREVIEW_ZOOM_MIN, availableWidth / baseWidth),
      );
      setFitZoom(Math.round(nextFit * 100) / 100);
    };

    updateFitZoom();
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [baseWidth]);

  function zoomIn() {
    setManualZoom((current) =>
      Math.min(
        PREVIEW_ZOOM_MAX,
        Math.round(((current ?? zoom) + PREVIEW_ZOOM_STEP) * 100) / 100,
      ),
    );
  }

  function zoomOut() {
    setManualZoom((current) =>
      Math.max(
        PREVIEW_ZOOM_MIN,
        Math.round(((current ?? zoom) - PREVIEW_ZOOM_STEP) * 100) / 100,
      ),
    );
  }

  function reset() {
    setManualZoom(null);
  }

  // 한 페이지 전체(가로·세로)가 뷰포트 안에 들어오도록 맞춘다.
  function fitToScreen() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const styles = window.getComputedStyle(scroller);
    const paddingX =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availableWidth = Math.max(1, scroller.clientWidth - paddingX);
    const availableHeight = Math.max(1, scroller.clientHeight - paddingY);
    const pageHeight = baseWidth * pageAspectRatio;
    const next = Math.min(
      availableWidth / baseWidth,
      availableHeight / pageHeight,
    );
    const clamped = Math.min(
      PREVIEW_ZOOM_MAX,
      Math.max(PREVIEW_ZOOM_MIN, next),
    );
    setManualZoom(Math.round(clamped * 100) / 100);
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
    controlsPos,
    zoomIn,
    zoomOut,
    reset,
    fitToScreen,
    handleControlsDragStart,
  };
}
