"use client";

// ============================================================================
// OMR 문항 1행 — 번호 칩 + 유형 배지(slate) + 응답 위젯 (V3 소유)
//
// 문항 본문은 렌더하지 않는다(지면 응시 전제) — 헤더 탭 디스클로저로 발문
// 1줄만 참고 표시. 위젯은 **AnswerUiSpec 기준**으로만 파생한다:
//  - SINGLE_CHOICE: ①~⑮ 원형 버튼 행(h-11 w-11, 선택 blue-600, 좁으면 wrap).
//    마커 전용 4유형(어법/어휘/무관/삽입)은 options 미노출 — optionCount/
//    optionLabels 가 렌더 정본(options 기반 렌더 금지, 계약 §V3).
//  - MULTI_CHOICE: 동일 + n/{selectCount} 카운터.
//  - TEXT_*: fields[] 라벨별 컴팩트 input(EXAM_FONT).
//  - MANUAL_ONLY: 자유 서술 textarea 2행.
// TakingQuestion 에는 정답성 데이터가 구조적으로 없다(§6-1).
// ============================================================================

import { memo } from "react";
import { ChevronDown } from "lucide-react";
import type { TakingQuestion } from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { cn } from "@/lib/utils";
import {
  EXAM_FONT,
  MANUAL_TEXT_KEY,
  OMR_MANUAL_TEXT_MAX,
  OMR_TEXT_MAX,
  briefOf,
  optionLabelAt,
  typeBadgeLabel,
} from "./omr-shared";

interface OmrQuestionRowProps {
  question: TakingQuestion;
  input: StudentInput | null;
  filled: boolean;
  disabled: boolean;
  /** 미응답 점프 직후 잠깐 강조(rose 링) — 부모가 타임아웃으로 해제(/a 관례) */
  highlighted: boolean;
  expanded: boolean;
  onToggleExpanded: (questionId: string) => void;
  /** SINGLE: 같은 토큰 재탭 = 답 지움(null) — 부모가 처리 */
  onChoice: (questionId: string, token: string) => void;
  /** MULTI: 토큰 토글(selectCount 상한은 부모가 강제) */
  onToggleChoice: (questionId: string, token: string) => void;
  onText: (questionId: string, fieldKey: string, value: string) => void;
}

/** 선지 수 방어 클램프 — AnswerUiSpec 파손 대비(2~15, 기본 5). */
function optionCountOf(question: TakingQuestion): number {
  const ui = question.answerUi;
  const raw = ui.optionCount ?? ui.optionLabels?.length ?? 5;
  return Math.max(2, Math.min(15, Math.trunc(raw)));
}

