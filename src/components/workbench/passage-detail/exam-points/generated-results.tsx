"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StructuredQuestionRenderer } from "../../question-renderers";

interface GeneratedResultsProps {
  generatedQuestions: any[] | null;
  onSaveQuestions: () => void;
}

export function GeneratedResults({ generatedQuestions, onSaveQuestions }: GeneratedResultsProps) {
  if (!(generatedQuestions && generatedQuestions.length > 0)) return null;
  return (
    <div className="space-y-4 pt-2">
      <Separator />
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">
          생성된 문제 ({generatedQuestions.length}개)
        </span>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs"
          onClick={onSaveQuestions}
        >
          <Save className="w-3.5 h-3.5 mr-1" />
          문제 은행에 저장
        </Button>
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
