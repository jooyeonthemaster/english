// @ts-nocheck
"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  circleGrammarLabelMentions,
  grammarMarkerDisplayLabel,
} from "@/components/exams/paper-builder/option-display";
import { parseJSON } from "../shared/helpers";

interface Explanation {
  id: string;
  content: string;
  keyPoints: string | null;
  wrongOptionExplanations: string | null;
}

export function ExplanationSection({
  explanation,
  subType,
  rightSlot,
}: {
  explanation: Explanation | null;
  // 어법(GRAMMAR_ERROR)만 해설/핵심포인트/오답해설의 "(A)" 라벨을 시험지 표시
  // 규약(원형숫자 ①②③)으로 변환한다 — 데이터는 (A) 유지, 표시 전용.
  // 다른 유형은 무변환(기존과 동일 렌더).
  subType?: string | null;
  // 해설보기와 같은 줄 오른쪽에 둘 추가 액션(예: '상세 보기' 버튼).
  rightSlot?: React.ReactNode;
}) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const isGrammarError = subType === "GRAMMAR_ERROR";
  const displayProse = (text: string) =>
    isGrammarError ? circleGrammarLabelMentions(text) : text;

  const hasExplanation = Boolean(explanation?.content);
  if (!hasExplanation && !rightSlot) return null;

  return (
    <Popover open={explanationOpen} onOpenChange={setExplanationOpen}>
      {/* 행 전체를 앵커로 삼아 팝오버 너비를 카드 가로폭에 맞춘다
          (--radix-popover-trigger-width = 앵커 너비). */}
      <PopoverAnchor asChild>
        <div className="flex items-center justify-between gap-2">
          {/* 해설 보기는 항상 왼쪽 정렬 + 파란색(AnswerRevealSection 과 통일).
              상세 보기(rightSlot)가 있으면 오른쪽에 둔다. */}
          {hasExplanation ? (
            <PopoverTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-500 transition-colors hover:text-blue-700"
              >
                {explanationOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                {explanationOpen ? "해설 접기" : "해설 보기"}
              </button>
            </PopoverTrigger>
          ) : (
            <span aria-hidden="true" />
          )}
          {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
        </div>
      </PopoverAnchor>
      {hasExplanation && (
        <PopoverContent
          align="start"
          onClick={(e) => e.stopPropagation()}
          className="max-h-[60vh] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-2.5"
        >
          <p className="text-[10px] font-semibold text-slate-600 mb-1">해설</p>
          <p className="text-[12px] text-slate-700 leading-relaxed">
            {displayProse(explanation.content)}
          </p>
          {explanation.keyPoints &&
            (() => {
              const kps = parseJSON<string[]>(explanation.keyPoints, []);
              return kps.length > 0 ? (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-[10px] font-semibold text-slate-600 mb-1">
                    핵심 포인트
                  </p>
                  <ul className="space-y-0.5">
                    {kps.map((kp, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-slate-600 flex gap-1.5"
                      >
                        <span className="text-slate-400 shrink-0">•</span>
                        {displayProse(kp)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
          {explanation.wrongOptionExplanations &&
            (() => {
              const woe = parseJSON<Record<string, string>>(
                explanation.wrongOptionExplanations,
                {},
              );
              const entries = Object.entries(woe);
              return entries.length > 0 ? (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-[10px] font-semibold text-slate-600 mb-1">
                    오답 해설
                  </p>
                  <div className="space-y-0.5">
                    {entries.map(([label, text]) => (
                      <p key={label} className="text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-500">
                          {/* 어법: "(A)." → "①" (원형숫자 자체가 라벨이라 마침표 불필요) */}
                          {isGrammarError
                            ? grammarMarkerDisplayLabel(label)
                            : `${label}.`}
                        </span>{" "}
                        {displayProse(text)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
        </PopoverContent>
      )}
    </Popover>
  );
}
