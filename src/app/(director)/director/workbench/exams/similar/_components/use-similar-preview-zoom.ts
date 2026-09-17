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

  // 드래그 시작 위치는 ref 로 읽는다(시험지 빌더 usePreviewZoom 수술과 동형 —
  // 무회귀 검증된 관용구).
  const controlsPosRef = useRef(controlsPos);
  controlsPosRef.current = controlsPos;

  function handleControlsDragStart(event: ReactMouseEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startMouseX = event.clientX;
    const startMouseY = event.clientY;
    const { top: startTop, right: startRight } = controlsPosRef.current;
    // 드래그 중에는 컨트롤 DOM(그립 span 의 부모 = 위치를 소유한 루트)에 rAF
    // 코얼레싱으로 직접 쓰고, 놓을 때 한 번만 상태로 확정한다. mousemove 마다
    // setState 하면 이 훅을 쓰는 중앙 미리보기 전체(페이지 이미지 목록·썸네일
    // 레일)가 프레임마다 리렌더된다.
    const controlsEl = event.currentTarget.parentElement as HTMLElement | null;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    let next = { top: startTop, right: startRight };
    let rafId: number | null = null;
    const flush = () => {
      rafId = null;
      if (controlsEl) {
        controlsEl.style.top = `${next.top}px`;
        controlsEl.style.right = `${next.right}px`;
      }
    };

    const handleMove = (moveEvent: MouseEvent) => {
      next = {
        top: Math.max(0, startTop + (moveEvent.clientY - startMouseY)),
        right: Math.max(0, startRight - (moveEvent.clientX - startMouseX)),
      };
      if (controlsEl) {
        if (rafId === null) rafId = requestAnimationFrame(flush);
      } else {
        // 컨트롤 DOM 을 못 찾는 경우(구조 변경 등)에는 예전 경로로 안전 복귀.
        setControlsPos(next);
      }
    };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      // 최종 위치를 상태로 확정 — 이후 리렌더가 같은 값을 다시 쓰므로 튐이 없다.
      setControlsPos((prev) =>
        prev.top === next.top && prev.right === next.right ? prev : next,
      );
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
