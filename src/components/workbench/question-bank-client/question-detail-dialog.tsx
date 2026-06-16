"use client";

import { useState } from "react";
import { Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import {
  SimilarQuestionAnalysisModal,
  type QAnalysis,
} from "@/app/(director)/director/workbench/questions/similar/similar-question-analysis-modal";

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
  /** 전달 시 우측 상단에 '문제 수정' 버튼을 노출한다. */
  onEdit?: (id: string) => void;
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
  onEdit,
}: QuestionDetailDialogProps) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  if (!open) return null;

  const analysisData = parseAnalysisData(
    question?.passage?.analysis?.analysisData,
  );
  // 동형 문제 생성물이면 원본 문항 분석(structuredData._similarSourceAnalysis)을 노출.
  const structured = parseAnalysisData(question?.structuredData) as Record<
    string,
    unknown
  > | null;
  const similarAnalysis: QAnalysis | null =
    structured &&
    typeof structured === "object" &&
    structured._similarSourceAnalysis
      ? (structured._similarSourceAnalysis as QAnalysis)
      : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-stretch justify-center">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div className="relative z-10 mx-4 my-4 flex w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* 검수 토글 점 — 좌측 끝 첫 번째. 누르면 검수상태(초록↔빨강)가
                  실제로 바뀐다. 제목과 세로 중앙 정렬(items-center). */}
              {question ? (
                <button
                  type="button"
                  onClick={() =>
                    question.approved
                      ? onUnapprove(question.id)
                      : onApprove(question.id)
                  }
                  aria-label={question.approved ? "검수완료" : "검수필요"}
                  title={
                    question.approved
                      ? "검수완료 — 누르면 검수를 취소합니다"
                      : "검수필요 — 누르면 검수완료로 표시합니다"
                  }
                  className={
                    "size-3.5 shrink-0 cursor-pointer rounded-full ring-2 ring-white shadow-sm transition-colors hover:brightness-110 " +
                    (question.approved ? "bg-emerald-500" : "bg-red-500")
                  }
                />
              ) : null}
              <h2 className="text-[15px] font-bold text-slate-800">
                문제 상세
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {question ? (
                <>
                  {onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(question.id)}
                      className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-2.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:border-blue-700 hover:bg-blue-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      문제 수정
                    </button>
                  ) : null}
                  {similarAnalysis ? (
                    <button
                      type="button"
                      onClick={() => setAnalysisOpen(true)}
                      className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      분석 정보
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDelete(question.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-red-600 shadow-none transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
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
                <p className="text-sm font-medium text-slate-700">
                  {loadError}
                </p>
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
              <div className="relative overflow-hidden">
                <div className="h-full overflow-y-auto px-6 py-5">
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
                {/* 검수 도장 — 이 팝업 전용으로 우측 문제 박스 우측 상단에 고정 + 확대.
                  ReviewStatusStamp는 공용이라 컴포넌트를 바꾸지 않고 transform scale로만 키운다. */}
                <ReviewStatusStamp
                  approved={question.approved}
                  className="absolute right-9 top-9 z-10 origin-top-right scale-125"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {analysisOpen ? (
        <SimilarQuestionAnalysisModal
          analysis={similarAnalysis}
          onClose={() => setAnalysisOpen(false)}
        />
      ) : null}
    </>
  );
}
