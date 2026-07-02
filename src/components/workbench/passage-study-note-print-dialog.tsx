"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookMarked,
  CheckCircle2,
  GripVertical,
  Maximize2,
  Minus,
  Plus,
  Printer,
  X,
} from "lucide-react";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { buildStudyNoteBlocks } from "./passage-study-note-print-dialog/block-builder";
import { EditingPanel } from "./passage-study-note-print-dialog/editing-panel";
import { useEditingState } from "./passage-study-note-print-dialog/editing-state";
import { safeParseAnalysis } from "./passage-study-note-print-dialog/helpers";
import { paginateStudyBlocks } from "./passage-study-note-print-dialog/pagination";
import {
  StudyNoteMeasurementLayer,
  StudyNotePageFrame,
} from "./passage-study-note-print-dialog/page-frame";
import { STUDY_NOTE_PRINT_STYLES } from "./passage-study-note-print-dialog/styles";
import type {
  PaginatedStudyPage,
  StudyNotePassage,
} from "./passage-study-note-print-dialog/types";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

interface PassageStudyNotePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passages: StudyNotePassage[];
}

export function PassageStudyNotePrintDialog({
  open,
  onOpenChange,
  passages,
}: PassageStudyNotePrintDialogProps) {
  const analyzedPassages = useMemo(
    () =>
      passages
        .map((passage) => ({ passage, data: safeParseAnalysis(passage.analysis) }))
        .filter((item): item is { passage: StudyNotePassage; data: PassageAnalysisData } => !!item.data),
    [passages],
  );
  const skippedCount = passages.length - analyzedPassages.length;
  const blocks = useMemo(() => buildStudyNoteBlocks(analyzedPassages), [analyzedPassages]);
  const { state: editingState, dispatch: editingDispatch, effectiveBlocks, hiddenBlocks } = useEditingState(blocks);
  const effectiveBlocksKey = useMemo(
    () => effectiveBlocks.map((block) => block.id).join("|"),
    [effectiveBlocks],
  );
  const measureContentRef = useRef<HTMLDivElement | null>(null);
  const [paginationResult, setPaginationResult] = useState<{ key: string; pages: PaginatedStudyPage[] }>({
    key: "",
    pages: [],
  });
  const hasPaginated = paginationResult.key !== "";
  const pages = paginationResult.pages;

  const [zoom, setZoom] = useState(1);
  const [controlsPos, setControlsPos] = useState<{ top: number; right: number }>({
    top: 12,
    right: 12,
  });

  const measureAndPaginate = useCallback(() => {
    const contentEl = measureContentRef.current;
    if (!contentEl || effectiveBlocks.length === 0) {
      setPaginationResult({ key: effectiveBlocksKey, pages: [] });
      return;
    }

    const availableHeight = contentEl.getBoundingClientRect().height;
    const blockHeights = new Map<string, number>();
    contentEl.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      const id = el.dataset.blockId;
      if (!id) return;
      const styles = window.getComputedStyle(el);
      const marginBottom = Number.parseFloat(styles.marginBottom || "0") || 0;
      blockHeights.set(id, el.getBoundingClientRect().height + marginBottom);
    });

    setPaginationResult({
      key: effectiveBlocksKey,
      pages: paginateStudyBlocks(effectiveBlocks, blockHeights, availableHeight),
    });
  }, [effectiveBlocks, effectiveBlocksKey]);

  useLayoutEffect(() => {
    if (!open) return;

    let cancelled = false;
    let frame = window.requestAnimationFrame(() => {
      if (!cancelled) measureAndPaginate();
    });

    const fonts = "fonts" in document ? document.fonts : null;
    fonts?.ready.then(() => {
      if (cancelled) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) measureAndPaginate();
      });
    });

    const handleResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) measureAndPaginate();
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, measureAndPaginate]);

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100)),
    [],
  );
  const resetZoom = useCallback(() => setZoom(1), []);

  const handlePanStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
  }, []);

  const handleControlsDragStart = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
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
    },
    [controlsPos],
  );

  if (!open) return null;

  const showControls = pages.length > 0;
  const showInitialLoading =
    analyzedPassages.length > 0 && effectiveBlocks.length > 0 && !hasPaginated;
  const showNoBlocksMessage =
    analyzedPassages.length > 0 && effectiveBlocks.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <style>{STUDY_NOTE_PRINT_STYLES}</style>

      <div className="study-note-no-print absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />

      <div
        id="passage-study-note-print-root"
        className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl"
      >
        <div className="study-note-no-print flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <BookMarked className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold text-slate-900">지문 학습 자료 만들기</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  분석 완료 {analyzedPassages.length}편
                </span>
                {analyzedPassages.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <BookMarked className="h-3.5 w-3.5" />
                    {hasPaginated ? `${pages.length}쪽 구성` : "페이지 계산 중"}
                  </span>
                )}
                {skippedCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    분석 없는 지문 {skippedCount}편 제외
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              title="바로 출력"
              aria-label="바로 출력"
              className="inline-flex size-8 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => window.print()}
              disabled={pages.length === 0}
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100"
              aria-label="닫기"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 flex-1">
            <div
              data-pannable-scroll
              className="print-scroll absolute inset-0 bg-[#E8ECF2] px-6 py-5"
            >
              <StudyNoteMeasurementLayer blocks={blocks} contentRef={measureContentRef} />
              {analyzedPassages.length === 0 ? (
                <div className="study-note-no-print mx-auto mt-10 max-w-md rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
                  <BookMarked className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-[14px] font-semibold text-slate-700">출력할 분석 자료가 없습니다.</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                    AI 분석이 완료된 지문을 선택하면 필기노트를 만들 수 있습니다.
                  </p>
                </div>
              ) : showNoBlocksMessage ? (
                <div className="study-note-no-print mx-auto mt-10 max-w-md rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
                  <BookMarked className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-[14px] font-semibold text-slate-700">표시할 블록이 없습니다.</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                    우측 편집 패널에서 카테고리를 켜거나 숨긴 블록을 복원하세요.
                  </p>
                </div>
              ) : showInitialLoading ? (
                <div className="study-note-no-print mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
                  <BookMarked className="mx-auto mb-3 h-10 w-10 text-blue-400" />
                  <p className="text-[14px] font-semibold text-slate-700">A4 페이지를 계산하고 있습니다.</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                    요약/본문/어휘/어법/읽기 포인트/출제 포인트를 실제 A4 높이에 맞춰 재배치합니다.
                  </p>
                </div>
              ) : (
                <div
                  className="study-note-paper-stack"
                  style={{ zoom }}
                  onMouseDown={handlePanStart}
                >
                  {pages.map((page, index) => (
                    <StudyNotePageFrame key={page.id} page={page} pageIndex={index} totalPages={pages.length} />
                  ))}
                </div>
              )}
            </div>

            {showControls && (
              <div className="study-note-no-print pointer-events-none absolute inset-0 z-10">
                <FloatingZoomControls
                  pos={controlsPos}
                  zoom={zoom}
                  onDragStart={handleControlsDragStart}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onReset={resetZoom}
                />
              </div>
            )}
          </div>

          {analyzedPassages.length > 0 && (
            <EditingPanel
              state={editingState}
              dispatch={editingDispatch}
              effectiveBlocks={effectiveBlocks}
              hiddenBlocks={hiddenBlocks}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FloatingZoomControls({
  pos,
  zoom,
  onDragStart,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  pos: { top: number; right: number };
  zoom: number;
  onDragStart: (e: React.MouseEvent<HTMLSpanElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur-sm"
      style={{ top: pos.top, right: pos.right }}
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
      <ZoomButton onClick={onZoomOut} disabled={zoom <= ZOOM_MIN} label="축소">
        <Minus className="size-3.5" aria-hidden="true" />
      </ZoomButton>
      <button
        type="button"
        onClick={onReset}
        disabled={zoom === 1}
        className="inline-flex h-6 min-w-[42px] cursor-pointer items-center justify-center rounded px-1.5 text-[11px] font-bold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
        title="원래 크기"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ZoomButton onClick={onZoomIn} disabled={zoom >= ZOOM_MAX} label="확대">
        <Plus className="size-3.5" aria-hidden="true" />
      </ZoomButton>
      <ZoomButton onClick={onReset} disabled={zoom === 1} label="원래 크기">
        <Maximize2 className="size-3.5" aria-hidden="true" />
      </ZoomButton>
    </div>
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
