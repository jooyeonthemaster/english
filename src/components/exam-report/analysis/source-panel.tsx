"use client";

// ============================================================================
// 시험지 원본 분할 패널 — Sheet 오버레이 대체(유저 요청: 페이지를 가리지 말고
// 콘텐츠를 왼쪽으로 밀어내 다른 섹션과 나란히 대조).
//
// 폭 조절(드래그 핸들)은 상위(analysis-step)의 useResizablePanels 가 담당하고,
// 이 컴포넌트는 카드 셸 + 줌(시험지 빌더의 PreviewZoomControls 재사용)만 맡는다.
// 줌 1 = 패널 폭 맞춤. 확대 시 가로·세로 스크롤로 초과분을 흡수한다.
// ============================================================================

import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X } from "lucide-react";
import {
  PreviewZoomControls,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import type { ExamSourceFile } from "../ui-contracts";
import { SourceImageViewer } from "../source-image-viewer";

interface SourcePanelProps {
  analysisId: string;
  sourceFiles: ExamSourceFile[];
  onClose: () => void;
}

function roundZoom(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampZoom(value: number): number {
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, value));
}

export function SourcePanel({ analysisId, sourceFiles, onClose }: SourcePanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [controlsPos, setControlsPos] = useState({ top: 12, right: 12 });

  // "화면에 맞추기" — 첫 페이지 전체(가로·세로)가 스크롤러 안에 들어오는 줌.
  // 이미지 비율은 로드 후에만 알 수 있어 클릭 시점에 DOM 에서 직접 읽는다.
  function fitToScreen() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const img = scroller.querySelector("img");
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      setZoom(1);
      return;
    }
    const styles = window.getComputedStyle(scroller);
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availW = Math.max(1, scroller.clientWidth - padX);
    const availH = Math.max(1, scroller.clientHeight - padY);
    const aspect = img.naturalWidth / img.naturalHeight;
    // 줌 1 = 폭 맞춤이므로 높이까지 들어오는 줌은 (availH×비율)/availW.
    setZoom(roundZoom(clampZoom(Math.min(1, (availH * aspect) / availW))));
  }

  // 손바닥 팬 — 이미지를 잡아 끌어 스크롤(확대 상태에서 다른 문항으로 이동).
  // 터치는 네이티브 스크롤이 이미 팬이므로 마우스 포인터만 처리한다.
  function handlePanStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = scroller.scrollLeft;
    const startTop = scroller.scrollTop;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      scroller.scrollLeft = startLeft - (moveEvent.clientX - startX);
      scroller.scrollTop = startTop - (moveEvent.clientY - startY);
    };
    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  // 줌 컨트롤 이동 — 시험지 빌더(use-preview-zoom)와 동일한 드래그 문법.
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

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-bold text-slate-900">시험지 원본</h3>
          <span className="text-xs text-slate-400">
            <span className="font-semibold text-slate-600">{sourceFiles.length}</span>
            페이지
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="시험지 원본 패널 닫기"
          className="inline-flex size-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <PreviewZoomControls
          zoom={zoom}
          position={controlsPos}
          onZoomIn={() => setZoom((z) => roundZoom(clampZoom(z + PREVIEW_ZOOM_STEP)))}
          onZoomOut={() => setZoom((z) => roundZoom(clampZoom(z - PREVIEW_ZOOM_STEP)))}
          onReset={() => setZoom(1)}
          onFit={fitToScreen}
          onDragStart={handleControlsDragStart}
        />
        <div
          ref={scrollerRef}
          onPointerDown={handlePanStart}
          className="h-full cursor-grab touch-auto select-none overflow-auto p-4 active:cursor-grabbing"
        >
          <SourceImageViewer
            analysisId={analysisId}
            sourceFiles={sourceFiles}
            zoom={zoom}
          />
        </div>
      </div>
    </section>
  );
}
