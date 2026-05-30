"use client";

import { useState, useEffect } from "react";
import {
  X,
  FileText,
  Save,
  Loader2,
  Trash2,
  RefreshCw,
  Lightbulb,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  deleteWorkbenchPassage,
  updatePassageAnalysis,
} from "@/actions/workbench";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  AnalysisToneSelector,
  type AnalysisPromptConfig,
} from "./analysis-prompt-panel";
import {
  DEFAULT_ANALYSIS_TONE,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import { InteractivePassageView } from "./interactive-passage-view";
import { PrimeAnalysisView } from "./prime-analysis-view";
import { AnalysisLoadingOverlay } from "./analysis-loading-overlay";
import { GenerationPlanSelector } from "@/components/workbench/generation-plan-selector";
import {
  getVisibleQuestionTags,
  sanitizeAiModelDisclosureText,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

// ─── Types ───────────────────────────────────────────────
interface PassageData {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  source: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: {
    id: string;
    analysisData: string;
    contentHash: string;
    updatedAt: Date;
  } | null;
  notes: Array<{
    id: string;
    noteType: string;
    content: string;
    order: number;
  }>;
  questions: Array<{
    id: string;
    type: string;
    subType: string | null;
    difficulty: string;
    questionText: string;
    options: string | null;
    correctAnswer: string;
    tags: string | null;
    aiGenerated: boolean;
    approved: boolean;
    createdAt: Date;
    explanation: {
      id: string;
      content: string;
      keyPoints: string | null;
      wrongOptionExplanations: string | null;
    } | null;
    _count?: { examLinks: number };
  }>;
}

interface PassageAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  passage: PassageData;
  initialAnalysis: PassageAnalysisData | null;
  initialPromptConfig?: AnalysisPromptConfig;
  onAnalysisUpdate?: (data: PassageAnalysisData) => void;
  onQuestionsUpdate?: (questions: PassageData["questions"]) => void;
  onDelete?: (passageId: string) => void;
}

function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object") return Array.isArray(fallback) && !Array.isArray(str) ? fallback : (str as T);
  if (typeof str !== "string") return fallback;
  try { const parsed = JSON.parse(str); return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed; }
  catch { return fallback; }
}

