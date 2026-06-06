"use client";

import { GripVertical, Maximize2, Minus, Plus } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { PreviewZoomButton } from "./preview-zoom-button";

// ---------------------------------------------------------------------------
// 미리보기 영역의 우측 상단 줌 컨트롤 (드래그 가능)
// ---------------------------------------------------------------------------

export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 2.5;
export const PREVIEW_ZOOM_STEP = 0.25;

interface PreviewZoomControlsProps {
  zoom: number;
  position: { top: number; right: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  onDragStart: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  /** 컨트롤 배치 방향. 기본 가로. "vertical"이면 세로로 쌓는다(기능 동일). */
  orientation?: "horizontal" | "vertical";
  /** 컨트롤 끝에 구분선과 함께 덧붙일 추가 요소(예: 비우기 버튼). */
  extra?: ReactNode;
}

export function PreviewZoomControls({
  zoom,
  position,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onDragStart,
  orientation = "horizontal",
  extra,
}: PreviewZoomControlsProps) {
  const vertical = orientation === "vertical";
  // 세로 모드는 폭을 절반 수준으로 — 버튼·퍼센트 폰트를 컴팩트하게.
  const btnSize = vertical ? "size-5" : "size-6";
  const iconSize = vertical ? "size-3" : "size-3.5";
  return (
    <div
      className={
        "no-print pointer-events-auto absolute z-20 inline-flex items-center rounded-md border border-slate-200 bg-white/95 shadow-md backdrop-blur-sm " +
        (vertical ? "flex-col gap-0.5 p-0.5" : "gap-1 p-1")
      }
      style={{ top: position.top, right: position.right }}
    >
      <span
        onMouseDown={onDragStart}
        className={
          "inline-flex cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing " +
          btnSize
        }
        title="드래그해서 이동"
        aria-label="컨트롤 이동"
      >
        <GripVertical className={vertical ? "size-3.5" : "size-4"} aria-hidden="true" />
      </span>
      <span className={vertical ? "h-px w-4 bg-slate-200" : "h-4 w-px bg-slate-200"} />
      <PreviewZoomButton
        onClick={onZoomOut}
        disabled={zoom <= PREVIEW_ZOOM_MIN}
        label="축소"
        sizeClassName={btnSize}
      >
        <Minus className={iconSize} aria-hidden="true" />
      </PreviewZoomButton>
      <button
        type="button"
        onClick={onReset}
        disabled={zoom === 1}
        className={
          "inline-flex cursor-pointer items-center justify-center rounded font-bold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent " +
          (vertical
            ? "h-5 min-w-[30px] px-0.5 text-[8.5px]"
            : "h-6 min-w-[42px] px-1.5 text-[11px]")
        }
        title="원래 크기"
      >
        {Math.round(zoom * 100)}%
      </button>
      <PreviewZoomButton
        onClick={onZoomIn}
        disabled={zoom >= PREVIEW_ZOOM_MAX}
        label="확대"
        sizeClassName={btnSize}
      >
        <Plus className={iconSize} aria-hidden="true" />
      </PreviewZoomButton>
      <PreviewZoomButton onClick={onFit} label="화면에 맞추기" sizeClassName={btnSize}>
        <Maximize2 className={iconSize} aria-hidden="true" />
      </PreviewZoomButton>
      {extra ? (
        <>
          <span
            className={vertical ? "h-px w-4 bg-slate-200" : "h-4 w-px bg-slate-200"}
          />
          {extra}
        </>
      ) : null}
    </div>
  );
}
