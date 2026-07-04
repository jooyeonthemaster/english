// @ts-nocheck
"use client";

import React from "react";
import { renderFormatted } from "./render-formatted";
import { grammarMarkerDisplayLabel, shouldRenderOptionListForSubtype } from "@/components/exams/paper-builder/option-display";
import { SUBTYPE_LABELS } from "../question-type-filter";

// 서술형(영작·요약 등) — 보기(options)가 없고 답이 모범 답안 문장이라, 객관식
// 글자 배지로 파싱하면 안 된다. 이 유형은 카드에 모범 답안 텍스트를 그대로 보인다.
const ESSAY_SUBTYPES = new Set([
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
]);

// 카드를 접었을 때 보여줄 미리보기:
//  · 의문문(발문) — 펼침과 동일하게 전체 노출
//  · 지문 — 2줄만 남기고 '…'으로 말줄임
//  · 선지 — 정답(들)만 표시
export function CollapsedPreview({
  direction,
  passage,
  options,
  correctAnswer,
  displayCorrectAnswer = correctAnswer,
  subType,
  // 지문 렌더 전용 subType 오버라이드. 세트 병합 지문처럼 여러 유형 마커가 섞인 지문은
  // null 로 넘겨 (A) 라벨을 원문자로 바꾸지 않고 펼침 뷰와 동일하게 표시한다. 미지정 시 subType.
  passageSubType = subType,
  isSetMember = false,
  compact = false,
  setBadge,
}: {
  direction: string;
  passage: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  displayCorrectAnswer?: string;
  subType?: string | null;
  passageSubType?: string | null;
  /** 장문 세트(QuestionSet) 소속 문항 — 유형 라벨 앞에 "장문" 표식을 붙여 구분한다. */
  isSetMember?: boolean;
  /** 시험지 빌더 좌측 라이브러리 전용 — 글자·여백·배지를 한 단계 줄인다. */
  compact?: boolean;
  /** 모바일에서 발문 뒤에 인라인으로 이어붙일 세트 배지(세트 카드 전용). */
  setBadge?: React.ReactNode;
}) {
  // 어법 판단(GRAMMAR_ERROR)만 라벨/마커를 원형숫자(①)로 표시(시험지 렌더 동일). 타 유형 무영향.
  const isGrammarError = subType === "GRAMMAR_ERROR";
  // 서술형이면 객관식 정답 배지를 만들지 않고 모범 답안 텍스트를 보인다.
  const isEssay = !!subType && ESSAY_SUBTYPES.has(subType);
  // 발문 오른쪽에 작은 회색 글씨로 표시할 문제 유형명(예: "빈칸 추론", "조건부 영작").
  const typeLabel = subType ? SUBTYPE_LABELS[subType] : null;
  // 발문 옆/뒤에 붙는 유형 라벨 텍스트(세트 멤버는 "장문 · " 접두).
  const typeLabelText =
    isSetMember && typeLabel
      ? `장문 · ${typeLabel}`
      : isSetMember
        ? "장문"
        : typeLabel;
  const badgeLabel = (label: unknown) =>
    optionBadgeLabel(isGrammarError ? grammarMarkerDisplayLabel(label) : label);
  const correctLabels = parseCorrectAnswerLabels(correctAnswer);
  const correctOptions = options.filter((o) =>
    correctLabels.has(normalizeAnswerLabel(o.label)),
  );
  // 보기 텍스트가 없는 마커 유형(어법·어휘·삽입·무관) — 정답을 회색 박스 대신
  // 파란 원형 배지(숫자)로 표시해 일반 선지 배지와 디자인을 통일한다.
  // ⚠️ G1: 마커 유형에 한정한다. 서술형(자유 텍스트 정답)은 정답 문장 속 a~j 낱글자가
  //    parseCorrectAnswerLabels 정규식(괄호 optional)에 과매치돼 가짜 객관식 배지로
  //    둔갑하므로, 배지를 만들지 않고 아래 displayCorrectAnswer "정답:" 텍스트 박스로 흘려보낸다.
  const isMarkerType = !!subType && !shouldRenderOptionListForSubtype(subType);
  const answerBadgeLabels =
    // 두 가드 모두 적용: 마커 유형 한정(G1 오버매치 방지) + 서술형 제외(에세이 가드).
    correctOptions.length === 0 && isMarkerType && !isEssay
      ? Array.from(parseCorrectAnswerLabels(displayCorrectAnswer || correctAnswer))
      : [];

  // 콤팩트(시험지 빌더 좌측)일 때 글자·여백·배지 한 단계 축소.
  const directionTextCls = compact ? "text-[12px]" : "text-[13px]";
  const passageTextCls = compact ? "text-[11px] leading-[1.6]" : "text-[12px] leading-[1.8]";
  const passageBoxCls = compact ? "p-2" : "p-3";
  const optionTextCls = compact ? "text-[12px]" : "text-[13px]";
  const badgeSizeCls = compact ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {/* 의문문(발문) — 접힘 상태에서도 전체 노출. 유형명은 발문 우측 상단에
          고정(flex)한다. 예전 float-right는 줄 높이가 어긋나면 아래 지문 영역을
          침범해서 flex로 교체. */}
      {direction && (
        // 모바일: 발문 문장 끝에 세트 배지·유형 라벨을 인라인으로 이어붙여 "한 문장"처럼
        // 흐르게 한다(예: "발문. [세트·N문항] 장문 · 유형"). PC(lg 이상)는 기존 유지 —
        // 발문 좌측, 유형 라벨 우측 정렬(+세트 배지는 headerExtra 상단 행 그대로).
        <div className="block lg:flex lg:items-start lg:justify-between lg:gap-2">
          <div className={`min-w-0 flex-1 ${directionTextCls} font-bold text-slate-900 leading-relaxed whitespace-pre-line`}>
            {renderFormatted(direction, subType)}
            {(setBadge || typeLabelText) && (
              <span className="align-middle lg:hidden">
                {setBadge ? (
                  <span className="mx-1 inline-flex align-middle">{setBadge}</span>
                ) : (
                  " "
                )}
                {typeLabelText && (
                  <span className="align-middle text-[11px] font-medium text-slate-400">
                    {typeLabelText}
                  </span>
                )}
              </span>
            )}
          </div>
          {typeLabelText && (
            <span className="hidden shrink-0 self-start whitespace-nowrap text-[11px] font-medium leading-relaxed text-slate-400 lg:inline">
              {typeLabelText}
            </span>
          )}
        </div>
      )}

      {/* 지문 — 2줄만 남기고 말줄임 */}
      {passage && (
        <div className={`rounded-lg bg-slate-50 border border-slate-200 ${passageBoxCls}`}>
          <div className={`font-mono ${passageTextCls} text-slate-700 whitespace-pre-wrap line-clamp-2`}>
            {renderFormatted(passage, passageSubType)}
          </div>
        </div>
      )}

      {/* 선지 — 정답만, 파란 원형 라벨 + 파란 굵은 글씨. */}
      {correctOptions.length > 0 ? (
        <div className={`${compact ? "space-y-1" : "space-y-1.5"} pl-1`}>
          {correctOptions.map((opt) => (
            <div
              key={opt.label}
              className={`${optionTextCls} flex items-start gap-2 text-blue-700 font-semibold`}
            >
              <span className={`shrink-0 ${badgeSizeCls} rounded-full flex items-center justify-center font-bold bg-blue-600 text-white`}>
                {badgeLabel(opt.label)}
              </span>
              <span>{renderFormatted(opt.text, subType)}</span>
            </div>
          ))}
        </div>
      ) : answerBadgeLabels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          {answerBadgeLabels.map((label) => (
            <span
              key={label}
              className={`shrink-0 ${badgeSizeCls} rounded-full flex items-center justify-center font-bold bg-blue-600 text-white`}
            >
              {badgeLabel(label)}
            </span>
          ))}
        </div>
      ) : displayCorrectAnswer ? (
        isEssay ? (
          // 서술형 모범 답안 — 파란 '답' 배지 + 파란 글씨(이동주 UI 스타일).
          <div className={`flex items-start gap-2 pl-1 ${optionTextCls} font-semibold text-blue-700`}>
            <span className={`flex shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white ${badgeSizeCls}`}>
              답
            </span>
            <span>{renderFormatted(displayCorrectAnswer, subType)}</span>
          </div>
        ) : (
          <div className={`${compact ? "text-[11px]" : "text-[12px]"} bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded border border-slate-200`}>
            <span className="font-medium">정답:</span>{" "}
            {renderFormatted(displayCorrectAnswer, subType)}
          </div>
        )
      ) : null}
    </div>
  );
}

