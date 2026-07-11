"use client";

// ============================================================================
// 답안 입력 문항 1행 — 번호 칩 + 유형/배점 + brief + 입력 위젯
//
// MC = ①~⑤ 큰 터치 세그먼트(h-11, 선택 시 blue-600 채움).
// SHORT/ESSAY = 자동 확장 textarea(1~3행, 500자 캡).
// AnswerSheetQuestion 에는 정답 필드가 구조적으로 없다(buildAnswerSheet 스트립).
// ============================================================================

import { memo } from "react";
import type { AnswerSheetQuestion } from "@/lib/exam-report/answer-entry";
import { cn } from "@/lib/utils";

/** 서답형 입력 길이 캡 — 서버(POST /api/answer) zod ≤500 과 동일. */
export const ANSWER_TEXT_MAX = 500;

/** 시험 발문 요약(brief)에만 적용 — UI 텍스트는 기본 폰트(계약 §1-3). */
const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

const CHOICE_LABELS = ["①", "②", "③", "④", "⑤"];

interface AnswerQuestionRowProps {
  question: AnswerSheetQuestion;
  choice?: string;
  text?: string;
  filled: boolean;
  disabled: boolean;
  /** '남은 문항으로 이동' 점프 직후 잠깐 강조(rose 링) — 클라가 타임아웃으로 해제. */
  highlighted: boolean;
  onChoice: (number: string, choice: string) => void;
  onText: (number: string, text: string) => void;
}

export const AnswerQuestionRow = memo(function AnswerQuestionRow({
  question,
  choice,
  text,
  filled,
  disabled,
  highlighted,
  onChoice,
  onText,
}: AnswerQuestionRowProps) {
  const textValue = text ?? "";
  // 1~3행 자동 확장 — 서술형은 기본 2행부터 시작.
  const rows = Math.min(
    3,
    Math.max(question.kind === "ESSAY" ? 2 : 1, textValue.split("\n").length),
  );

  return (
    <li
      data-qnum={question.number}
      className={cn(
        "rounded-lg border bg-white p-3 shadow-sm transition-shadow",
        filled ? "border-blue-200" : "border-slate-200",
        highlighted && "border-rose-300 ring-2 ring-rose-200",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums">
          {question.number}
        </span>
        <span className="min-w-0 truncate text-xs font-medium text-slate-500">
          {question.typeLabel}
        </span>
        {question.points != null && (
          <span className="whitespace-nowrap text-xs text-slate-400 tabular-nums">
            {question.points}점
          </span>
        )}
        {filled && (
          <span className="ml-auto whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
            입력됨
          </span>
        )}
      </div>

      {question.brief && (
        <p
          className="mt-1.5 truncate text-xs text-slate-500"
          title={question.brief}
          style={{ fontFamily: EXAM_FONT }}
        >
          {question.brief}
        </p>
      )}

      <div className="mt-2.5">
        {question.kind === "MC" ? (
          <div className="grid grid-cols-5 gap-1.5">
            {CHOICE_LABELS.map((label, index) => {
              const value = String(index + 1);
              const selected = choice === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChoice(question.number, value)}
                  aria-pressed={selected}
                  aria-label={`${question.number}번 문항 ${index + 1}번 선지`}
                  className={cn(
                    "h-11 rounded-md border text-lg font-medium transition-colors",
                    selected
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    disabled && "cursor-default opacity-60 hover:bg-white",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            value={textValue}
            rows={rows}
            maxLength={ANSWER_TEXT_MAX}
            readOnly={disabled}
            placeholder={
              question.kind === "SHORT"
                ? "단답을 입력하세요"
                : "서술한 답을 입력하세요"
            }
            onChange={(e) => onText(question.number, e.target.value)}
            aria-label={`${question.number}번 문항 답안`}
            className={cn(
              "w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-300",
              disabled
                ? "bg-slate-50 text-slate-500"
                : "focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20",
            )}
          />
        )}
      </div>
    </li>
  );
});
