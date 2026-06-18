// @ts-nocheck
"use client";

import React from "react";
import { renderFormatted } from "./render-formatted";

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
}: {
  direction: string;
  passage: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  displayCorrectAnswer?: string;
}) {
  const correctLabels = parseCorrectAnswerLabels(correctAnswer);
  const correctOptions = options.filter((o) =>
    correctLabels.has(normalizeAnswerLabel(o.label)),
  );

  return (
    <div className="space-y-2">
      {/* 의문문(발문) — 접힘 상태에서도 전체 노출. */}
      {direction && (
        <div className="text-[13px] font-bold text-slate-900 leading-relaxed whitespace-pre-line">
          {renderFormatted(direction)}
        </div>
      )}

      {/* 지문 — 2줄만 남기고 말줄임 */}
      {passage && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <div className="font-mono text-[12px] leading-[1.8] text-slate-700 whitespace-pre-wrap line-clamp-2">
            {renderFormatted(passage)}
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
                {opt.label}
              </span>
              <span>{renderFormatted(opt.text)}</span>
            </div>
          ))}
        </div>
      ) : displayCorrectAnswer ? (
        <div className="text-[12px] bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded border border-slate-200">
          <span className="font-medium">정답:</span>{" "}
          {renderFormatted(displayCorrectAnswer)}
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
