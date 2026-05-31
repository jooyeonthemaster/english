"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from "./constants";
import { renderFormatted, safeParseJSON } from "./format-text";
import type { ExamQuestion } from "./types";

// ---------------------------------------------------------------------------
// 문제 목록 탭의 단일 카드
// ---------------------------------------------------------------------------

export function ExamQuestionCard({ eq }: { eq: ExamQuestion }) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const q = eq.question;
  const options = safeParseJSON<{ label: string; text: string }[]>(q.options, []);
  const diffLabel = DIFFICULTY_LABELS[q.difficulty] || q.difficulty;
  const diffClass =
    q.difficulty === "KILLER"
      ? "bg-red-50 text-red-700 border-red-200"
      : q.difficulty === "INTERMEDIATE"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#3182F6] text-white text-[11px] font-bold shrink-0">
          {eq.orderNum}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {QUESTION_TYPE_LABELS[q.type] || q.type}
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${diffClass}`}>
          {diffLabel}
        </Badge>
        <span className="text-[10px] text-[#8B95A1] ml-auto">{eq.points}점</span>
      </div>

      {/* Question text */}
      <div className="text-[13px] text-[#191F28] leading-relaxed whitespace-pre-line">
        {renderFormatted(q.questionText)}
      </div>

      {/* Options */}
      {options.length > 0 && (
        <div className="space-y-1 pl-1">
          {options.map((opt) => {
            const isCorrect = opt.label === q.correctAnswer;
            return (
              <div
                key={opt.label}
                className={`flex items-start gap-2 text-[12px] rounded px-2 py-1 ${
                  isCorrect ? "bg-emerald-50 text-emerald-800 font-medium" : "text-slate-600"
                }`}
              >
                <span
                  className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    isCorrect ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isCorrect ? <Check className="w-3 h-3" /> : opt.label}
                </span>
                <span className="pt-0.5">{renderFormatted(opt.text)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-MC answer */}
      {options.length === 0 && q.correctAnswer && (
        <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">정답:</span> {q.correctAnswer}
        </div>
      )}

      {/* Explanation */}
      {q.explanation && (
        <div className="border-t border-[#F2F4F6] pt-2">
          <button
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            onClick={() => setExplanationOpen(!explanationOpen)}
          >
            {explanationOpen ? "해설 접기" : "해설 보기"}
            {explanationOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {explanationOpen && (
            <div className="mt-2 bg-amber-50/50 border border-amber-100 rounded-md px-3 py-2">
              <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">
                {q.explanation.content}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
