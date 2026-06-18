// @ts-nocheck
"use client";

import React from "react";
import { Gem, Loader2, Save } from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { Button } from "@/components/ui/button";
import { StructuredQuestionRenderer } from "../question-renderers";
import { QUESTION_TYPE_GROUPS as EXAM_TYPE_GROUPS } from "@/lib/question-type-ui";
import {
  QUESTION_GENERATION_PLANS,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

interface Props {
  generating: boolean;
  activeTypes: string[];
  typeCounts: Record<string, number>;
  generationProgress: Record<string, "pending" | "done" | "error">;
  generatedQuestions: any[] | null;
  generationPlan: QuestionGenerationPlan;
  onReconfigure: () => void;
  onSave: () => void;
}

export function ResultsStep({
  generating,
  activeTypes,
  typeCounts,
  generationProgress,
  generatedQuestions,
  generationPlan,
  onReconfigure,
  onSave,
}: Props) {
  const plan = QUESTION_GENERATION_PLANS[generationPlan];
  const PlanIcon = generationPlan === "PREMIUM" ? Gem : PearlIcon;

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
          generationPlan === "PREMIUM"
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-sky-200 bg-sky-50 text-sky-700"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <PlanIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-[12px] font-bold">{plan.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold">
          <span>{plan.creditMultiplier}x</span>
        </div>
      </div>

      {/* Progress */}
      {generating && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-500">생성 진행 상황</span>
          <div className="flex flex-wrap gap-2">
            {activeTypes.map((typeId) => {
              const label = EXAM_TYPE_GROUPS.flatMap((g) => g.items).find((i) => i.id === typeId)?.label || typeId;
              const status = generationProgress[typeId];
              return (
                <span
                  key={typeId}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                    status === "done"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : status === "error"
                        ? "bg-red-50 text-red-600 border-red-200"
                        : "bg-blue-50 text-blue-600 border-blue-200 animate-pulse"
                  }`}
                >
                  {label} x{typeCounts[typeId]}
                  {status === "pending" && <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {generatedQuestions && generatedQuestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">
              {generatedQuestions.length}개 문제 생성됨
            </span>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs" onClick={onSave}>
              <Save className="w-3.5 h-3.5 mr-1" />
              문제 은행에 저장
            </Button>
          </div>

          {/* Grouped by type */}
          {(() => {
            const groups: Record<string, any[]> = {};
            generatedQuestions.forEach((q: any) => {
              const label = q._typeLabel || "기타";
              if (!groups[label]) groups[label] = [];
              groups[label].push(q);
            });
            let globalIdx = 0;
            return Object.entries(groups).map(([label, qs]) => (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-slate-700">{label}</span>
                  <span className="text-[10px] text-slate-400">{qs.length}문제</span>
                </div>
                {qs.map((q: any) => {
                  const idx = globalIdx++;
                  return <StructuredQuestionRenderer key={idx} question={q} index={idx} />;
                })}
              </div>
            ));
          })()}

          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={onReconfigure} className="flex-1">
              다시 설정
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onSave}>
              <Save className="w-4 h-4 mr-1.5" />
              문제 은행에 저장
            </Button>
          </div>
        </div>
      )}

      {!generating && generatedQuestions && generatedQuestions.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-400">
          문제 생성에 실패했습니다. 다시 시도해주세요.
        </div>
      )}
    </div>
  );
}
