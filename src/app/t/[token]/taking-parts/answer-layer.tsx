"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 응답 레이어(AnswerUiSpec 기준)
//
// **AnswerUiSpec 이 정본**: 마커 전용 유형(GRAMMAR_ERROR/VOCAB_CHOICE/IRRELEVANT/
// SENTENCE_INSERT)은 options 미노출이므로 optionCount/optionLabels 로 선지 칸을
// 그린다(options 기반 렌더만 하면 빈 화면 — W1 계약). options 리스트가 있는
// 유형은 리스트 탭 = 버튼 행 선택과 동기화(둘 다 제공).
//
// 입력 규칙(계약 §V2):
//  - 선택 재탭 = 해제(답 변경·해제 자유). 값은 숫자 토큰 "1".."N"(채점기 정규화 축).
//  - MULTI: selectCount 카운터, 초과 선택 시 가장 오래된 선택 해제.
//  - TEXT_*: 필드 라벨별 자동 확장 textarea, autocomplete/spellcheck off.
//  - MANUAL_ONLY: 넉넉한 textarea + "선생님이 직접 채점합니다" 안내.
//  - input focus 시 scrollIntoView(가상 키보드 가림 방지).
// 정답성 데이터는 props 에 구조적으로 없다(§6-1) — 이 레이어는 입력만 다룬다.
// ============================================================================

import { memo, useCallback, useMemo, type FocusEvent } from "react";
import { PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCircledNumber } from "@/lib/question-postprocess/types";
import { optionDisplayLabel } from "@/components/exams/paper-builder/option-display";
import type {
  AnswerUiSpec,
  StudentSafeBlankSlot,
  StudentSafeOption,
} from "@/lib/exam-scoring/student-safe";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { EXAM_FONT } from "./exam-markup";

const MAX_OPTION_BUTTONS = 20;
const TEXT_MAX = 4000; // 서버 zod 상한과 동일

interface AnswerLayerProps {
  questionOrderNum: number;
  /** 선지 라벨 정본화용(빌더 optionDisplayLabel 과 동일 축 — CUSTOM 만 저장 라벨 존중) */
  subType?: string | null;
  /** "card"(한 문제씩) | "paper"(시험지 보기 — 선지 리스트만, 중복 버튼행 숨김) */
  variant?: "card" | "paper";
  answerUi: AnswerUiSpec;
  options?: StudentSafeOption[];
  /** 작문 계열 빈칸 단서(앞글자·단어 수) — 필드 라벨로 매칭해 표기 */
  blanks?: StudentSafeBlankSlot[];
  input: StudentInput | null;
  disabled: boolean;
  onChange: (input: StudentInput | null) => void;
}

/** input focus 시 하단 바·가상 키보드에 가리지 않게 중앙 스크롤 */
function scrollFieldIntoView(event: FocusEvent<HTMLTextAreaElement>) {
  const el = event.currentTarget;
  window.setTimeout(() => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 250);
}

// ── 선택형(단일/복수) ────────────────────────────────────────────────────────

function resolveChoiceLabels(
  answerUi: AnswerUiSpec,
  optionsLength: number,
  subType?: string | null,
): string[] {
  // 표시 통일(설계 §결정1 2차축): 빌더 시험지와 **동일하게 위치(index) 기반**
  // 원형숫자(①~)로 렌더한다 — optionDisplayLabel(subType,index,라벨)이 CUSTOM 만
  // 저장 라벨을 존중하고 그 외엔 getCircledNumber(index). 저장 토큰이 이미
  // "index+1" 축이라 값·채점 불변, 라벨만 시험지와 픽셀 일치(값vs인덱스 divergence 제거).
  const count = answerUi.optionLabels?.length
    ? Math.min(MAX_OPTION_BUTTONS, answerUi.optionLabels.length)
    : Math.min(
        MAX_OPTION_BUTTONS,
        Math.max(answerUi.optionCount ?? optionsLength ?? 0, optionsLength) || 5,
      );
  return Array.from({ length: count }, (_, index) =>
    optionDisplayLabel(subType, index, answerUi.optionLabels?.[index]),
  );
}

