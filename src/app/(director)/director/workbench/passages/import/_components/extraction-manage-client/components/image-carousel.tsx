"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";

export interface PageImage {
  pageIndex: number;
  signedUrl: string | null;
  sourceFileName: string | null;
}

/** Min/max zoom factors. 100% = fit-to-width baseline. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

export function ImagePages({
  pages,
  loading,
  error,
  expectedCount,
  overlayEl,
}: {
  pages: PageImage[];
  loading: boolean;
  error: string | null;
  expectedCount: number;
  overlayEl: HTMLDivElement | null;
}) {
  if (loading && pages.length === 0) {
    // Reserve one placeholder per expected source page so the layout
    // doesn't jump when the real images arrive.
    return (
      <div className="space-y-3">
        {Array.from({ length: Math.max(1, expectedCount) }, (_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
          >
            <div className="aspect-[3/4] w-full animate-pulse bg-slate-200/70" />
            <div className="flex items-center justify-between border-t border-slate-100 bg-white px-3 py-1.5">
              <span className="block h-3 w-20 animate-pulse rounded bg-slate-200" />
              <span className="block h-3 w-28 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">
        표시할 페이지 이미지가 없습니다.
      </div>
    );
  }

  return <ImageCarousel pages={pages} overlayEl={overlayEl} />;
}

function ImageCarousel({
  pages,
  overlayEl,
}: {
  pages: PageImage[];
  overlayEl: HTMLDivElement | null;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Controls panel position — measured from the overlay layer (which sits
  // outside the scroll container), so the controls stay fixed in place no
  // matter how far the image is scrolled. Drag the grip handle to move.
  const [controlsPos, setControlsPos] = useState<{
    top: number;
    right: number;
  }>({ top: 8, right: 8 });

  // Clamp when the underlying page array shrinks (e.g. on draft switch).
  const safeIndex = Math.min(activeIndex, pages.length - 1);
  const active = pages[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < pages.length - 1;

  const goPrev = () => {
    if (!hasPrev) return;
    setActiveIndex(safeIndex - 1);
    setZoom(1);
  };
  const goNext = () => {
    if (!hasNext) return;
    setActiveIndex(safeIndex + 1);
    setZoom(1);
  };

  const zoomIn = () =>
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () =>
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const reset = () => setZoom(1);

  // Mouse-drag panning on the image. Reaches up the DOM to the panel's
  // scroll container (marked `data-pannable-scroll`) and translates the
  // cursor delta into scroll offsets while the button is held down.
  const handlePanStart = (e: React.MouseEvent<HTMLImageElement>) => {
    if (e.button !== 0) return;
    const scroller = (e.currentTarget as HTMLElement).closest<HTMLElement>(
      "[data-pannable-scroll]",
    );
    if (!scroller) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startScrollLeft = scroller.scrollLeft;
    const startScrollTop = scroller.scrollTop;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      scroller.scrollLeft = startScrollLeft - (ev.clientX - startX);
      scroller.scrollTop = startScrollTop - (ev.clientY - startY);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Drag the floating controls panel itself. We track right/top (relative
  // to the scroll container) so the panel stays visually anchored even as
  // the user resizes the modal.
  const handleControlsDragStart = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startTop = controlsPos.top;
    const startRight = controlsPos.right;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      setControlsPos({
        top: Math.max(0, startTop + (ev.clientY - startMouseY)),
        right: Math.max(0, startRight - (ev.clientX - startMouseX)),
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const controlsNode = (
    <div
      className="pointer-events-auto absolute inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur-sm"
      style={{ top: controlsPos.top, right: controlsPos.right }}
    >
      <span
        onMouseDown={handleControlsDragStart}
        className="inline-flex size-6 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
        title="드래그해서 이동"
        aria-label="컨트롤 이동"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </span>
      <span className="h-4 w-px bg-slate-200" />
      {pages.length > 1 ? (
        <>
          <ZoomButton onClick={goPrev} disabled={!hasPrev} label="이전 페이지">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </ZoomButton>
          <span className="min-w-[40px] text-center text-[11px] font-bold tabular-nums text-slate-700">
            {safeIndex + 1} / {pages.length}
          </span>
          <ZoomButton onClick={goNext} disabled={!hasNext} label="다음 페이지">
            <ChevronRight className="size-4" aria-hidden="true" />
          </ZoomButton>
          <span className="h-4 w-px bg-slate-200" />
        </>
      ) : null}
      <ZoomButton onClick={zoomOut} disabled={zoom <= ZOOM_MIN} label="축소">
        <Minus className="size-3.5" aria-hidden="true" />
      </ZoomButton>
      <button
        type="button"
        onClick={reset}
        disabled={zoom === 1}
        className="inline-flex h-6 min-w-[42px] cursor-pointer items-center justify-center rounded px-1.5 text-[11px] font-bold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
        title="원래 크기"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ZoomButton onClick={zoomIn} disabled={zoom >= ZOOM_MAX} label="확대">
        <Plus className="size-3.5" aria-hidden="true" />
      </ZoomButton>
      <ZoomButton onClick={reset} disabled={zoom === 1} label="화면에 맞추기">
        <Maximize2 className="size-3.5" aria-hidden="true" />
      </ZoomButton>
    </div>
  );

  return (
    <>
      {overlayEl ? createPortal(controlsNode, overlayEl) : null}
      {/* No `overflow-hidden` on the figure — that was clipping the
          zoomed wrapper's horizontal overflow and preventing the scroll
          container above from generating a horizontal scrollbar. */}
      <figure className="rounded-md border border-slate-200 bg-slate-50">
        {active.signedUrl ? (
          // The wrapper — not the <img> — carries the zoom width so the
          // scroll container can detect horizontal overflow and offer a
          // real left/right scroll. An <img> alone overflows `visible`
          // without contributing to the parent's scrollable area, which is
          // why horizontal drag-pan wasn't working previously.
          <div
            className="overflow-hidden rounded-t-[6px] bg-slate-100"
            style={{ width: `${zoom * 100}%` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={active.pageIndex}
              src={active.signedUrl}
              alt={`${active.pageIndex + 1}페이지`}
              loading="lazy"
              onMouseDown={handlePanStart}
              className="block w-full cursor-grab select-none active:cursor-grabbing"
              draggable={false}
            />
          </div>
        ) : (
          <div className="flex min-h-[160px] items-center justify-center text-xs text-slate-400">
            이미지를 불러올 수 없습니다.
          </div>
        )}

        <figcaption className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
          <span>{active.pageIndex + 1}페이지</span>
          {active.sourceFileName ? (
            <span className="truncate" title={active.sourceFileName}>
              {active.sourceFileName}
            </span>
          ) : null}
        </figcaption>
      </figure>
    </>
  );
}

function ZoomButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
