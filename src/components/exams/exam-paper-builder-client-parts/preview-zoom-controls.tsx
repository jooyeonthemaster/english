"use client";

import { GripVertical, Maximize2, Minus, Plus } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
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
}

export function PreviewZoomControls({
  zoom,
  position,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onDragStart,
}: PreviewZoomControlsProps) {
  return (
    <div
      className="no-print pointer-events-auto absolute z-20 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur-sm"
      style={{ top: position.top, right: position.right }}
    >
      <span
        onMouseDown={onDragStart}
        className="inline-flex size-6 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
        title="드래그해서 이동"
        aria-label="컨트롤 이동"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </span>
      <span className="h-4 w-px bg-slate-200" />
      <PreviewZoomButton onClick={onZoomOut} disabled={zoom <= PREVIEW_ZOOM_MIN} label="축소">
        <Minus className="size-3.5" aria-hidden="true" />
      </PreviewZoomButton>
      <button
        type="button"
        onClick={onReset}
        disabled={zoom === 1}
        className="inline-flex h-6 min-w-[42px] cursor-pointer items-center justify-center rounded px-1.5 text-[11px] font-bold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
        title="원래 크기"
      >
        {Math.round(zoom * 100)}%
      </button>
      <PreviewZoomButton onClick={onZoomIn} disabled={zoom >= PREVIEW_ZOOM_MAX} label="확대">
        <Plus className="size-3.5" aria-hidden="true" />
      </PreviewZoomButton>
      <PreviewZoomButton onClick={onFit} label="화면에 맞추기">
        <Maximize2 className="size-3.5" aria-hidden="true" />
      </PreviewZoomButton>
    </div>
  );
}
