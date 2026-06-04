"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FileUp,
  Loader2,
  PanelLeftClose,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientPageSlot } from "@/lib/extraction/types";
import { PreviewZoomControls } from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { useSimilarPreviewZoom } from "./use-similar-preview-zoom";

// 미리보기 한 페이지의 기준 폭 — 시험지 생성 미리보기와 동일(760px) 기준.
const PREVIEW_BASE_WIDTH = 760;
const PREVIEW_PAGE_GAP = 20;
const THUMBNAILS_WIDTH = 96;
const THUMBNAILS_COLLAPSED_STORAGE_KEY =
  "smoat.similarExam.previewThumbnailsCollapsed.v1";

interface StagedFile {
  fileName: string;
  totalPages: number;
}

interface SimilarExamCenterPreviewProps {
  staged: StagedFile | null;
  slots: ClientPageSlot[];
  splitting: boolean;
  splitMessage: string;
  busy: boolean;
  uploadProgress: number;
  error: string | null;
  onPickFiles: (files: FileList | File[]) => void;
  onRequestFileDialog: () => void;
}

function readStoredThumbnailsCollapsed() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(THUMBNAILS_COLLAPSED_STORAGE_KEY) === "true"
  );
}

export function SimilarExamCenterPreview({
  staged,
  slots,
  splitting,
  splitMessage,
  busy,
  uploadProgress,
  error,
  onPickFiles,
  onRequestFileDialog,
}: SimilarExamCenterPreviewProps) {
  const [thumbnailsCollapsed, setThumbnailsCollapsed] = useState(
    readStoredThumbnailsCollapsed,
  );
  const [activePageIndex, setActivePageIndex] = useState(0);

  const pageAspectRatio = useMemo(() => {
    const first = slots[0];
    if (first && first.width > 0 && first.height > 0) {
      return first.height / first.width;
    }
    return 1.414; // A4 세로 기본값
  }, [slots]);

  const {
    scrollerRef,
    zoom,
    controlsPos,
    zoomIn,
    zoomOut,
    reset,
    fitToScreen,
    handleControlsDragStart,
  } = useSimilarPreviewZoom(PREVIEW_BASE_WIDTH, pageAspectRatio);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        THUMBNAILS_COLLAPSED_STORAGE_KEY,
        String(thumbnailsCollapsed),
      );
    } catch {
      // 보관 실패는 무시 — 현재 세션에서는 정상 동작.
    }
  }, [thumbnailsCollapsed]);

  // 스크롤 위치로 현재 페이지를 추적해 썸네일을 하이라이트한다.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const handleScroll = () => {
      const frames = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-similar-page-index]"),
      );
      if (frames.length === 0) return;
      const scrollerTop = scroller.getBoundingClientRect().top;
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      frames.forEach((frame) => {
        const pageIndex = Number(frame.dataset.similarPageIndex || 0);
        const distance = Math.abs(
          frame.getBoundingClientRect().top - scrollerTop - 20,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = pageIndex;
        }
      });
      setActivePageIndex(bestIndex);
    };
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [slots.length, scrollerRef]);

  const handleSelectPage = useCallback(
    (pageIndex: number) => {
      const scroller = scrollerRef.current;
      const target = scroller?.querySelector<HTMLElement>(
        `[data-similar-page-index="${pageIndex}"]`,
      );
      if (!scroller || !target) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      scroller.scrollTo({
        top: scroller.scrollTop + targetRect.top - scrollerRect.top - 20,
        behavior: "smooth",
      });
      setActivePageIndex(pageIndex);
    },
    [scrollerRef],
  );

  const pageWidth = Math.round(PREVIEW_BASE_WIDTH * zoom);
  const hasPages = staged !== null && slots.length > 0;
  const thumbnailWidth = THUMBNAILS_WIDTH - 28;

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/70">
      {hasPages ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <PreviewZoomControls
            zoom={zoom}
            position={controlsPos}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={reset}
            onFit={fitToScreen}
            onDragStart={handleControlsDragStart}
          />

          {busy && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/55 backdrop-blur-[1px]">
              <div className="pointer-events-auto w-[min(420px,86%)] rounded-xl border border-blue-100 bg-white/95 p-5 shadow-xl shadow-blue-600/10">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Loader2 className="size-5 animate-spin" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-slate-900">
                      {splitMessage || "작업 준비 중"}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                      업로드가 끝나면 작업 목록에서 진행 상태를 확인할 수 있습니다.
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>{staged ? `${staged.totalPages}페이지` : "준비 중"}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex h-full min-h-0">
            {thumbnailsCollapsed ? (
              <button
                type="button"
                onClick={() => setThumbnailsCollapsed(false)}
                title="페이지 목록 열기"
                aria-label="페이지 목록 열기"
                aria-expanded={false}
                className="hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-r border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 lg:flex"
              >
                <ChevronRight className="h-3.5 w-3.5" />
                <span style={{ writingMode: "vertical-rl" }}>페이지</span>
              </button>
            ) : (
              <div
                style={{ width: THUMBNAILS_WIDTH }}
                className="hidden shrink-0 flex-col border-r border-slate-200 bg-white/80 lg:flex"
              >
                <div className="flex shrink-0 items-center justify-between gap-1 border-b border-slate-200 px-2 py-1.5">
                  <span className="truncate text-[10px] font-black uppercase tracking-wider text-slate-400">
                    페이지
                  </span>
                  <button
                    type="button"
                    onClick={() => setThumbnailsCollapsed(true)}
                    title="페이지 목록 닫기"
                    aria-label="페이지 목록 닫기"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-3">
                  {slots.map((slot, pageIndex) => (
                    <button
                      key={slot.pageIndex}
                      type="button"
                      onClick={() => handleSelectPage(pageIndex)}
                      className={cn(
                        "group flex w-full flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors",
                        activePageIndex === pageIndex
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:bg-slate-50",
                      )}
                      title={`${pageIndex + 1}쪽으로 이동`}
                    >
                      <span
                        className="relative block overflow-hidden rounded-sm bg-white shadow-sm"
                        style={{
                          width: thumbnailWidth,
                          height: thumbnailWidth * pageAspectRatio,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slot.previewUrl}
                          alt={`${pageIndex + 1}페이지 썸네일`}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </span>
                      <span className="text-[10px] font-black">
                        {pageIndex + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              ref={scrollerRef}
              className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable]"
            >
              <div
                className="mx-auto flex flex-col items-center"
                style={{ gap: PREVIEW_PAGE_GAP, width: pageWidth }}
              >
                {slots.map((slot, pageIndex) => (
                  <div
                    key={slot.pageIndex}
                    data-similar-page-index={pageIndex}
                    className="overflow-hidden rounded-sm bg-white shadow-[0_1px_3px_rgba(15,23,42,0.12),0_8px_24px_-12px_rgba(15,23,42,0.25)]"
                    style={{ width: pageWidth }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={slot.previewUrl}
                      alt={`${pageIndex + 1}페이지`}
                      className="block w-full"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
          <button
            type="button"
            onClick={onRequestFileDialog}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onPickFiles(event.dataTransfer.files);
            }}
            disabled={splitting}
            className="flex min-h-[320px] w-full max-w-[760px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50/40 disabled:cursor-wait"
          >
            {splitting ? (
              <>
                <Loader2 className="mb-4 size-12 animate-spin text-blue-500" />
                <span className="text-lg font-semibold text-slate-950">
                  {splitMessage || "시험지 준비 중"}
                </span>
              </>
            ) : (
              <>
                <UploadCloud
                  className="mb-4 size-12 text-blue-500"
                  strokeWidth={1.6}
                />
                <span className="text-lg font-semibold text-slate-950">
                  분석할 시험지 PDF 또는 이미지 입력
                </span>
                <span className="mt-2 max-w-[520px] text-sm leading-6 text-slate-500">
                  업로드하면 이 영역에 미리보기가 표시됩니다. 오른쪽에서
                  [시험지 생성 시작]을 눌러야 작업이 시작됩니다.
                </span>
                <span className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">
                  <FileUp className="size-4" />
                  시험지 선택
                </span>
              </>
            )}
          </button>
          {error && (
            <div className="mt-4 w-full max-w-[760px] rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