export const OmrQuestionRow = memo(function OmrQuestionRow({
  question,
  input,
  filled,
  disabled,
  highlighted,
  expanded,
  onToggleExpanded,
  onChoice,
  onToggleChoice,
  onText,
}: OmrQuestionRowProps) {
  const ui = question.answerUi;
  const kind = ui.inputKind;
  const isChoice = kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE";
  const isMulti = kind === "MULTI_CHOICE";

  return (
    <li
      data-qnum={question.orderNum}
      className={cn(
        "rounded-lg border bg-white shadow-sm transition-shadow",
        filled ? "border-blue-200" : "border-slate-200",
        highlighted && "border-rose-300 ring-2 ring-rose-200",
      )}
    >
      {/* 헤더 = 디스클로저 탭 타깃(h-11 이상) — 위젯 버튼과 분리 */}
      <button
        type="button"
        onClick={() => onToggleExpanded(question.questionId)}
        aria-expanded={expanded}
        aria-label={`${question.orderNum}번 문항 발문 ${expanded ? "접기" : "펼치기"}`}
        className="flex min-h-11 w-full items-center gap-2 px-3 pb-1 pt-2 text-left"
      >
        <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums">
          {question.orderNum}
        </span>
        <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
          {typeBadgeLabel(question.safe.subType)}
        </span>
        <span className="whitespace-nowrap text-xs text-slate-400 tabular-nums">
          {question.points}점
        </span>
        {filled && (
          <span className="ml-auto whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
            답함
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-300 transition-transform",
            !filled && "ml-auto",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <p
          className="px-3 pb-1.5 text-xs leading-relaxed text-slate-500"
          style={{ fontFamily: EXAM_FONT }}
        >
          {briefOf(question)}
        </p>
      )}

      <div className="px-3 pb-3 pt-1">
        {isChoice ? (
          <>
            {isMulti && <MultiCounter ui={ui} input={input} />}
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: optionCountOf(question) }, (_, index) => {
                const token = String(index + 1);
                const label = optionLabelAt(ui.optionLabels, index, question.safe.subType);
                const selected = isMulti
                  ? (input?.choices ?? []).includes(token)
                  : input?.choice === token;
                return (
                  <button
                    key={token}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      isMulti
                        ? onToggleChoice(question.questionId, token)
                        : onChoice(question.questionId, token)
                    }
                    aria-pressed={selected}
                    aria-label={`${question.orderNum}번 문항 ${label} 선지`}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full border font-medium transition-colors",
                      label.length > 1 ? "text-sm" : "text-lg",
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
          </>
        ) : kind === "MANUAL_ONLY" ? (
          <textarea
            rows={2}
            value={input?.texts?.[MANUAL_TEXT_KEY] ?? ""}
            maxLength={OMR_MANUAL_TEXT_MAX}
            readOnly={disabled}
            onChange={(e) =>
              onText(question.questionId, MANUAL_TEXT_KEY, e.target.value)
            }
            placeholder="답안을 그대로 옮겨 적어 주세요"
            aria-label={`${question.orderNum}번 문항 답안`}
            style={{ fontFamily: EXAM_FONT }}
            className={cn(
              "w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-300",
              disabled
                ? "bg-slate-50 text-slate-500"
                : "focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20",
            )}
          />
        ) : (
          // TEXT_SINGLE / TEXT_MULTI — fields[] 라벨별 컴팩트 input
          <div className="space-y-1.5">
            {(ui.fields && ui.fields.length > 0
              ? ui.fields
              : [{ key: MANUAL_TEXT_KEY, label: "답" }]
            ).map((field) => (
              <label key={field.key} className="flex items-center gap-2">
                <span className="min-w-[2.75rem] shrink-0 whitespace-nowrap text-xs font-medium text-slate-500">
                  {field.label}
                </span>
                <input
                  type="text"
                  value={input?.texts?.[field.key] ?? ""}
                  maxLength={OMR_TEXT_MAX}
                  readOnly={disabled}
                  onChange={(e) =>
                    onText(question.questionId, field.key, e.target.value)
                  }
                  placeholder="답 입력"
                  aria-label={`${question.orderNum}번 문항 ${field.label} 답안`}
                  style={{ fontFamily: EXAM_FONT }}
                  className={cn(
                    "h-11 w-full min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none placeholder:text-slate-300",
                    disabled
                      ? "bg-slate-50 text-slate-500"
                      : "focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20",
                  )}
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </li>
  );
});

/** MULTI 카운터 — "n / {selectCount}개 선택"(계약 §V3, selectCount 는 의도적 노출). */
function MultiCounter({
  ui,
  input,
}: {
  ui: TakingQuestion["answerUi"];
  input: StudentInput | null;
}) {
  const selected = input?.choices?.length ?? 0;
  const need = ui.selectCount;
  return (
    <p className="mb-1.5 text-[11px] font-medium">
      <span
        className={cn(
          "tabular-nums",
          need != null && selected === need ? "text-blue-600" : "text-slate-500",
        )}
      >
        {selected}
      </span>
      <span className="text-slate-400 tabular-nums">
        {need != null ? ` / ${need}` : ""}개 선택
      </span>
    </p>
  );
}
