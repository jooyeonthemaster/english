// @ts-nocheck
"use client";

import React from "react";
import type { ParsedSection } from "./types";

export function CollapsedPreview({
  sections,
  options,
  correctAnswer,
  questionClamp,
}: {
  sections: ParsedSection[];
  options: { label: string; text: string }[];
  correctAnswer: string;
  questionClamp: string;
}) {
  const direction = sections.find((s) => s.type === "direction");
  const passage = sections.find((s) => s.type === "passage" || s.type === "summary");
  const correctLabels = parseCorrectAnswerLabels(correctAnswer);

  return (
    <div className="space-y-1">
      {/* Direction */}
      {direction && (
        <div className={`text-[13px] font-bold text-slate-900 leading-relaxed ${questionClamp}`}>
          {direction.content}
        </div>
      )}

      {/* Passage preview (1 line) */}
      {passage && (
        <div className="text-[12px] text-slate-500 line-clamp-1 font-mono">
          {passage.content}
        </div>
      )}

      {/* Options preview or answer preview */}
      {options.length > 0 ? (
        <div className="space-y-0.5">
          {/* Show correct answer option */}
          {options
            .filter((o) => correctLabels.has(normalizeAnswerLabel(o.label)))
            .slice(0, 3)
            .map((correct) => (
              <div key={correct.label} className="flex items-center gap-1.5 text-[12px] rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-800 font-medium">
                <span className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center bg-emerald-500 text-white">
                  {correct.label}
                </span>
                <div className="truncate">{correct.text}</div>
              </div>
            ))}
          {options.length > 1 && (
            <span className="text-[10px] text-slate-400 pl-2">
              외 {options.length - 1}개 선택지
            </span>
          )}
        </div>
      ) : correctAnswer ? (
        <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded line-clamp-1">
          <span className="font-medium">정답:</span> {correctAnswer}
        </div>
      ) : null}
    </div>
  );
}

function parseCorrectAnswerLabels(correctAnswer: string): Set<string> {
  const labels = new Set<string>();
  const matches = correctAnswer?.match(/[([]?\s*(?:[A-Ja-j]|10|[1-9]|[①②③④⑤⑥⑦⑧⑨⑩])\s*[)\].:]?/g);
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
  return text.replace(/^[\(\[]?\s*([A-Ja-j]|10|[1-9])\s*[\)\].:]?\s*$/, "$1").toLowerCase();
}
