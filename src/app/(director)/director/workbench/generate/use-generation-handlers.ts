"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import {
  type PassageItem,
  type QueueItem,
  typeLabel,
  buildQuestionText,
} from "./generate-page-types";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

interface UseGenerationHandlersParams {
  passages: PassageItem[];
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  genMode: "auto" | "manual";
  generationPlan: QuestionGenerationPlan;
  typeCounts: Record<string, number>;
  activeTypes: string[];
  difficulty: string;
  customPrompt: string;
  autoCount: number;
  selectedPassage: PassageItem | null;
  analysisData: any;
  totalQuestions: number;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  reviewItem: QueueItem | null;
  setReviewModalId: (v: string | null) => void;
  loadSavedQuestions: () => void;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) return rawTags.filter((tag): tag is string => typeof tag === "string");
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return rawTags.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean);
  }
}

async function createQuestionGenerationJob({
  passageId,
  mode,
  count,
  questionType,
  difficulty,
  customPrompt,
  generationPlan,
}: {
  passageId: string;
  mode: "AUTO" | "MANUAL";
  count: number;
  questionType?: string;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
}) {
  const res = await fetch("/api/workbench/ai-jobs/question-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      passageId,
      mode,
      count,
      questionType,
      difficulty,
      customPrompt,
      generationPlan,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || "문제 생성 작업을 시작하지 못했습니다.");
  }
  return data.jobId as string;
}

function buildOptimisticItem({
  jobId,
  passage,
  analysisData,
  config,
  progressKey,
}: {
  jobId: string;
  passage: PassageItem;
  analysisData: any;
  config: QueueItem["config"];
  progressKey: string;
}): QueueItem {
  return {
    id: jobId,
    passageId: passage.id,
    passageTitle: passage.title,
    passageContent: passage.content,
    createdAt: new Date().toISOString(),
    passageMeta: {
      school: passage.school?.name,
      grade: passage.grade,
      semester: passage.semester,
      unit: passage.unit,
    },
    analysisData,
    status: "generating",
    progress: { [progressKey]: "pending" },
    questions: [],
    config,
  };
}

function parsePassageAnalysis(p: PassageItem) {
  if (!p.analysis?.analysisData) return null;
  try {
    return typeof p.analysis.analysisData === "string"
      ? JSON.parse(p.analysis.analysisData)
      : p.analysis.analysisData;
  } catch {
    return null;
  }
}

