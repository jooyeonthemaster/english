"use client";

import { useState } from "react";
import { FileText, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { type QuestionCardItem } from "@/components/workbench/question-card";
import {
  QuestionBankCard,
  type QuestionBankItem,
} from "@/components/workbench/question-bank-card";
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
              <h2 className="text-[15px] font-bold text-slate-800">
                문제 상세
              </h2>
              {question?.createdAt ? (
                <span className="text-[12px] font-medium tabular-nums text-slate-400">
                  {formatDateTime(question.createdAt)}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {question ? (
                <>
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
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
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
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-[12px] font-semibold text-slate-600">
                          지문 본문
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap px-5 py-4 font-mono text-sm leading-[2] text-slate-800">
                        {question.passage.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    지문 없음
                  </div>
                )}
              </div>
              <div className="relative overflow-hidden">
                <div className="h-full overflow-y-auto px-6 py-5">
                  {/* 본문 영역만 카드 스타일로(embedded) — 손잡이/체크박스/별/삭제/사용이력 숨김.
                      하단에는 문제 카드와 동일한 검수완료/수정하기 버튼을 같은 메커니즘으로 노출한다.
                      auto 높이 래퍼로 감싸 카드 h-full 이 빈 공간으로 늘어나지 않게 한다. */}
                  <div>
                  <QuestionBankCard
                    q={
                      {
                        ...question,
                        _count: question._count ?? { examLinks: 0 },
                      } as unknown as QuestionBankItem
                    }
                    num={1}
                    selected={false}
                    onToggle={() => {}}
                    onApprove={() => onApprove(question.id)}
                    onUnapprove={() => onUnapprove(question.id)}
                    onEdit={onEdit ? () => onEdit(question.id) : undefined}
                    embedded
                    showStar={false}
                    enableDrag={false}
                  />
                  </div>
                </div>
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
