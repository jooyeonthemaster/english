// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Save, Loader2, FileText, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { toast } from "sonner";

interface QuestionReviewModalProps {
  open: boolean;
  onClose: () => void;
  passageTitle: string;
  passageContent: string;
  passageMeta?: {
    school?: string;
    grade?: number | null;
    semester?: string | null;
    unit?: string | null;
  };
  analysisData?: any;
  questions: any[];
  onSave: (questions: any[]) => Promise<void>;
  onRegenerate?: () => void;
}

export function QuestionReviewModal({
  open,
  onClose,
  passageTitle,
  passageContent,
  passageMeta,
  analysisData,
  questions,
  onSave,
  onRegenerate,
}: QuestionReviewModalProps) {
  const [saving, setSaving] = useState(false);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(questions);
    } finally {
      setSaving(false);
    }
  }, [onSave, questions]);

  if (!open) return null;

  // Group questions by type
  const groups: Record<string, any[]> = {};
  questions.forEach((q: any) => {
    const label = q._typeLabel || "기타";
    if (!groups[label]) groups[label] = [];
    groups[label].push(q);
  });

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-[1400px] mx-4 my-4 bg-[#F8FAFB] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
              <FileText className="w-4.5 h-4.5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-slate-800 truncate">
                문제 검토: {passageTitle}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="secondary" className="text-[10px] h-5 bg-teal-50 text-teal-700 border-teal-200">
                  {questions.length}문제
                </Badge>
                {passageMeta?.school && (
                  <Badge variant="outline" className="text-[10px] h-5">{passageMeta.school}</Badge>
                )}
                {passageMeta?.grade && (
                  <Badge variant="secondary" className="text-[10px] h-5">{passageMeta.grade}학년</Badge>
                )}
                {passageMeta?.semester && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {passageMeta.semester === "FIRST" ? "1학기" : "2학기"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-slate-600"
                onClick={onRegenerate}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                다시 생성
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 text-xs bg-teal-600 hover:bg-teal-700"
              onClick={handleSave}
              disabled={saving || questions.length === 0}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              문제은행에 저장 ({questions.length}개)
            </Button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content: 2-column — passage gets more space */}
        <div className="flex-1 overflow-hidden grid grid-cols-2">
          {/* Left: Passage with analysis highlights */}
          <div className="border-r border-slate-200 bg-white overflow-y-auto">
            <div className="px-6 py-5">
              <InteractivePassageView
                content={passageContent}
                analysisData={analysisData || null}
                layout="vertical"
              />
            </div>
          </div>

          {/* Right: Questions */}
          <div className="overflow-y-auto">
            <div className="px-6 py-5 space-y-6">
              {Object.entries(groups).map(([label, qs]) => (
                <div key={label} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">{label}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                      {qs.length}문제
                    </span>
                  </div>
                  <div className="space-y-3">
                    {qs.map((q: any) => {
                      const idx = globalIdx++;
                      return <StructuredQuestionRenderer key={idx} question={q} index={idx} />;
                    })}
                  </div>
                </div>
              ))}

              {questions.length === 0 && (
                <div className="text-center py-20 text-sm text-slate-400">
                  생성된 문제가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
