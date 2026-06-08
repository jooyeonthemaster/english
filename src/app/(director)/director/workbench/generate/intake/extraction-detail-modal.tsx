"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";

import type { PassageItem } from "../generate-page-types";
import { PassageCompare } from "../../passages/import/_components/extraction-manage-client/components/passage-compare";
import { RestorationBadge } from "../../passages/import/_components/extraction-manage-client/components/restoration-badge";
import type { M1PassageDraftWithJob } from "../../passages/import/_components/extraction-manage-client/types";

interface ExtractionDetailModalProps {
  passage: PassageItem;
  onClose: () => void;
}

/**
 * Read-only "지문 전체 보기" for the generate page — reuses the extraction page's
 * wide compare modal (원문/복원문 + 복원 근거 패널 + 추출 원본 이미지 토글). Looks up
 * the M1 draft behind the committed Passage by savedPassageId; when none exists
 * (legacy import) it falls back to a plain content view. View-only: no edit /
 * 재복원 / 검수 actions (those live on the 자료 추출 page).
 */
export function ExtractionDetailModal({
  passage,
  onClose,
}: ExtractionDetailModalProps) {
  const [draft, setDraft] = useState<M1PassageDraftWithJob | null>(null);
  const [loading, setLoading] = useState(true);

  // ESC to close + body scroll lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDraft(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/extraction/m1-passages?savedPassageId=${encodeURIComponent(
            passage.id,
          )}&view=list&limit=1`,
          { credentials: "include", cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        const found =
          Array.isArray(data?.drafts) && data.drafts.length > 0
            ? (data.drafts[0] as M1PassageDraftWithJob)
            : null;
        if (!cancelled) setDraft(found);
      } catch {
        if (!cancelled) setDraft(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passage.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 xl:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-base font-bold text-slate-900">
                {passage.title || "지문"}
              </h2>
              {draft ? (
                <RestorationBadge status={draft.restorationStatus} />
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {draft?.job?.originalFileName
                ? `출처 ${draft.job.originalFileName}`
                : "추출·입력된 지문"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col p-5 xl:p-6">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-slate-400">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <span className="text-[13px]">불러오는 중…</span>
            </div>
          ) : draft ? (
            // Read-only: no onRerestore → 재복원 버튼 숨김; onTextChange는 no-op.
            <PassageCompare draft={draft} onTextChange={() => {}} />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-5">
              <div className="whitespace-pre-wrap text-[14px] leading-7 text-slate-800">
                {passage.content || "내용이 없습니다."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
