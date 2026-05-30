"use client";

import { CheckCircle2, Loader2, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";

type DetailQuestion = QuestionCardItem & {
  passage:
    | (QuestionCardItem["passage"] & {
        analysis?: { analysisData?: unknown } | null;
      })
    | null;
};

interface QuestionDetailDialogProps {
  open: boolean;
  loading: boolean;
  loadError: string | null;
  questionId: string | null;
  question: DetailQuestion | null;
  onClose: () => void;
  onRetry: (id: string) => void;
  onApprove: (id: string) => void;
  onUnapprove: (id: string) => void;
  onDelete: (id: string) => void;
}

function parseAnalysisData(value: unknown) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function QuestionDetailDialog({
  open,
  loading,
  loadError,
  questionId,
  question,
  onClose,
  onRetry,
  onApprove,
  onUnapprove,
  onDelete,
}: QuestionDetailDialogProps) {
  if (!open) return null;

  const analysisData = parseAnalysisData(question?.passage?.analysis?.analysisData);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 my-4 flex w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-[15px] font-bold text-slate-800">
              문제 상세
            </h2>
            {question ? (
              <ReviewStatusStamp approved={question.approved} className="shrink-0" />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {question ? (
              <>
                <button
                  type="button"
                  onClick={() => onDelete(question.id)}
                  className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-red-600 shadow-none transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </button>
                {question.approved ? (
                  <button
                    type="button"
                    onClick={() => onUnapprove(question.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-600 shadow-none transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    검수취소
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onApprove(question.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-green-200 bg-green-50/60 px-2.5 text-[11px] font-semibold text-green-700 shadow-none transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    검수완료
                  </button>
                )}
              </>
            ) : null}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100"
              aria-label="닫기"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              문제를 불러오는 중
            </div>
          </div>
        ) : loadError ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-slate-700">{loadError}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  닫기
                </Button>
                {questionId ? (
                  <Button size="sm" onClick={() => onRetry(questionId)}>
                    다시 불러오기
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : question ? (
          <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
            <div className="overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
              {question.passage ? (
                <div className="px-6 py-5">
                  <InteractivePassageView
                    content={question.passage.content}
                    analysisData={analysisData}
                    layout="vertical"
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  지문 없음
                </div>
              )}
            </div>
            <div className="overflow-y-auto px-6 py-5">
              <QuestionCard
                q={{
                  ...question,
                  _count: question._count ?? { examLinks: 0 },
                }}
                num={1}
                readonly
                hideReviewStatusStamp
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