// ─── Modal Component ─────────────────────────────────────
export function PassageAnalysisModal({
  open,
  onClose,
  passage,
  initialAnalysis,
  initialPromptConfig,
  onAnalysisUpdate,
  onDelete,
}: PassageAnalysisModalProps) {
  const [analysisData, setAnalysisData] = useState<PassageAnalysisData | null>(initialAnalysis);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastPromptConfig, setLastPromptConfig] = useState<AnalysisPromptConfig>(
    initialPromptConfig || {
      customPrompt: "",
      focusAreas: [],
      targetLevel: "",
      generationPlan: "STANDARD",
      analysisTone: DEFAULT_ANALYSIS_TONE,
    }
  );
  const [generationPlan, setGenerationPlan] = useState<QuestionGenerationPlan>(
    lastPromptConfig.generationPlan || "STANDARD"
  );
  const [analysisTone, setAnalysisTone] = useState<AnalysisTone>(
    lastPromptConfig.analysisTone || DEFAULT_ANALYSIS_TONE
  );

  const tags: string[] = getVisibleQuestionTags(
    passage.tags ? safeParseJSON(passage.tags, []) : [],
  );

  // Sync when passage changes
  useEffect(() => {
    setAnalysisData(initialAnalysis);
    setHasUnsavedChanges(false);
    const nextConfig = initialPromptConfig || {
      customPrompt: "",
      focusAreas: [],
      targetLevel: "",
      generationPlan: "STANDARD" as const,
      analysisTone: DEFAULT_ANALYSIS_TONE,
    };
    setLastPromptConfig(nextConfig);
    setGenerationPlan(nextConfig.generationPlan || "STANDARD");
    setAnalysisTone(nextConfig.analysisTone || DEFAULT_ANALYSIS_TONE);
  }, [initialAnalysis, initialPromptConfig, passage.id]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (hasUnsavedChanges) {
          if (confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")) onClose();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hasUnsavedChanges, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  // ─── Analysis ────────────────────────────────────────
  const runAnalysisWithConfig = async (config: AnalysisPromptConfig) => {
    setAnalyzing(true);
    const selectedPlan = config.generationPlan || generationPlan;
    const selectedTone = config.analysisTone || analysisTone;
    setGenerationPlan(selectedPlan);
    setAnalysisTone(selectedTone);
    setLastPromptConfig({
      ...config,
      generationPlan: selectedPlan,
      analysisTone: selectedTone,
    });
    try {
      const hasConfig =
        config.customPrompt ||
        config.focusAreas.length > 0 ||
        config.targetLevel ||
        selectedTone !== DEFAULT_ANALYSIS_TONE;
      let res: Response;
      if (hasConfig) {
        res = await fetch(`/api/ai/passage-analysis/${passage.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customPrompt: config.customPrompt,
            focusAreas: config.focusAreas,
            targetLevel: config.targetLevel,
            generationPlan: selectedPlan,
            analysisTone: selectedTone,
          }),
        });
      } else {
        const params = new URLSearchParams({
          generationPlan: selectedPlan,
          analysisTone: selectedTone,
        });
        res = await fetch(`/api/ai/passage-analysis/${passage.id}?${params}`);
      }
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setAnalysisData(json.data);
        setHasUnsavedChanges(false);
        onAnalysisUpdate?.(json.data);
        toast.success(json.cached ? "캐시된 분석을 불러왔습니다." : "AI 분석이 완료되었습니다.");
      }
    } catch {
      toast.error("분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Save edited analysis ────────────────────────────
  const handleSave = async () => {
    if (!analysisData) return;
    setSaving(true);
    try {
      const result = await updatePassageAnalysis(passage.id, JSON.stringify(analysisData));
      if (result.success) {
        setHasUnsavedChanges(false);
        onAnalysisUpdate?.(analysisData);
        toast.success("분석 데이터가 저장되었습니다.");
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete passage ──────────────────────────────────
  const handleDelete = async () => {
    if (!confirm("이 지문을 삭제하시겠습니까? 관련 문제도 모두 삭제됩니다.")) return;
    setDeleting(true);
    const result = await deleteWorkbenchPassage(passage.id);
    if (result.success) {
      toast.success("지문이 삭제되었습니다.");
      onDelete?.(passage.id);
      onClose();
    } else {
      toast.error(result.error || "삭제 실패");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => {
          if (hasUnsavedChanges) {
            if (confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")) onClose();
          } else {
            onClose();
          }
        }}
      />

      {/* Modal container — full width with padding */}
      <TooltipProvider>
        <div className="relative z-10 w-full max-w-[1440px] mx-4 my-4 bg-[#F8FAFB] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
          {/* Analysis overlay inside modal */}
          {analyzing && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-2xl">
              <AnalysisLoadingOverlay />
            </div>
          )}

          {/* ─── Modal Header ─── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold text-slate-800 truncate">
                  {sanitizeAiModelDisclosureText(passage.title)}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {passage.school && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {passage.school.name}
                    </Badge>
                  )}
                  {passage.grade && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {passage.grade}학년
                    </Badge>
                  )}
                  {passage.semester && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {passage.semester === "FIRST" ? "1학기" : "2학기"}
                    </Badge>
                  )}
                  {passage.unit && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {passage.unit}
                    </Badge>
                  )}
                  {tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px] h-5 text-slate-500">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasUnsavedChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-200 hover:bg-blue-50 h-8 text-xs"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  저장
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 h-8 text-xs font-semibold"
                onClick={() => {
                  window.location.href = `/director/workbench/passages/${passage.id}/reports`;
                }}
              >
                <FileText className="w-3.5 h-3.5 mr-1" />
                A4 학습자료
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-xs"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                삭제
              </Button>
              <button
                onClick={() => {
                  if (hasUnsavedChanges) {
                    if (confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")) onClose();
                  } else {
                    onClose();
                  }
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* ─── Content area — PRIME A4 (있으면) / 기존 5-layer 인터랙티브 (폴백) ─── */}
          <div className="flex-1 min-h-0">
            <PrimeAnalysisView
              passageId={passage.id}
              legacyAnalysisData={analysisData}
              passageContent={passage.content}
            />
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
