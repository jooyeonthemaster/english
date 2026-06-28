"use client";

import { Gem } from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SaveButton } from "@/components/ui/save-button";
import { StructuredQuestionRenderer } from "../../question-renderers";
import {
  QUESTION_GENERATION_PLANS,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

interface GeneratedResultsProps {
  generatedQuestions: any[] | null;
  generationPlan: QuestionGenerationPlan;
  onSaveQuestions: () => void;
}

export function GeneratedResults({
  generatedQuestions,
  generationPlan,
  onSaveQuestions,
}: GeneratedResultsProps) {
  if (!(generatedQuestions && generatedQuestions.length > 0)) return null;
  const plan = QUESTION_GENERATION_PLANS[generationPlan];
  const PlanIcon = generationPlan === "PREMIUM" ? Gem : PearlIcon;
  return (
    <div className="space-y-4 pt-2">
      <Separator />
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">
          생성된 문제 ({generatedQuestions.length}개)
        </span>
        <SaveButton onClick={onSaveQuestions} title="문제 은행에 저장" />
      </div>

      {/* Group by _typeLabel */}
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
    </div>
  );
}
