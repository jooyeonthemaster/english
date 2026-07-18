// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QUESTION_TYPE_GROUPS as EXAM_TYPE_GROUPS } from "@/lib/question-type-ui";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { getCustomPrompts } from "@/actions/custom-prompts";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { buildQuestionText } from "./generate-questions-dialog/build-question-text";
import { ConfigureStep } from "./generate-questions-dialog/configure-step";
import { PassageSelectStep } from "./generate-questions-dialog/passage-select-step";
import { ResultsStep } from "./generate-questions-dialog/results-step";
import type {
  FilterOptions,
  PassageItem,
  SavedPrompt,
} from "./generate-questions-dialog/types";

interface GenerateQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academyId: string;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof rawTags !== "string") return [];
  const trimmed = rawTags.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  } catch {
    // Fall through to comma-separated tag parsing.
  }

  return trimmed
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function GenerateQuestionsDialog({
  open,
  onOpenChange,
  academyId,
}: GenerateQuestionsDialogProps) {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<"select-passage" | "configure" | "results">("select-passage");

  // Passage selection
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ schools: [], grades: [], semesters: [], publishers: [] });
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [loadingPassages, setLoadingPassages] = useState(false);
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(null);

  // Type selection
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [prompt, setPrompt] = useState("");
  const [generationPlan, setGenerationPlan] = useState<QuestionGenerationPlan>("STANDARD");

  // Saved prompts
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  const loadSavedPrompts = async () => {
    const prompts = await getCustomPrompts("QUESTION_GENERATION");
    setSavedPrompts(prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })));
  };

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, "pending" | "done" | "error">>({});
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);

  const totalQuestions = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const activeTypes = Object.keys(typeCounts).filter((k) => typeCounts[k] > 0);

  // Load saved prompts when dialog opens
  useEffect(() => {
    if (open) loadSavedPrompts();
  }, [open]);

  // Load passages
  useEffect(() => {
    if (!open) return;
    setLoadingPassages(true);
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((r) => r.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
      })
      .catch(() => {})
      .finally(() => setLoadingPassages(false));
  }, [open, academyId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("select-passage");
      setSelectedPassage(null);
      setTypeCounts({});
      setPrompt("");
      setGenerationPlan("STANDARD");
      setGeneratedQuestions(null);
      setGenerating(false);
    }
  }, [open]);

  const setTypeCount = (id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!selectedPassage || totalQuestions === 0) return;
    setGenerating(true);
    setGeneratedQuestions(null);
    setStep("results");

    const progress: Record<string, "pending" | "done" | "error"> = {};
    activeTypes.forEach((t) => {
      progress[t] = "pending";
    });
    setGenerationProgress({ ...progress });

    const typeLabel = (id: string) => {
      for (const g of EXAM_TYPE_GROUPS) {
        const found = g.items.find((i) => i.id === id);
        if (found) return found.label;
      }
      return id;
    };

    try {
      const promises = activeTypes.map(async (typeId) => {
        try {
          const res = await fetch("/api/ai/generate-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              passageId: selectedPassage.id,
              questionType: typeId,
              count: typeCounts[typeId],
              difficulty: "INTERMEDIATE",
              customPrompt: prompt.trim() || undefined,
              generationPlan,
            }),
          });
          const data = await res.json();
          setGenerationProgress((prev) => ({ ...prev, [typeId]: data.error ? "error" : "done" }));
          return { typeId, label: typeLabel(typeId), questions: data.questions || [] };
        } catch {
          setGenerationProgress((prev) => ({ ...prev, [typeId]: "error" }));
          return { typeId, label: typeLabel(typeId), questions: [] };
        }
      });

      const results = await Promise.all(promises);
      const allQuestions: any[] = [];
      for (const r of results) {
        for (const q of r.questions) {
          const plan = normalizeQuestionGenerationPlan(q._generationPlan ?? generationPlan);
          const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);
          allQuestions.push({
            ...q,
            _typeId: r.typeId,
            _typeLabel: r.label,
            _generationPlan: plan,
            tags,
          });
        }
      }
      setGeneratedQuestions(allQuestions);
      if (allQuestions.length > 0) toast.success(`${allQuestions.length}개 문제 생성 완료`);
    } catch {
      toast.error("생성 실패");
    } finally {
      setGenerating(false);
      notifyCreditsChanged(); // 차감/실패환급 즉시 사이드바 반영
    }
  };

  const handleSave = async () => {
    if (!generatedQuestions || !selectedPassage) return;
    try {
      const { saveGeneratedQuestions } = await import("@/actions/workbench");

      const questionsToSave = generatedQuestions.map((q: any) => {
        const plan = normalizeQuestionGenerationPlan(q._generationPlan ?? generationPlan);
        const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);
        const structuredData = q._typeId
          ? { ...q, _generationPlan: plan, tags }
          : undefined;

        return {
          passageId: selectedPassage.id,
          type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
          subType: q._typeId || null,
          questionText: buildQuestionText(q),
          structuredData,
          options: Array.isArray(q.options) ? q.options : undefined,
          correctAnswer: q.correctAnswer || q.modelAnswer || "",
          points: 1,
          difficulty: q.difficulty || "INTERMEDIATE",
          tags,
          aiGenerated: true,
          explanation: q.explanation || null,
          keyPoints: q.keyPoints || undefined,
          wrongOptionExplanations: q.wrongOptionExplanations || undefined,
        };
      });

      const result = await saveGeneratedQuestions(questionsToSave);
      if (result.success) {
        toast.success("문제 은행에 저장되었습니다.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[16px] font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              AI 문제 생성
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1 text-[11px]">
              <span className={step === "select-passage" ? "text-blue-600 font-bold" : "text-slate-400"}>
                지문 선택
              </span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={step === "configure" ? "text-blue-600 font-bold" : "text-slate-400"}>
                유형 설정
              </span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={step === "results" ? "text-blue-600 font-bold" : "text-slate-400"}>
                결과
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {step === "select-passage" && (
            <PassageSelectStep
              passages={passages}
              loading={loadingPassages}
              filterOptions={filterOptions}
              passageSearch={passageSearch}
              setPassageSearch={setPassageSearch}
              filterSchool={filterSchool}
              setFilterSchool={setFilterSchool}
              filterGrade={filterGrade}
              setFilterGrade={setFilterGrade}
              filterSemester={filterSemester}
              setFilterSemester={setFilterSemester}
              onSelect={(p) => {
                setSelectedPassage(p);
                setStep("configure");
              }}
            />
          )}

          {step === "configure" && selectedPassage && (
            <ConfigureStep
              selectedPassage={selectedPassage}
              onPickAnotherPassage={() => {
                setStep("select-passage");
                setSelectedPassage(null);
              }}
              typeCounts={typeCounts}
              setTypeCount={setTypeCount}
              setTypeCounts={setTypeCounts}
              totalQuestions={totalQuestions}
              prompt={prompt}
              setPrompt={setPrompt}
              savedPrompts={savedPrompts}
              showSavedPrompts={showSavedPrompts}
              setShowSavedPrompts={setShowSavedPrompts}
              showSaveInput={showSaveInput}
              setShowSaveInput={setShowSaveInput}
              savePromptName={savePromptName}
              setSavePromptName={setSavePromptName}
              savingPrompt={savingPrompt}
              setSavingPrompt={setSavingPrompt}
              loadSavedPrompts={loadSavedPrompts}
              onGenerate={handleGenerate}
            />
          )}

          {step === "results" && (
            <ResultsStep
              generating={generating}
              activeTypes={activeTypes}
              typeCounts={typeCounts}
              generationProgress={generationProgress}
              generatedQuestions={generatedQuestions}
              generationPlan={generationPlan}
              onReconfigure={() => {
                setStep("configure");
                setGeneratedQuestions(null);
              }}
              onSave={handleSave}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
