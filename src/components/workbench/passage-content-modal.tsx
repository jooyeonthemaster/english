"use client";

import { useEffect, useMemo } from "react";
import { CheckCircle2, FileText, Loader2, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isDirectInputPassage } from "@/lib/passage-source";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";

// ─── Types ───────────────────────────────────────────────
// Intentionally minimal/structural so both the list-shaped `PassageItem` and the
// fully-fetched server passage (`getWorkbenchPassage`) satisfy it without casts.
export interface PassageContentModalPassage {
  id: string;
  title: string;
  content: string;
  source?: string | null;
  grade?: number | null;
  semester?: string | null;
  unit?: string | null;
  school?: { name: string } | null;
  extractionReviewDraft?: {
    id: string;
    savedPassageId: string | null;
    reviewStatus: string;
    confirmedAt?: string | Date | null;
    updatedAt?: string | Date | null;
  } | null;
}

interface PassageContentModalProps {
  open: boolean;
  onClose: () => void;
  passage: PassageContentModalPassage | null;
  reviewBusy?: boolean;
  onToggleExtractionReview?: (passage: PassageContentModalPassage) => void;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Read-only full-content viewer for a passage.
 *
 * Shown when a teacher clicks "상세 보기" on a **미분석 (un-analyzed)** passage —
 * those have no analysis report to display, so instead of nudging them into the
 * paid "A4 분석 보고서 생성" flow we simply surface the entire passage text.
 * Analyzed passages keep opening the richer `PassageAnalysisModal` instead.
 */
export function PassageContentModal({
  open,
  onClose,
  passage,
  reviewBusy = false,
  onToggleExtractionReview,
}: PassageContentModalProps) {
  // Split on blank lines into paragraphs; keep intra-paragraph line breaks via
  // `whitespace-pre-wrap` so the text reads exactly as it was stored.
  const paragraphs = useMemo(() => {
    if (!passage) return [] as string[];
    const blocks = passage.content
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
    return blocks.length > 0 ? blocks : [passage.content.trim()];
  }, [passage]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !passage) return null;

  const isDirectInput = isDirectInputPassage(passage.source);
  const wordCount = countWords(passage.content);
  const reviewDraft = passage.extractionReviewDraft ?? null;
  const isReviewCommitted = reviewDraft?.reviewStatus === "COMMITTED";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative z-10 mx-4 my-4 flex w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl">
        {/* ─── Header ─── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold text-slate-800">
                {sanitizeAiModelDisclosureText(passage.title)}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-slate-400">
                  미분석
                </span>
                {isDirectInput && (
                  <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                    직접 입력
                  </span>
                )}
                {passage.school && (
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {passage.school.name}
                  </Badge>
                )}
                {passage.grade && (
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {passage.grade}학년
                  </Badge>
                )}
                {passage.semester && (
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {passage.semester === "FIRST" ? "1학기" : "2학기"}
                  </Badge>
                )}
                {passage.unit && (
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {passage.unit}
                  </Badge>
                )}
                <span className="text-[10px] text-slate-400">
                  {wordCount} words
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {reviewDraft && onToggleExtractionReview ? (
              <button
                type="button"
                onClick={() => onToggleExtractionReview(passage)}
                disabled={reviewBusy}
                className={
                  "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                  (isReviewCommitted
                    ? "border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                    : "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700")
                }
              >
                {reviewBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : isReviewCommitted ? (
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isReviewCommitted ? "검수취소" : "검수완료"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ─── Body: full passage text on a paper-like surface ─── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <article className="mx-auto max-w-[760px] rounded-xl border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-8 sm:py-7">
            {paragraphs.map((para, i) => (
              <p
                key={i}
                className="whitespace-pre-wrap text-[14px] leading-7 text-slate-700 [&:not(:first-child)]:mt-4"
              >
                {para}
              </p>
            ))}
          </article>
        </div>

        {/* ─── Footer hint ─── */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-2.5">
          <p className="text-[11px] text-slate-400">
            아직 분석되지 않은 지문입니다. 원문 전체를 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
