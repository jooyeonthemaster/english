// @ts-nocheck
"use client";

import { useState } from "react";
import {
  Layers,
  CheckCircle2,
  Clock,
  Gem,
  Star,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { Badge } from "@/components/ui/badge";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { cn, formatDate } from "@/lib/utils";
import {
  getQuestionGenerationPlanFromTags,
  planForDifficulty,
  QUESTION_GENERATION_PLANS,
} from "@/lib/question-generation-plans";
import {
  TYPE_LABELS,
  SUBTYPE_LABELS,
  DIFFICULTY_CONFIG,
} from "@/components/workbench/question-type-filter";
import type { QuestionItem } from "./types";
import { parseJSON } from "./helpers";

export function ReadonlyQuestionCard({
  q,
  num,
}: {
  q: QuestionItem;
  num: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
  const generationPlan = getQuestionGenerationPlanFromTags(
    parseJSON<string[]>(q.tags, []),
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-bold text-slate-500">{num}.</span>
        <Badge variant="outline" className="text-[10px]">
          {TYPE_LABELS[q.type] || q.type}
        </Badge>
        {q.subType && SUBTYPE_LABELS[q.subType] && (
          <Badge variant="outline" className="text-[10px] bg-slate-50">
            {SUBTYPE_LABELS[q.subType]}
          </Badge>
        )}
        {diffConfig && (
          <Badge
            variant="outline"
            className={cn("text-[10px]", diffConfig.className)}
          >
            {diffConfig.label}
          </Badge>
        )}
        {/* 26-08-18 난이도 기반 티어: 난이도 뱃지가 같은 티어를 말하면 이중 표기라 숨김. */}
        {generationPlan &&
          !(diffConfig && planForDifficulty(q.difficulty) === generationPlan) &&
          (generationPlan === "PREMIUM" || FEATURE_FLAGS.SHOW_MODEL_SELECTOR) && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-[10px] font-bold",
              generationPlan === "PREMIUM"
                ? "border-violet-200 bg-violet-50 text-violet-700"
                : "border-sky-200 bg-sky-50 text-sky-700",
            )}
          >
            {generationPlan === "PREMIUM" ? (
              <Gem className="w-3 h-3" />
            ) : (
              <PearlIcon className="w-3 h-3" />
            )}
            {QUESTION_GENERATION_PLANS[generationPlan].shortLabel}
          </Badge>
        )}
        {q.aiGenerated && (
          <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        )}
        {q.approved ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
        )}
        {q.starred && (
          <Star className="w-3.5 h-3.5 fill-blue-400 text-blue-400 shrink-0" />
        )}
        <div className="ml-auto">
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            title={expanded ? "문제 내용 접기" : "문제 전체 내용 펼치기"}
            className={cn(
              "group/expand h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-colors border",
              expanded
                ? "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                : "text-blue-600 bg-blue-50/70 border-blue-200 hover:bg-blue-100 hover:text-blue-700",
            )}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover/expand:translate-y-0.5" />
                펼치기
              </>
            )}
          </button>
        </div>
      </div>

      {/* Question text */}
      <div
        className={cn(
          "text-[13px] text-slate-700 leading-relaxed whitespace-pre-line",
          !expanded && "line-clamp-3",
        )}
      >
        {q.questionText}
      </div>

      {/* Options (expanded) */}
      {expanded && options.length > 0 && (
        <div className="space-y-1 mt-3 pl-1">
          {options.map((opt) => {
            const isCorrect = opt.label === q.correctAnswer;
            return (
              <div
                key={opt.label}
                className={cn(
                  "flex items-start gap-2 text-[12px] rounded px-2 py-1",
                  isCorrect
                    ? "bg-emerald-50 text-emerald-800 font-medium"
                    : "text-slate-600",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                    isCorrect
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-500",
                  )}
                >
                  {opt.label}
                </span>
                <span className="pt-0.5">{opt.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-MC correct answer (expanded) */}
      {expanded && options.length === 0 && q.correctAnswer && (
        <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded mt-3">
          <span className="font-medium">정답:</span> {q.correctAnswer}
        </div>
      )}

      {/* Explanation toggle */}
      {q.explanation?.content && expanded && (
        <div className="mt-3">
          <button
            onClick={() => setExplanationOpen(!explanationOpen)}
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            {explanationOpen ? "해설 접기" : "해설 보기"}
            {explanationOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {explanationOpen && (
            <div className="bg-blue-50/50 rounded-lg p-2.5 mt-1.5 border border-blue-100">
              <p className="text-[10px] font-semibold text-blue-600 mb-1">
                해설
              </p>
              <p className="text-[12px] text-slate-700 leading-relaxed">
                {q.explanation.content}
              </p>
              {q.explanation.keyPoints &&
                (() => {
                  const kps = parseJSON<string[]>(q.explanation.keyPoints, []);
                  return kps.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-[10px] font-semibold text-blue-600 mb-1">
                        핵심 포인트
                      </p>
                      <ul className="space-y-0.5">
                        {kps.map((kp, i) => (
                          <li
                            key={i}
                            className="text-[11px] text-slate-600 flex gap-1.5"
                          >
                            <span className="text-blue-400 shrink-0">-</span>
                            {kp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}
              {q.explanation.wrongOptionExplanations &&
                (() => {
                  const woe = parseJSON<Record<string, string>>(
                    q.explanation.wrongOptionExplanations,
                    {},
                  );
                  const entries = Object.entries(woe);
                  return entries.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-[10px] font-semibold text-blue-600 mb-1">
                        오답 해설
                      </p>
                      <div className="space-y-0.5">
                        {entries.map(([label, text]) => (
                          <p key={label} className="text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-500">
                              {label}.
                            </span>{" "}
                            {text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-2 mt-2 border-t border-slate-100">
        <span>{formatDate(q.createdAt)}</span>
        <span>{q.points}점</span>
        {q._count.examLinks > 0 && (
          <span>시험 {q._count.examLinks}회 사용</span>
        )}
      </div>
    </div>
  );
}
