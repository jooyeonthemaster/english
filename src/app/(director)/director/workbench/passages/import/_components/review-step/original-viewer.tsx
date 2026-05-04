"use client";

// ============================================================================
// OriginalViewer — center column showing page images with bbox overlays.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CONFIDENCE_GREEN,
  CONFIDENCE_YELLOW,
} from "@/lib/extraction/constants";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import { confidenceLayer } from "./confidence";
import { firstPageOf } from "./source-draft";
import type { LoadedPage } from "./types";

interface OriginalViewerProps {
  pages: LoadedPage[];
  selectedItem: ExtractionItemSnapshot | null;
  items: ExtractionItemSnapshot[];
  focusedPageIndex: number | null;
  onFocus: (page: number) => void;
  suspectOnly: boolean;
}

export function OriginalViewer({
  pages,
  selectedItem,
  items,
  focusedPageIndex,
  onFocus,
  suspectOnly,
}: OriginalViewerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Scroll to focused page
  useEffect(() => {
    if (focusedPageIndex == null) return;
    const el = document.getElementById(`page-${focusedPageIndex}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusedPageIndex]);

  return (
    <main
      className="flex min-w-0 flex-1 flex-col bg-slate-100"
      aria-label="원본 이미지 뷰어"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2">
        <div className="flex items-center gap-2 text-[12px] text-slate-600">
          <button
            onClick={() =>
              onFocus(Math.max(0, (focusedPageIndex ?? 0) - 1))
            }
            disabled={focusedPageIndex == null || focusedPageIndex <= 0}
            className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-12 text-center text-[12px] tabular-nums text-slate-500">
            {focusedPageIndex != null
              ? `${focusedPageIndex + 1} / ${pages.length}`
              : "—"}
          </span>
          <button
            onClick={() =>
              onFocus(Math.min(pages.length - 1, (focusedPageIndex ?? 0) + 1))
            }
            disabled={
              focusedPageIndex == null ||
              focusedPageIndex >= pages.length - 1
            }
            className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
            aria-label="다음 페이지"
          >
            <ChevronRight className="size-4" />
          </button>
          <select
            value={focusedPageIndex ?? 0}
            onChange={(e) => onFocus(Number(e.target.value))}
            className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 focus:border-sky-400 focus:outline-none"
            aria-label="페이지 이동"
          >
            {pages.map((p) => (
              <option key={p.pageIndex} value={p.pageIndex}>
                페이지 {p.pageIndex + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[11px] text-slate-500">
          {suspectOnly ? "의심 구간만 강조" : "전체 블록 표시"}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-auto p-6"
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {pages.map((p) => {
            const pageItems = items.filter(
              (it) => firstPageOf(it) === p.pageIndex,
            );
            const isFocused = focusedPageIndex === p.pageIndex;
            // P1-3: 확장된 alt — 스크린 리더가 페이지의 추출 상태까지 안내.
            const suspectCount = pageItems.filter(
              (it) =>
                it.needsReview ||
                (it.confidence != null && it.confidence < CONFIDENCE_YELLOW),
            ).length;
            const figureAriaLabel = `페이지 ${p.pageIndex + 1} — 추출 ${pageItems.length}개 블록${
              suspectCount > 0 ? ` (${suspectCount}개 의심)` : ""
            }`;
            return (
              <figure
                key={p.pageIndex}
                id={`page-${p.pageIndex}`}
                aria-label={figureAriaLabel}
                className={
                  "relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all " +
                  (isFocused
                    ? "border-sky-400 ring-2 ring-sky-200"
                    : "border-slate-200")
                }
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={figureAriaLabel}
                    className="block w-full"
                  />
                ) : (
                  <div className="flex h-60 items-center justify-center text-[12px] text-slate-400">
                    이미지를 불러올 수 없습니다
                  </div>
                )}

                {/* Bounding-box overlays */}
                {pageItems
                  .filter((it) => it.boundingBox != null)
                  .map((it) => {
                    const bb = it.boundingBox!;
                    const isSel = selectedItem?.id === it.id;
                    const conf = it.confidence;
                    const suspect =
                      it.needsReview ||
                      (conf != null && conf < CONFIDENCE_YELLOW);
                    if (suspectOnly && !suspect && !isSel) return null;
                    // 선택 상태는 강한 sky 링을 고정, 그 외엔 confidenceLayer가
                    // bg + ring 을 함께 제공한다 (중복 ring class 제거).
                    const layerCls = isSel
                      ? "ring-2 ring-sky-500 ring-offset-1 ring-offset-white"
                      : suspect || (conf != null && conf < CONFIDENCE_GREEN)
                        ? confidenceLayer(conf)
                        : "ring-1 ring-slate-300/60";
                    return (
                      <div
                        key={it.id}
                        data-item-id={it.id}
                        className={
                          "pointer-events-none absolute transition-all " +
                          layerCls
                        }
                        style={{
                          left: `${bb.x * 100}%`,
                          top: `${bb.y * 100}%`,
                          width: `${bb.w * 100}%`,
                          height: `${bb.h * 100}%`,
                          borderRadius: 4,
                        }}
                        aria-hidden
                      />
                    );
                  })}

                <figcaption className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">
                    페이지 {p.pageIndex + 1}
                  </span>
                  <span>
                    블록 {pageItems.length}개 · {p.extractedText?.length ?? 0}자
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </main>
  );
}
