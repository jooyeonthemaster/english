"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GenerationPlanSelector } from "@/components/workbench/generation-plan-selector";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  ANALYSIS_TONE_OPTIONS,
  DEFAULT_ANALYSIS_TONE,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";

export interface AnalysisPromptConfig {
  customPrompt: string;
  focusAreas: string[];
  targetLevel: string;
  generationPlan?: QuestionGenerationPlan;
  analysisTone?: AnalysisTone;
}

interface AnalysisPromptPanelProps {
  onRunAnalysis: (config: AnalysisPromptConfig) => void;
  analyzing: boolean;
  hasExistingAnalysis: boolean;
  initialConfig?: AnalysisPromptConfig;
}

export function AnalysisPromptPanel({
  onRunAnalysis,
  analyzing,
  initialConfig,
}: AnalysisPromptPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(
    initialConfig?.customPrompt || ""
  );
  const [generationPlan, setGenerationPlan] = useState<QuestionGenerationPlan>(
    initialConfig?.generationPlan || "STANDARD"
  );
  const [analysisTone, setAnalysisTone] = useState<AnalysisTone>(
    initialConfig?.analysisTone || DEFAULT_ANALYSIS_TONE
  );

  function handleRun() {
    onRunAnalysis({
      customPrompt,
      focusAreas: [],
      targetLevel: "",
      generationPlan,
      analysisTone,
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[13px] font-semibold text-slate-700">
          재분석
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-3">
          <GenerationPlanSelector
            value={generationPlan}
            onChange={setGenerationPlan}
            compact
          />
          <AnalysisToneSelector
            value={analysisTone}
            onChange={setAnalysisTone}
          />
          <div>
            <Label className="text-[12px] text-slate-500 mb-1.5 block">
              추가 지시사항
            </Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="예: 관계대명사 who/which 구분 위주, to부정사 용법 집중..."
              className="min-h-[80px] text-[13px] leading-relaxed border-slate-200 placeholder:text-slate-300 resize-none"
            />
          </div>

          <Button
            onClick={handleRun}
            disabled={analyzing}
            variant="outline"
            className="w-full"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-1.5" />
                다시 분석하기
                <CreditCostChip
                  amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
                  className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600"
                />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function AnalysisToneSelector({
  value,
  onChange,
  compact = false,
  className = "",
}: {
  value: AnalysisTone;
  onChange: (value: AnalysisTone) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[12px] text-slate-500 mb-1.5 block">
        분석 말투
      </Label>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {ANALYSIS_TONE_OPTIONS.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              title={option.description}
              className={`rounded-lg px-2 py-2 text-[12px] font-semibold transition-colors ${
                active
                  ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-100"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-700"
              } ${compact ? "h-9" : "min-h-9"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