function ChoiceAnswer({
  questionOrderNum,
  subType,
  variant,
  answerUi,
  options,
  input,
  disabled,
  onChange,
}: AnswerLayerProps) {
  const isMulti = answerUi.inputKind === "MULTI_CHOICE";
  const selectCount = Math.max(answerUi.selectCount ?? 2, 1);
  const optionList = options ?? [];
  const labels = resolveChoiceLabels(answerUi, optionList.length, subType);
  // 시험지 보기 + 선지 리스트가 있으면 대형 버튼 행은 중복이라 숨긴다(리스트 탭이
  // 곧 응답). 마커전용(리스트 없음) 유형은 버튼 행이 유일한 응답면이라 항상 노출.
  const showButtonRow = !(variant === "paper" && optionList.length > 0);
  const isPaper = variant === "paper";
  const selected = useMemo<string[]>(
    () =>
      isMulti ? (input?.choices ?? []) : input?.choice ? [input.choice] : [],
    [isMulti, input],
  );

  const toggle = useCallback(
    (value: string) => {
      if (disabled) return;
      if (!isMulti) {
        // 재탭 = 해제(답 지움 → 서버에서 UNKNOWN 수렴)
        onChange(selected[0] === value ? null : { choice: value });
        return;
      }
      let next: string[];
      if (selected.includes(value)) {
        next = selected.filter((v) => v !== value);
      } else {
        next = [...selected, value];
        // 초과 선택 시 가장 오래된 선택을 해제(§V2)
        while (next.length > selectCount) next.shift();
      }
      onChange(next.length > 0 ? { choices: next } : null);
    },
    [disabled, isMulti, onChange, selectCount, selected],
  );

  return (
    <div className={isPaper ? "space-y-1.5" : "space-y-3"}>
      {isMulti && (
        <p
          className={cn(
            "flex items-center justify-between rounded-md bg-[#F7F8FA] font-medium text-[#4E5968]",
            isPaper ? "px-2 py-1 text-[9px]" : "px-3 py-2 text-xs",
          )}
        >
          <span>정답 {selectCount}개를 고르세요</span>
          <span className="tabular-nums">
            현재{" "}
            <span className={cn("font-semibold", selected.length === selectCount ? "text-[#3182F6]" : "text-[#8B95A1]")}>
              {selected.length}
            </span>
            /{selectCount}
          </span>
        </p>
      )}

      {/* 선지 리스트(있을 때) — 행 전체가 터치 영역, 버튼 행과 동기화 */}
      {optionList.length > 0 && (
        <ul className={isPaper ? "space-y-1" : "space-y-2"}>
          {optionList.map((option, index) => {
            const value = String(index + 1);
            const isSelected = selected.includes(value);
            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(value)}
                  aria-pressed={isSelected}
                  aria-label={`${questionOrderNum}번 문항 선지 ${index + 1}`}
                  className={cn(
                    "flex w-full items-start border text-left transition-colors",
                    isPaper
                      ? "gap-1.5 rounded-md px-2 py-1"
                      : "gap-2.5 rounded-xl px-4 py-3 min-h-11",
                    isSelected
                      ? "border-[#3182F6] bg-[#3182F6] text-white"
                      : "border-[#E5E8EB] bg-white text-[#191F28] hover:bg-[#F7F8FA]",
                    disabled && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 font-semibold leading-relaxed",
                      isPaper ? "text-[10px]" : "text-[15px]",
                      isSelected ? "text-white" : "text-[#4E5968]",
                    )}
                    style={{ fontFamily: EXAM_FONT }}
                  >
                    {labels[index] ?? getCircledNumber(index)}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 leading-relaxed",
                      isPaper ? "text-[9.5px]" : "text-[15px]",
                    )}
                    style={{ fontFamily: EXAM_FONT }}
                  >
                    {option.blankValues && option.blankValues.length > 0 ? (
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {option.blankValues.map((blank) => (
                          <span key={blank.label}>
                            <span className="font-semibold">{blank.label}</span>{" "}
                            {blank.value}
                          </span>
                        ))}
                      </span>
                    ) : (
                      option.text
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 대형 원형 버튼 행 — 마커 전용 유형의 유일한 응답면(시험지 보기에서 선지
          리스트가 있으면 중복이라 숨김). */}
      {showButtonRow && (
        <div
          className={cn("flex flex-wrap", isPaper ? "gap-1.5" : "gap-2")}
          role="group"
          aria-label="답 선택"
        >
          {labels.map((label, index) => {
            const value = String(index + 1);
            const isSelected = selected.includes(value);
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => toggle(value)}
                aria-pressed={isSelected}
                aria-label={`${questionOrderNum}번 문항 ${index + 1}번 선지`}
                className={cn(
                  "flex items-center justify-center rounded-full border font-medium transition-colors",
                  isPaper ? "h-6 w-6 text-[11px]" : "h-12 w-12 text-lg",
                  isSelected
                    ? "border-[#3182F6] bg-[#3182F6] text-white"
                    : "border-[#D5DAE0] bg-white text-[#4E5968] hover:bg-[#F7F8FA]",
                  disabled && "opacity-60",
                )}
                style={{ fontFamily: EXAM_FONT }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 서답형(필드별 텍스트) ────────────────────────────────────────────────────

function fieldHint(blanks: StudentSafeBlankSlot[] | undefined, label: string): string {
  const slot = blanks?.find((b) => b.label === label);
  if (!slot) return "";
  const parts: string[] = [];
  if (slot.firstLetterHint) parts.push(`앞글자 ${slot.firstLetterHint}`);
  if (slot.targetWordCount) parts.push(`${slot.targetWordCount}단어`);
  return parts.join(" · ");
}

function TextAnswer({
  questionOrderNum,
  variant,
  answerUi,
  blanks,
  input,
  disabled,
  onChange,
}: AnswerLayerProps) {
  const isPaper = variant === "paper";
  const isManual = answerUi.inputKind === "MANUAL_ONLY";
  const fields =
    answerUi.fields && answerUi.fields.length > 0
      ? answerUi.fields
      : [{ key: "answer", label: "답" }];
  const texts = useMemo(() => input?.texts ?? {}, [input]);

  const setText = useCallback(
    (key: string, value: string) => {
      const next: Record<string, string> = { ...texts, [key]: value.slice(0, TEXT_MAX) };
      // 공백뿐인 필드는 버림 — 전부 비면 null(답 지움 → UNKNOWN 수렴, 서버와 동일)
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(next)) {
        if (v.trim().length > 0) cleaned[k] = v;
      }
      onChange(Object.keys(cleaned).length > 0 ? { texts: cleaned } : null);
    },
    [onChange, texts],
  );

  return (
    <div className={isPaper ? "space-y-1.5" : "space-y-3"}>
      {isManual && (
        <p
          className={cn(
            "flex items-center gap-1.5 rounded-md bg-[#F7F8FA] font-medium text-[#4E5968]",
            isPaper ? "px-2 py-1 text-[9px]" : "px-3 py-2 text-xs",
          )}
        >
          <PenLine className="h-3.5 w-3.5 shrink-0 text-[#8B95A1]" />
          이 문항은 선생님이 직접 채점합니다. 답안을 자유롭게 작성해 주세요.
        </p>
      )}
      {fields.map((field) => {
        const value = texts[field.key] ?? "";
        const hint = fieldHint(blanks, field.label);
        const rows = isManual
          ? Math.min(isPaper ? 5 : 8, Math.max(isPaper ? 3 : 5, value.split("\n").length))
          : Math.min(isPaper ? 3 : 4, Math.max(2, value.split("\n").length));
        return (
          <div key={field.key}>
            {(fields.length > 1 || !isManual) && (
              <div className={cn("flex items-center gap-2", isPaper ? "mb-1" : "mb-1.5")}>
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded bg-blue-50 font-semibold text-[#3182F6]",
                    isPaper ? "h-5 min-w-7 px-1.5 text-[10px]" : "h-7 min-w-9 rounded-md px-2 text-sm",
                  )}
                >
                  {field.label}
                </span>
                {hint && (
                  <span className={cn("text-[#8B95A1]", isPaper ? "text-[9px]" : "text-xs")}>
                    {hint}
                  </span>
                )}
              </div>
            )}
            <textarea
              value={value}
              rows={rows}
              maxLength={TEXT_MAX}
              disabled={disabled}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={isManual ? "답안을 작성해 주세요" : "답을 입력해 주세요"}
              onChange={(e) => setText(field.key, e.target.value)}
              onFocus={scrollFieldIntoView}
              aria-label={`${questionOrderNum}번 문항 ${field.label} 답안`}
              className={cn(
                "w-full resize-none rounded-md border border-[#E5E8EB] bg-white leading-relaxed text-[#191F28] outline-none transition-colors placeholder:text-[#B0B8C1]",
                isPaper ? "px-2.5 py-1.5 text-[10px]" : "rounded-lg px-3.5 py-3 text-[15px]",
                "focus:border-[#3182F6] focus:ring-2 focus:ring-[#3182F6]/20",
                disabled && "bg-[#F7F8FA] text-[#8B95A1]",
              )}
              style={{ fontFamily: EXAM_FONT }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── 공개 컴포넌트 ────────────────────────────────────────────────────────────

export const AnswerLayer = memo(function AnswerLayer(props: AnswerLayerProps) {
  const kind = props.answerUi.inputKind;
  const isPaper = props.variant === "paper";
  return (
    <div
      className={
        isPaper
          ? "mt-1.5 border-t border-dashed border-[#E5E8EB] pt-1.5"
          : "border-t border-[#E5E8EB] pt-4"
      }
    >
      {!isPaper && (
        <p className="mb-3 text-xs font-semibold text-[#8B95A1]">답안 입력</p>
      )}
      {kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE" ? (
        <ChoiceAnswer {...props} />
      ) : (
        <TextAnswer {...props} />
      )}
    </div>
  );
});
