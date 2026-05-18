"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./constants";

// ---------------------------------------------------------------------------
// 진행 단계 표시 인디케이터
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  step: number;
  setStep: (n: number) => void;
}

export function StepIndicator({ step, setStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2" role="navigation" aria-label="시험 생성 단계">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center gap-2">
          {i > 0 && <div className="w-8 h-px bg-[#E5E8EB]" />}
          <button
            onClick={() => step > s.num && setStep(s.num)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              step === s.num
                ? "bg-[#3182F6] text-white"
                : step > s.num
                  ? "bg-blue-50 text-[#3182F6] cursor-pointer"
                  : "bg-[#F7F8FA] text-[#8B95A1]",
            )}
            disabled={step < s.num}
            aria-current={step === s.num ? "step" : undefined}
          >
            {step > s.num ? (
              <Check className="size-4" />
            ) : (
              <span className="text-xs">{s.num}</span>
            )}
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
