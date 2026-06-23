"use client";

import { Check, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExamPassage } from "@/lib/exam-passages/types";
import {
  formatExamTitle,
  reconLabel,
  isReconstructed,
  typeBadgeClass,
  eraLabel,
} from "@/lib/exam-passages/format";

interface ExamPassagePreviewModalProps {
  passage: ExamPassage | null;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onClose: () => void;
}

function answerText(answer: ExamPassage["answer"]): string | null {
  if (answer == null) return null;
  if (typeof answer === "number") {
    const circles = "①②③④⑤";
    return circles[answer - 1] ?? String(answer);
  }
  return Object.entries(answer)
    .map(([k, v]) => `${k}번 ${"①②③④⑤"[v - 1] ?? v}`)
    .join(" · ");
}

/** 기출 지문 전체 보기 — 복원된 완전한 본문 + 메타 + 정답. */
export function ExamPassagePreviewModal({
  passage,
  selected,
  onToggleSelect,
  onClose,
}: ExamPassagePreviewModalProps) {
  const ans = passage ? answerText(passage.answer) : null;

  return (
    <Dialog open={!!passage} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[92vw] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {passage ? (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b border-slate-100 px-5 py-4 pr-10">
              <DialogTitle className="text-[15px] font-bold text-slate-800">
                {formatExamTitle(passage)}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {passage.type} · {passage.wordCount} words
                {ans ? ` · 정답 ${ans}` : ""} — 복원된 완전한 영어 지문 전체 보기
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={
                    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold " +
                    typeBadgeClass(passage.typeGroup)
                  }
                >
                  {passage.type}
                </span>
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500">
                  {eraLabel(passage.era)}
                </span>
                {isReconstructed(passage.reconstructionKind) ? (
                  <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500">
                    {reconLabel(passage.reconstructionKind)}
                  </span>
                ) : null}
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500">
                  {passage.wordCount} words
                </span>
                {ans ? (
                  <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500">
                    정답 {ans}
                  </span>
                ) : null}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="whitespace-pre-wrap text-[13.5px] leading-[1.85] text-slate-700">
                {passage.text}
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <span className="text-[11.5px] text-slate-400">
                복원 신뢰도: {passage.confidence.toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => onToggleSelect(passage.id)}
                className={
                  "inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[12.5px] font-semibold transition " +
                  (selected
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
                }
              >
                {selected ? (
                  <>
                    <Check className="size-4" strokeWidth={2.5} />
                    선택됨
                  </>
                ) : (
                  <>
                    <Plus className="size-4" />
                    다음으로 (내 지문함)
                  </>
                )}
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
