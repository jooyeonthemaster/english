"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { diffWords } from "diff";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import {
  mapChangesToOffsets,
  segmentText,
  type InlineRestorationChange,
} from "../utils/restoration-changes";

type ViewMode = "text" | "image";

interface PageImage {
  pageIndex: number;
  signedUrl: string | null;
  sourceFileName: string | null;
}

interface OriginalProblemBoxProps {
  draft: M1PassageDraftWithJob;
  changes: InlineRestorationChange[];
  hoveredChangeId: string | null;
  activeChangeId: string | null;
  onHoverChange: (id: string | null) => void;
  onSelectChange: (id: string | null) => void;
}

export function OriginalProblemBox({
  draft,
  changes,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: OriginalProblemBoxProps) {
  const [mode, setMode] = useState<ViewMode>("text");
  const [pages, setPages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Ref-as-state so children can portal their floating controls into a
  // layer that lives OUTSIDE the scroll container — guarantees the
  // controls don't move when the image is scrolled.
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);

  // The draft carries `sourcePageIndex: number[]` — one or more page indices
  // that this passage was extracted from. When the teacher toggles into
  // image mode, we lazily fetch the signed URLs for exactly those pages.
  const indicesKey = useMemo(
    () => [...draft.sourcePageIndex].sort((a, b) => a - b).join(","),
    [draft.sourcePageIndex],
  );

  // Fetch image URLs only when the teacher actually switches to image mode.
  // Keeping this lazy lets the detail modal open immediately on text mode;
  // signed URL generation and image preloading otherwise compete with the
  // first paint of the popup.
  useEffect(() => {
    if (mode !== "image") return;
    if (!draft.jobId) return;
    if (!indicesKey) return;
    if (pages.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/extraction/jobs/${draft.jobId}/pages?indices=${indicesKey}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) throw new Error("페이지 이미지를 불러오지 못했습니다.");
        const data = (await res.json()) as { pages?: PageImage[] };
        if (cancelled) return;
        const fetched = data.pages ?? [];
        setPages(fetched);
        // Warm browser cache for the visible images.
        if (typeof window !== "undefined") {
          for (const p of fetched) {
            if (!p.signedUrl) continue;
            const img = new window.Image();
            img.src = p.signedUrl;
          }
        }
      } catch (err) {
        if (cancelled) return;
        setFetchError(
          err instanceof Error
            ? err.message
            : "페이지 이미지를 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.jobId, indicesKey, mode, pages.length]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-900">
            문제 원문
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
            RAW
          </span>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
          <ViewModeButton
            active={mode === "text"}
            onClick={() => setMode("text")}
            icon={<FileText className="size-3.5" aria-hidden="true" />}
            label="텍스트"
          />
          <ViewModeButton
            active={mode === "image"}
            onClick={() => setMode("image")}
            icon={<ImageIcon className="size-3.5" aria-hidden="true" />}
            label="이미지"
          />
        </div>
      </div>
      {/* Body wrapper — relative parent for both the scroll container and
          the floating-controls overlay. Constraining the overlay to this
          wrapper (instead of the entire box) keeps the default controls
          position over the image area, not on top of the header toggle. */}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div
          data-pannable-scroll
          className="absolute inset-0 overflow-auto px-4 py-3"
        >
          {mode === "text" ? (
            <div className="whitespace-pre-wrap text-[14px] leading-7 text-slate-800">
              <HighlightedRawText
                rawText={draft.rawText}
                teacherText={draft.teacherText}
                changes={changes}
                hoveredChangeId={hoveredChangeId}
                activeChangeId={activeChangeId}
                onHoverChange={onHoverChange}
                onSelectChange={onSelectChange}
              />
            </div>
          ) : (
            <ImagePages
              pages={pages}
              loading={loading}
              error={fetchError}
              expectedCount={draft.sourcePageIndex.length}
              overlayEl={overlayEl}
            />
          )}
        </div>
        {/* Overlay layer for floating controls — sits OUTSIDE the scroll
            container as a sibling, so children that portal here are not
            scrolled with the image. `pointer-events-none` lets clicks pass
            through except where the controls themselves opt back in. */}
        <div
          ref={setOverlayEl}
          className="pointer-events-none absolute inset-0 z-10"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function ViewModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "bg-white text-blue-700 shadow-sm"
          : "text-slate-500 hover:text-slate-800")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function ImagePages({
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

/** Min/max zoom factors. 100% = fit-to-width baseline. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

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

function HighlightedRawText({
  rawText,
  teacherText,
  changes,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: {
  rawText: string;
  teacherText: string;
  changes: InlineRestorationChange[];
  hoveredChangeId: string | null;
  activeChangeId: string | null;
  onHoverChange: (id: string | null) => void;
  onSelectChange: (id: string | null) => void;
}) {
  const segments = useMemo(() => {
    if (!rawText) return [];
    if (changes.length === 0) {
      // Legacy fallback for drafts without inline-evidence changes —
      // word-diff against the teacher text. Marks here are non-interactive.
      if (!teacherText) return [{ text: rawText, changeId: null as string | null }];
      const diff = diffWords(rawText, teacherText);
      return diff
        .filter((part) => !part.added)
        .map((part) => ({
          text: part.value,
          changeId:
            part.removed && part.value.trim().length > 0 ? "__diff__" : null,
        }));
    }
    const spans = mapChangesToOffsets(
      rawText,
      changes.map((c) => ({ id: c.id, text: c.before })),
    );
    return segmentText(rawText, spans);
  }, [rawText, teacherText, changes]);

  const containerRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!activeChangeId) return;
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-change-id="${cssEscape(activeChangeId)}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeChangeId]);

  return (
    <span ref={containerRef}>
      {segments.map((segment, index) => {
        if (!segment.changeId) {
          return <span key={index}>{segment.text}</span>;
        }
        if (segment.changeId === "__diff__") {
          return (
            <mark key={index} className="rounded bg-rose-100 text-rose-900">
              {segment.text}
            </mark>
          );
        }
        const isActive = activeChangeId === segment.changeId;
        const isHovered = hoveredChangeId === segment.changeId;
        return (
          <mark
            key={index}
            data-change-id={segment.changeId}
            onMouseEnter={() => onHoverChange(segment.changeId)}
            onMouseLeave={() => onHoverChange(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectChange(isActive ? null : segment.changeId);
            }}
            className={
              "cursor-pointer rounded px-0.5 transition-colors " +
              (isActive
                ? "bg-violet-200 text-violet-950 ring-1 ring-violet-400"
                : isHovered
                  ? "bg-rose-200 text-rose-950 ring-1 ring-rose-300"
                  : "bg-rose-100 text-rose-900")
            }
          >
            {segment.text}
          </mark>
        );
      })}
    </span>
  );
}

function cssEscape(value: string): string {
  if (typeof window !== "undefined" && typeof window.CSS?.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
