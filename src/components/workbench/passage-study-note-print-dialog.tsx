"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookMarked, CheckCircle2, Printer, X } from "lucide-react";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { buildStudyNoteBlocks } from "./passage-study-note-print-dialog/block-builder";
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
  const blocksKey = useMemo(() => blocks.map((block) => block.id).join("|"), [blocks]);
  const measureContentRef = useRef<HTMLDivElement | null>(null);
  const [paginationResult, setPaginationResult] = useState<{ key: string; pages: PaginatedStudyPage[] }>({
    key: "",
    pages: [],
  });
  const paginationReady = analyzedPassages.length === 0 || paginationResult.key === blocksKey;
  const pages = paginationReady ? paginationResult.pages : [];

  const measureAndPaginate = useCallback(() => {
    const contentEl = measureContentRef.current;
    if (!contentEl || blocks.length === 0) {
      setPaginationResult({ key: blocksKey, pages: [] });
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
      key: blocksKey,
      pages: paginateStudyBlocks(blocks, blockHeights, availableHeight),
    });
  }, [blocks, blocksKey]);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <style>{STUDY_NOTE_PRINT_STYLES}</style>

      <div className="study-note-no-print absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />

      <div
        id="passage-study-note-print-root"
        className="relative z-10 my-4 flex w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F3F5F8] shadow-2xl"
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
                  분석 완료 {analyzedPassages.length}개
                </span>
                {analyzedPassages.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <BookMarked className="h-3.5 w-3.5" />
                    {paginationReady ? `${pages.length}쪽 구성` : "페이지 계산 중"}
                  </span>
                )}
                {skippedCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    분석 없는 지문 {skippedCount}개 제외
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[12px] font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => window.print()}
              disabled={!paginationReady || pages.length === 0}
            >
              <Printer className="h-3.5 w-3.5" />
              바로 출력
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

        <div className="print-scroll flex-1 bg-[#E8ECF2] px-6 py-5">
          <StudyNoteMeasurementLayer blocks={blocks} contentRef={measureContentRef} />
          {analyzedPassages.length === 0 ? (
            <div className="study-note-no-print mx-auto mt-10 max-w-md rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
              <BookMarked className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-[14px] font-semibold text-slate-700">출력할 분석 자료가 없습니다.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                AI 분석이 완료된 지문을 선택하면 필기노트를 만들 수 있습니다.
              </p>
            </div>
          ) : !paginationReady ? (
            <div className="study-note-no-print mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
              <BookMarked className="mx-auto mb-3 h-10 w-10 text-blue-400" />
              <p className="text-[14px] font-semibold text-slate-700">A4 페이지를 계산하고 있습니다.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                요약/본문/어휘/어법/구문/출제 포인트를 실제 A4 높이에 맞춰 재배치합니다.
              </p>
            </div>
          ) : (
            <div className="study-note-paper-stack">
              {pages.map((page, index) => (
                <StudyNotePageFrame key={page.id} page={page} pageIndex={index} totalPages={pages.length} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
