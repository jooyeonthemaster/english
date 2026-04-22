"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PassageDetailProps } from "./types";
import { Q_TYPE_LABELS, Q_SUBTYPE_LABELS, Q_DIFF } from "./constants";
import { safeParseJSON } from "./utils";

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Questions Section — toggle + 2-column grid with FULL question cards
// ---------------------------------------------------------------------------

function PassageQuestionCard({ q, num }: { q: PassageDetailProps["passage"]["questions"][0]; num: number }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const options = safeParseJSON<{ label: string; text: string }[]>(q.options, []);
  const tags = safeParseJSON<string[]>(q.tags, []);
  const keyPoints = safeParseJSON<string[]>(q.explanation?.keyPoints, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-blue-200 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-slate-400 mr-1">{num}.</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {Q_TYPE_LABELS[q.type] || q.type}
          </span>
          {q.subType && (
            <span className="text-[10px] text-slate-500">
              {Q_SUBTYPE_LABELS[q.subType] || q.subType}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${Q_DIFF[q.difficulty]?.cls || "bg-slate-100 text-slate-500"}`}>
            {Q_DIFF[q.difficulty]?.label || q.difficulty}
          </span>
          {q.approved && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">승인</span>
          )}
          <Link href={`/director/questions/${q.id}`} className="ml-auto text-[10px] text-blue-500 hover:text-blue-700 font-medium">
            편집
          </Link>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Question text */}
      <div className="px-4 py-3">
        <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">
          {q.questionText}
        </p>
      </div>

      {/* Options (for multiple choice) */}
      {options.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {options.map((opt, i) => {
            const isCorrect = q.correctAnswer === opt.label || q.correctAnswer === opt.text || q.correctAnswer === String(i + 1);
            return (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] ${
                  isCorrect ? "bg-emerald-50 text-emerald-800 font-medium" : "text-slate-600"
                }`}
              >
                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                  isCorrect ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {i + 1}
                </span>
                {opt.text || opt.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Short answer */}
      {options.length === 0 && q.correctAnswer && (
        <div className="px-4 pb-3">
          <div className="px-3 py-2 rounded-lg bg-emerald-50 text-[13px] text-emerald-800 font-medium">
            정답: {q.correctAnswer}
          </div>
        </div>
      )}

      {/* Explanation toggle */}
      {q.explanation && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="w-full flex items-center gap-1.5 px-4 py-2.5 text-[12px] text-blue-600 font-medium hover:bg-slate-50 transition-colors"
          >
            해설 보기
            <ChevronDown className={`w-3 h-3 transition-transform ${showExplanation ? "rotate-180" : ""}`} />
          </button>
          {showExplanation && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                {q.explanation.content}
              </p>
              {keyPoints.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500">핵심 포인트</span>
                  {keyPoints.map((kp, i) => (
                    <p key={i} className="text-[11px] text-slate-500 pl-2 border-l-2 border-blue-200">{kp}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">{formatDate(q.createdAt)}</span>
        {q._count?.examLinks !== undefined && q._count.examLinks > 0 && (
          <span className="text-[10px] text-slate-400">시험 {q._count.examLinks}회 사용</span>
        )}
      </div>
    </div>
  );
}

export function QuestionsSection({ questions }: { questions: PassageDetailProps["passage"]["questions"] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white rounded-xl border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <span className="text-[14px] font-semibold text-slate-800">
          연결된 문제 ({questions.length}개)
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {questions.map((q, idx) => (
              <PassageQuestionCard key={q.id} q={q} num={idx + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
