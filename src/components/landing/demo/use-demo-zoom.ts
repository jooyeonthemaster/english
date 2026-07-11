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
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { useDemoSheet } from "./demo-sheet-context";

// ---------------------------------------------------------------------------
// 랜딩 데모 공용 줌 훅 — 워크벤치 미리보기 줌(usePreviewZoom 계열)과 같은 UX를
// 데모 아일랜드에 입힌다. 컨트롤 UI는 공유 PreviewZoomControls 를 그대로 쓴다.
//
// 기본값(manualZoom=null)은 자동 맞춤:
//  - baseHeight 를 주면 A4 한 장이 통째로 들어가는 contain 배율(폭·높이 중 작은 쪽)
//  - baseHeight 가 없으면 폭 맞춤(문서형/텍스트형 데모)
// 사용자가 +/− 를 누르면 수동 배율로 전환되고, % 버튼(원래 크기)이 자동 맞춤으로
// 되돌린다. '화면에 맞추기'는 현재 뷰포트 기준 contain 배율을 수동값으로 고정한다.
// ---------------------------------------------------------------------------

// 데모는 contain 맞춤이 0.5 아래로 내려갈 수 있어 앱 최소치(0.5)보다 낮게 둔다.
const DEMO_ZOOM_MIN = 0.3;
// 기본 노출 배율 — 모든 데모는 50%로 시작한다. 뷰포트가 그보다 좁으면
// 한 장 전체가 보이는 배율(contain/폭 맞춤)로 더 줄인다.
const DEMO_DEFAULT_ZOOM = 0.5;

// baseWidth 를 생략하면 자동 맞춤 없이 항상 기본 배율(텍스트형 데모).
export function useDemoZoom(baseWidth?: number, baseHeight?: number) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // 모바일 시트 안에서는 50% 캡을 풀고 폭 맞춤(최대 100%) — 좁은 화면이라
  // 문서가 가로로 꽉 차게 보이는 게 자연스럽다. PC(시트 밖)는 기존 50% 기본.
  const inSheet = useDemoSheet() !== null;
  const defaultCap = inSheet ? 1 : DEMO_DEFAULT_ZOOM;
  const [fitZoom, setFitZoom] = useState(defaultCap);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [controlsPos, setControlsPos] = useState({ top: 12, right: 12 });
  const zoom = useMemo(() => manualZoom ?? fitZoom, [fitZoom, manualZoom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!baseWidth || !el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const styles = window.getComputedStyle(el);
      const paddingX =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const paddingY =
        parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const w = el.clientWidth - paddingX;
      const h = el.clientHeight - paddingY;
      if (w <= 0) return;
      // 시트: 폭 맞춤만(높이 캡 없음 — 세로 스크롤). PC: contain(폭·높이·50%캡).
      const next =
        baseHeight && !inSheet
          ? Math.min(defaultCap, w / baseWidth, Math.max(1, h) / baseHeight)
          : Math.min(defaultCap, w / baseWidth);
      setFitZoom(Math.round(Math.max(DEMO_ZOOM_MIN, next) * 100) / 100);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth, baseHeight, inSheet, defaultCap]);

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
        DEMO_ZOOM_MIN,
        Math.round(((current ?? zoom) - PREVIEW_ZOOM_STEP) * 100) / 100,
      ),
    );
  }

  /** 자동 맞춤(기본값)으로 복귀 — 컨트롤의 % 버튼. */
  function reset() {
    setManualZoom(null);
  }

  /** 지금 뷰포트에 한 장 전체가 들어가는 배율을 수동값으로 고정. */
  function fitToScreen() {
    const el = scrollerRef.current;
    if (!baseWidth || !el) {
      setManualZoom(null);
      return;
    }
    const styles = window.getComputedStyle(el);
    const paddingX =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const w = Math.max(1, el.clientWidth - paddingX);
    const h = Math.max(1, el.clientHeight - paddingY);
    const next = baseHeight
      ? Math.min(w / baseWidth, h / baseHeight)
      : w / baseWidth;
    setManualZoom(
      Math.round(
        Math.min(PREVIEW_ZOOM_MAX, Math.max(DEMO_ZOOM_MIN, next)) * 100,
      ) / 100,
    );
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
