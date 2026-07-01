// @ts-nocheck
"use client";

import React from "react";
import { renderFormatted } from "./render-formatted";
import { grammarMarkerDisplayLabel, shouldRenderOptionListForSubtype } from "@/components/exams/paper-builder/option-display";
import { SUBTYPE_LABELS } from "../question-type-filter";

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
}: {
  direction: string;
  passage: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  displayCorrectAnswer?: string;
  subType?: string | null;
  passageSubType?: string | null;
}) {
  // 어법 판단(GRAMMAR_ERROR)만 라벨/마커를 원형숫자(①)로 표시(시험지 렌더 동일). 타 유형 무영향.
  const isGrammarError = subType === "GRAMMAR_ERROR";
  // 발문 오른쪽에 작은 회색 글씨로 표시할 문제 유형명(예: "빈칸 추론", "조건부 영작").
  const typeLabel = subType ? SUBTYPE_LABELS[subType] : null;
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
    correctOptions.length === 0 && isMarkerType
      ? Array.from(parseCorrectAnswerLabels(displayCorrectAnswer || correctAnswer))
      : [];

  return (
    <div className="space-y-2">
      {/* 의문문(발문) — 접힘 상태에서도 전체 노출. 유형명은 발문 우측 상단에
          고정(flex)한다. 예전 float-right는 줄 높이가 어긋나면 아래 지문 영역을
          침범해서 flex로 교체. */}
      {direction && (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-[13px] font-bold text-slate-900 leading-relaxed whitespace-pre-line">
            {renderFormatted(direction, subType)}
          </div>
          {typeLabel && (
            <span className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-relaxed text-slate-400">
              {typeLabel}
            </span>
          )}
        </div>
      )}

      {/* 지문 — 2줄만 남기고 말줄임 */}
      {passage && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <div className="font-mono text-[12px] leading-[1.8] text-slate-700 whitespace-pre-wrap line-clamp-2">
            {renderFormatted(passage, passageSubType)}
          </div>
        </div>
      )}

      {/* 선지 — 정답만, 파란 원형 라벨 + 파란 굵은 글씨. */}
      {correctOptions.length > 0 ? (
        <div className="space-y-1.5 pl-1">
          {correctOptions.map((opt) => (
            <div
              key={opt.label}
              className="text-[13px] flex items-start gap-2 text-blue-700 font-semibold"
            >
              <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-600 text-white">
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
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-600 text-white"
            >
              {badgeLabel(label)}
            </span>
          ))}
        </div>
      ) : displayCorrectAnswer ? (
        // 서술형 텍스트 정답 — '정답' 원/알약 배지 없이 정답 멘트만 파란 글씨로(사용자 요청).
        <div className="pl-1 text-[13px] font-semibold text-blue-700">
          {renderFormatted(displayCorrectAnswer, subType)}
        </div>
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