export function useGenerationHandlers({
  passages,
  selectedIds,
  setSelectedIds,
  genMode,
  generationPlan,
  typeCounts,
  activeTypes,
  difficulty,
  customPrompt,
  autoCount,
  selectedPassage,
  analysisData,
  totalQuestions,
  setSessionQueue,
  reviewItem,
  setReviewModalId,
  loadSavedQuestions,
}: UseGenerationHandlersParams) {
  const toStructuredData = useCallback((q: any) => {
    const typeId = q._typeId || q.subType;
    if (!typeId) return undefined;
    return {
      ...q,
      _typeId: typeId,
      _typeLabel: q._typeLabel || typeLabel(typeId),
    };
  }, []);

  const enqueueJob = useCallback(
    async ({
      passage,
      mode,
      count,
      questionType,
      pAnalysis,
      config,
      progressKey,
    }: {
      passage: PassageItem;
      mode: "AUTO" | "MANUAL";
      count: number;
      questionType?: string;
      pAnalysis: any;
      config: QueueItem["config"];
      progressKey: string;
    }) => {
      const jobId = await createQuestionGenerationJob({
        passageId: passage.id,
        mode,
        count,
        questionType,
        difficulty,
        customPrompt: config.prompt || undefined,
        generationPlan,
      });
      setSessionQueue((prev) => [
        buildOptimisticItem({
          jobId,
          passage,
          analysisData: pAnalysis,
          config,
          progressKey,
        }),
        ...prev,
      ]);
      return jobId;
    },
    [difficulty, generationPlan, setSessionQueue],
  );

  const handleBatchGenerate = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const selectedPassages = passages.filter((p) => selectedIds.has(p.id));
    const jobs: Promise<unknown>[] = [];

    for (const p of selectedPassages) {
      const pAnalysis = parsePassageAnalysis(p);
      const baseConfig = {
        typeCounts: genMode === "manual" ? { ...typeCounts } : {},
        difficulty,
        prompt: customPrompt.trim(),
        mode: genMode,
        generationPlan,
      };

      if (genMode === "auto") {
        jobs.push(
          enqueueJob({
            passage: p,
            mode: "AUTO",
            count: autoCount,
            pAnalysis,
            config: baseConfig,
            progressKey: "auto",
          }),
        );
      } else {
        for (const typeId of Object.keys(typeCounts).filter((k) => typeCounts[k] > 0)) {
          jobs.push(
            enqueueJob({
              passage: p,
              mode: "MANUAL",
              count: typeCounts[typeId],
              questionType: typeId,
              pAnalysis,
              config: { ...baseConfig, typeCounts: { [typeId]: typeCounts[typeId] } },
              progressKey: typeId,
            }),
          );
        }
      }
    }

    const results = await Promise.allSettled(jobs);
    const success = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - success;

    setSelectedIds(new Set());
    if (success > 0) toast.info(`${success}개 문제 생성 작업을 시작했습니다.`);
    if (failed > 0) toast.error(`${failed}개 문제 생성 작업 시작 실패`);
  }, [
    selectedIds,
    passages,
    genMode,
    generationPlan,
    typeCounts,
    difficulty,
    customPrompt,
    autoCount,
    enqueueJob,
    setSelectedIds,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!selectedPassage) return;
    if (genMode === "manual" && totalQuestions === 0) return;

    const baseConfig = {
      typeCounts: genMode === "manual" ? { ...typeCounts } : {},
      difficulty,
      prompt: customPrompt.trim(),
      mode: genMode,
      generationPlan,
    };

    try {
      if (genMode === "auto") {
        await enqueueJob({
          passage: selectedPassage,
          mode: "AUTO",
          count: autoCount,
          pAnalysis: analysisData,
          config: baseConfig,
          progressKey: "auto",
        });
        toast.info("문제 생성 작업을 시작했습니다.");
      } else {
        const jobs = activeTypes.map((typeId) =>
          enqueueJob({
            passage: selectedPassage,
            mode: "MANUAL",
            count: typeCounts[typeId],
            questionType: typeId,
            pAnalysis: analysisData,
            config: { ...baseConfig, typeCounts: { [typeId]: typeCounts[typeId] } },
            progressKey: typeId,
          }),
        );
        await Promise.all(jobs);
        toast.info(`${jobs.length}개 문제 생성 작업을 시작했습니다.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "문제 생성 작업 시작 실패");
    }
  }, [
    selectedPassage,
    genMode,
    generationPlan,
    totalQuestions,
    activeTypes,
    typeCounts,
    difficulty,
    customPrompt,
    autoCount,
    analysisData,
    enqueueJob,
  ]);

  const handleSaveQuestions = useCallback(async (questions: any[]) => {
    if (!reviewItem) return;
    try {
      const { saveGeneratedQuestions } = await import("@/actions/workbench");
      const questionsToSave = questions.map((q: any) => {
        const plan = normalizeQuestionGenerationPlan(q?._generationPlan ?? reviewItem.config.generationPlan ?? generationPlan);
        const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q?.tags), plan);
        const enriched = { ...q, _generationPlan: plan, tags };
        return {
          passageId: reviewItem.passageId,
          type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
          subType: q._typeId || q.subType || null,
          questionText: buildQuestionText(q),
          structuredData: toStructuredData(enriched),
          options: Array.isArray(q.options) ? q.options : undefined,
          correctAnswer: q.correctAnswer || q.modelAnswer || "",
          points: 1,
          difficulty: q.difficulty || "INTERMEDIATE",
          tags,
          aiGenerated: true,
          explanation: typeof q.explanation === "string" ? q.explanation : undefined,
          keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints : undefined,
          wrongOptionExplanations:
            q.wrongOptionExplanations &&
            typeof q.wrongOptionExplanations === "object" &&
            !Array.isArray(q.wrongOptionExplanations)
              ? q.wrongOptionExplanations
              : undefined,
        };
      });

      const result = await saveGeneratedQuestions(questionsToSave);
      if (result.success) {
        toast.success("문제은행에 저장되었습니다.");
        setSessionQueue((prev) =>
          prev.map((item) => item.id === reviewItem.id ? { ...item, status: "reviewed" } : item)
        );
        setReviewModalId(null);
        loadSavedQuestions();
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  }, [generationPlan, reviewItem, toStructuredData, setSessionQueue, setReviewModalId, loadSavedQuestions]);

  return { handleBatchGenerate, handleGenerate, handleSaveQuestions };
}
