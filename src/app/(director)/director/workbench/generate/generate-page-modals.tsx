"use client";

import { type Dispatch, type SetStateAction } from "react";
import { CheckCircle2, Loader2, SquarePen, X, XCircle } from "lucide-react";
import { TeacherPointsPassage } from "@/components/workbench/teacher-points-passage";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import type { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";

// generate-page-client.tsx 의 인라인 모달·오버레이(스펙 §레인1 U6 modals).
// 코드는 generate-page-client.tsx 에서 바이트 동일 이동(무회귀) — 캡처만 프롭화.

// ─── Question Detail Modal ───
export function QuestionDetailModal({
  detailQuestion,
  setDetailQuestion,
  handleApproveQuestion,
  handleUnapproveQuestion,
  editor,
}: {
  detailQuestion: QuestionCardItem | null;
  setDetailQuestion: Dispatch<SetStateAction<QuestionCardItem | null>>;
  handleApproveQuestion: (questionId: string) => Promise<void>;
  handleUnapproveQuestion: (questionId: string) => Promise<void>;
  editor: ReturnType<typeof useQuestionEditor>;
}) {
  return (
    <>
      {detailQuestion && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setDetailQuestion(null)}
          />
          <div
            data-generate-tour="question-detail-modal"
            className="relative z-10 w-full max-w-[1200px] mx-4 my-4 bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-200 shrink-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="text-[15px] font-bold text-slate-800">
                  문제 상세
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {detailQuestion.approved ? (
                  <button
                    type="button"
                    onClick={() => handleUnapproveQuestion(detailQuestion.id)}
                    title="검수취소"
                    aria-label="검수취소"
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApproveQuestion(detailQuestion.id)}
                    title="검수완료"
                    aria-label="검수완료"
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* 수정하기 — 검수완료 버튼 오른쪽. 상세를 닫고 편집기를 연다. */}
                <button
                  type="button"
                  onClick={() => {
                    const id = detailQuestion.id;
                    setDetailQuestion(null);
                    editor.openEditor(id);
                  }}
                  title="수정하기"
                  aria-label="수정하기"
                  className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <SquarePen className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDetailQuestion(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Content: 2 columns */}
            <div className="flex-1 overflow-hidden grid grid-cols-2">
              {/* Left: Passage — 포인트 짚어주기 문항이면 칩 레일 + 하이라이트
                  재현(공용 TeacherPointsPassage — 문제은행 상세와 동일 표시). */}
              <div className="border-r border-slate-200 overflow-y-auto">
                {detailQuestion.passage ? (
                  <div className="px-6 py-5">
                    <TeacherPointsPassage
                      content={detailQuestion.passage.content}
                      question={detailQuestion}
                      bodyClassName="whitespace-pre-wrap font-mono text-sm leading-[2] text-slate-800"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    지문 없음
                  </div>
                )}
              </div>
              {/* Right: Question */}
              <div className="relative overflow-hidden">
                <div className="h-full overflow-y-auto px-6 py-5">
                  <QuestionCard
                    q={detailQuestion}
                    num={1}
                    readonly
                    hideReviewStatusStamp
                  />
                </div>
                {/* 검수 도장 — 이 팝업 전용으로 우측 문제 박스 우측 상단에 고정 + 확대.
                    공용 ReviewStatusStamp는 그대로 두고 transform scale로만 키운다. */}
                <ReviewStatusStamp
                  approved={detailQuestion.approved}
                  className="absolute right-9 top-9 z-10 origin-top-right scale-125"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Loading overlay for analysis modal fetch
export function LoadingAnalysisOverlay({
  loadingAnalysisModal,
}: {
  loadingAnalysisModal: boolean;
}) {
  return (
    <>
      {loadingAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="bg-white rounded-xl px-6 py-4 shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-[13px] text-slate-700 font-medium">
              학습지 생성 데이터 로딩 중...
            </span>
          </div>
        </div>
      )}
    </>
  );
}
