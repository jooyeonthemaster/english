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

export interface AnalysisPromptConfig {
  customPrompt: string;
  focusAreas: string[];
  targetLevel: string;
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
  hasExistingAnalysis,
  initialConfig,
}: AnalysisPromptPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(
    initialConfig?.customPrompt || ""
  );

  function handleRun() {
    onRunAnalysis({ customPrompt, focusAreas: [], targetLevel: "" });
  }

  // Don't show during initial analysis
  if (!hasExistingAnalysis) return null;

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
                <span className="ml-1.5 text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">5 크레딧</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