function parseCorrectAnswerLabels(correctAnswer: string): Set<string> {
  const labels = new Set<string>();
  const matches = correctAnswer?.match(
    /[([]?\s*(?:[A-Ja-j]|10|[1-9]|[①②③④⑤⑥⑦⑧⑨⑩])\s*[)\].:]?/g,
  );
  if (matches?.length) {
    matches.forEach((match) => {
      const label = normalizeAnswerLabel(match);
      if (label) labels.add(label);
    });
  } else {
    const label = normalizeAnswerLabel(correctAnswer);
    if (label) labels.add(label);
  }
  return labels;
}

// 뱃지 표시용 — 동그라미 숫자(①②③)를 평문(1,2,3)으로 풀어 동그라미 안 동그라미를 막는다.
function optionBadgeLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circled = "①②③④⑤⑥⑦⑧⑨⑩";
  const circledIndex = circled.indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text.replace(/^[\(\[]?\s*([A-Ja-j]|10|[1-9])\s*[\)\].:]?\s*$/, "$1");
}

function normalizeAnswerLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circled = "①②③④⑤⑥⑦⑧⑨⑩";
  const circledIndex = circled.indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text
    .replace(/^[\(\[]?\s*([A-Ja-j]|10|[1-9])\s*[\)\].:]?\s*$/, "$1")
    .toLowerCase();
}
