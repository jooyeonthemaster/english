import { X } from "lucide-react";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import type { BuilderQuestion } from "../types";

interface QuestionDetailModalProps {
  question: BuilderQuestion;
  onClose: () => void;
}

export function QuestionDetailModal({ question, onClose }: QuestionDetailModalProps) {
  // BuilderQuestion 은 QuestionCardItem 의 필요한 필드를 모두 포함한다(createdAt 만 Date|string).
  const cardQuestion = question as unknown as QuestionCardItem;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-stretch justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative z-10 mx-4 my-4 flex w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-[15px] font-bold text-slate-800">문제 상세</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Content: 2 columns */}
        <div className="grid flex-1 grid-cols-2 overflow-hidden">
          {/* Left: Passage */}
          <div className="overflow-y-auto border-r border-slate-200">
            {question.passage ? (
              <div className="px-6 py-5">
                <div className="whitespace-pre-wrap font-mono text-sm leading-[2] text-slate-800">
                  {question.passage.content}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                지문 없음
              </div>
            )}
          </div>
          {/* Right: Question */}
          <div className="relative overflow-hidden">
            <div className="h-full overflow-y-auto px-6 py-5">
              <QuestionCard q={cardQuestion} num={1} readonly hideReviewStatusStamp />
            </div>
            {/* 검수 도장 — 우측 문제 박스 우측 상단에 고정 + 확대. */}
            <ReviewStatusStamp
              approved={question.approved}
              className="absolute right-9 top-9 z-10 origin-top-right scale-125"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
