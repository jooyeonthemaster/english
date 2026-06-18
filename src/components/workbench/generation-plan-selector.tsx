"use client";

import { Gem } from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import {
  QUESTION_GENERATION_PLANS,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

interface GenerationPlanSelectorProps {
  value: QuestionGenerationPlan;
  onChange: (value: QuestionGenerationPlan) => void;
  className?: string;
  compact?: boolean;
}

export function GenerationPlanSelector({
  value,
  onChange,
  className,
  compact = false,
}: GenerationPlanSelectorProps) {
  if (!FEATURE_FLAGS.SHOW_MODEL_SELECTOR) {
    return null;
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {(["STANDARD", "PREMIUM"] as const).map((planId) => {
        const plan = QUESTION_GENERATION_PLANS[planId];
        const active = value === planId;
        const Icon = planId === "PREMIUM" ? Gem : PearlIcon;

        return (
          <button
            key={planId}
            type="button"
            onClick={() => onChange(planId)}
            className={cn(
              "rounded-xl border text-left transition-all duration-150",
              compact ? "min-h-[54px] p-2.5" : "min-h-[72px] p-3",
              active
                ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm shadow-blue-50"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon
                  className={cn(
                    "shrink-0",
                    compact ? "w-3 h-3" : "w-3.5 h-3.5",
                    active ? "text-blue-600" : "text-slate-400",
                  )}
                />
                <span className="text-[12px] font-bold truncate">
                  {plan.shortLabel}
                </span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold tabular-nums",
                  active ? "text-blue-600" : "text-slate-400",
                )}
              >
                {plan.creditMultiplier}x
              </span>
            </div>
            <p className="mt-1 text-[10px] font-medium leading-snug text-slate-500 truncate">
              {plan.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
