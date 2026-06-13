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
import {
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import { useTaskQueue } from "@/components/workbench/task-queue";

function readFastBatchConcurrency(): number {
  const raw = process.env.NEXT_PUBLIC_WORKBENCH_FAST_BATCH_CONCURRENCY;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(5, Math.floor(parsed)));
}

export const FAST_BATCH_CONCURRENCY = readFastBatchConcurrency();

interface UseGenerationHandlersParams {
  passages: PassageItem[];
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  genMode: "auto" | "manual" | "set";
  generationPlan: QuestionGenerationPlan;
  typeCounts: Record<string, number>;
  setTypeCounts: Dispatch<SetStateAction<Record<string, number>>>;
  activeTypes: string[];
  difficulty: string;
  customPrompt: string;
  questionTypeSettings: QuestionTypeGenerationSettings;
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

export async function createQuestionGenerationJob({
  passageId,
  mode,
  count,
  questionType,
  questionTypeSettings,
  difficulty,
  customPrompt,
  generationPlan,
}: {
  passageId: string;
  mode: "AUTO" | "MANUAL";
  count: number;
  questionType?: string;
  questionTypeSettings?: unknown;
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
      questionTypeSettings,
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

export async function createFastQuestionGenerationJob({
  passageId,
  mode,
  count,
  questionType,
  questionTypeSettings,
  difficulty,
  customPrompt,
  generationPlan,
  variantIndex,
  variantCount,
}: {
  passageId: string;
  mode: "AUTO" | "MANUAL";
  count: 1;
  questionType?: string;
  questionTypeSettings?: unknown;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
  /** 같은 유형 N개 병렬 생성 중 몇 번째인지 — 서버 다양성(타깃/정답 위치 분산)용 */
  variantIndex?: number;
  variantCount?: number;
}) {
  const res = await fetch("/api/workbench/ai-jobs/question-generation/fast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      passageId,
      mode,
      count,
      questionType,
      questionTypeSettings,
      difficulty,
      customPrompt,
      generationPlan,
      variantIndex,
      variantCount,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.details || data.error || "Question generation failed.");
  }
  return data as {
    jobId: string;
    status: "COMPLETED";
    questions: any[];
    questionIds?: string[];
    createdAt?: string;
    debugTiming?: Record<string, number>;
  };
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await worker(items[currentIndex]),
        };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    runNext,
  );
  await Promise.all(workers);
  return results;
}

export function buildOptimisticItem({
  jobId,
  passage,
  analysisData,
  config,
  progressKey,
  createdAt,
}: {
  jobId: string;
  passage: PassageItem;
  analysisData: any;
  config: QueueItem["config"];
  progressKey: string;
  createdAt?: string;
}): QueueItem {
  return {
    id: jobId,
    passageId: passage.id,
    passageTitle: passage.title,
    passageContent: passage.content,
    createdAt: createdAt ?? new Date().toISOString(),
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

export function replaceQueueItemInPlace(
  prev: QueueItem[],
  targetIds: string[],
  replacement: QueueItem,
): QueueItem[] {
  const targets = new Set(targetIds);
  const anchor = prev.find((item) => targets.has(item.id));
  const stableReplacement = {
    ...replacement,
    createdAt: anchor?.createdAt ?? replacement.createdAt,
  };

  if (!anchor) {
    return [
      stableReplacement,
      ...prev.filter((item) => !targets.has(item.id)),
    ];
  }

  let inserted = false;
  const next: QueueItem[] = [];
  for (const item of prev) {
    if (targets.has(item.id)) {
      if (!inserted) {
        next.push(stableReplacement);
        inserted = true;
      }
      continue;
    }
    next.push(item);
  }
  return next;
}

interface ManualGenerationUnit {
  passage: PassageItem;
  questionType: string;
  questionTypeSettings?: unknown;
  tempId: string;
  config: QueueItem["config"];
  /** 같은 지문+유형 배치(N개)에서의 인덱스 — 서버 다양성 분산용 */
  variantIndex: number;
  variantCount: number;
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
  setTypeCounts,
  activeTypes,
  difficulty,
  customPrompt,
  questionTypeSettings,
  autoCount,
  selectedPassage,
  analysisData,
  totalQuestions,
  setSessionQueue,
  reviewItem,
  setReviewModalId,
  loadSavedQuestions,
}: UseGenerationHandlersParams) {
  const { triggerRefresh } = useTaskQueue();

  const toStructuredData = useCallback((q: any) => {
    const typeId = q._typeId || q.subType;
    if (!typeId) return undefined;
    return {
      ...q,
      _typeId: typeId,
      _typeLabel: q._typeLabel || typeLabel(typeId),
    };
  }, []);

  const refreshTaskQueueSoon = useCallback(() => {
    triggerRefresh();
    window.setTimeout(triggerRefresh, 750);
    window.setTimeout(triggerRefresh, 2_000);
    window.setTimeout(triggerRefresh, 4_000);
  }, [triggerRefresh]);

  const runManualUnitsWithFastPath = useCallback(
    async (units: ManualGenerationUnit[]) => {
      if (units.length === 0) {
        return { success: 0, failed: 0 };
      }

      const batchCreatedAt = new Date().toISOString();
      setSessionQueue((prev) => [
        ...units.map((unit) =>
          buildOptimisticItem({
            jobId: unit.tempId,
            passage: unit.passage,
            analysisData: null,
            config: unit.config,
            progressKey: unit.questionType,
            createdAt: batchCreatedAt,
          }),
        ),
        ...prev,
      ]);
      refreshTaskQueueSoon();

      const results = await runWithConcurrency(
        units,
        FAST_BATCH_CONCURRENCY,
        async (unit) => {
          try {
            const result = await createFastQuestionGenerationJob({
              passageId: unit.passage.id,
              mode: "MANUAL",
              count: 1,
              questionType: unit.questionType,
              questionTypeSettings: unit.questionTypeSettings,
              difficulty,
              customPrompt: unit.config.prompt || undefined,
              generationPlan,
              variantIndex: unit.variantIndex,
              variantCount: unit.variantCount,
            });
            const doneItem = {
              ...buildOptimisticItem({
                jobId: result.jobId,
                passage: unit.passage,
                analysisData: null,
                config: unit.config,
                progressKey: unit.questionType,
              }),
              createdAt: result.createdAt || new Date().toISOString(),
              status: "done" as const,
              progress: { [unit.questionType]: "done" as const },
              questions: Array.isArray(result.questions) ? result.questions : [],
              questionIds: Array.isArray(result.questionIds) ? result.questionIds : [],
            };
            setSessionQueue((prev) =>
              replaceQueueItemInPlace(prev, [unit.tempId, result.jobId], doneItem),
            );
            return result;
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Question generation failed.";
            setSessionQueue((prev) =>
              prev.map((item) =>
                item.id === unit.tempId
                  ? {
                      ...item,
                      status: "error" as const,
                      progress: { [unit.questionType]: "error" as const },
                      error: message,
                    }
                  : item,
              ),
            );
            throw err;
          }
        },
      );

      return {
        success: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
      };
    },
    [difficulty, generationPlan, refreshTaskQueueSoon, setSessionQueue],
  );

  const enqueueJob = useCallback(
    async ({
      passage,
      mode,
      count,
      questionType,
      questionTypeSettings,
      pAnalysis,
      config,
      progressKey,
    }: {
      passage: PassageItem;
      mode: "AUTO" | "MANUAL";
      count: number;
      questionType?: string;
      questionTypeSettings?: unknown;
      pAnalysis: any;
      config: QueueItem["config"];
      progressKey: string;
    }) => {
      const jobId = await createQuestionGenerationJob({
        passageId: passage.id,
        mode,
        count,
        questionType,
        questionTypeSettings,
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
      refreshTaskQueueSoon();
      return jobId;
    },
    [difficulty, generationPlan, refreshTaskQueueSoon, setSessionQueue],
  );

  const handleBatchGenerate = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const selectedPassages = passages.filter((p) => selectedIds.has(p.id));

    if (genMode === "manual") {
      const units: ManualGenerationUnit[] = [];
      const runId = Date.now();

      for (const p of selectedPassages) {
        for (const typeId of Object.keys(typeCounts).filter((k) => typeCounts[k] > 0)) {
          const repeatCount = Math.max(0, Math.floor(Number(typeCounts[typeId]) || 0));
          for (let index = 0; index < repeatCount; index += 1) {
            units.push({
              passage: p,
              questionType: typeId,
              questionTypeSettings: questionTypeSettings[typeId],
              tempId: `fast:${p.id}:${typeId}:${runId}:${index}`,
              variantIndex: Math.min(index, 99),
              variantCount: Math.min(repeatCount, 99),
              config: {
                typeCounts: { [typeId]: 1 },
                questionTypeSettings: { [typeId]: questionTypeSettings[typeId] },
                difficulty,
                prompt: customPrompt.trim(),
                mode: genMode,
                generationPlan,
              },
            });
          }
        }
      }

      // Generation has started — clear the configured type counts so the
      // panel is a fresh slate for the next batch. `units` already captured
      // the counts, so the in-flight generation is unaffected.
      setTypeCounts({});

      const { success, failed } = await runManualUnitsWithFastPath(units);

      setSelectedIds(new Set());
      triggerRefresh();
      if (success > 0) {
        toast.success(`${success}\uac1c \ubb38\uc81c\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`);
      }
      if (failed > 0) {
        toast.error(`${failed}\uac1c \ubb38\uc81c \uc0dd\uc131\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.`);
      }
      return;
    }

    const canUseFastPath =
      selectedPassages.length > 0 &&
      genMode === "auto" &&
      autoCount === 1;

    if (canUseFastPath) {
      const progressKey = "auto";
      const baseConfig = {
        typeCounts: {},
        questionTypeSettings: {},
        difficulty,
        prompt: customPrompt.trim(),
        mode: genMode,
        generationPlan,
      };
      const optimisticItems = selectedPassages.map((passage, index) => {
        const tempId = `fast:${passage.id}:${Date.now()}:${index}`;
        return {
          tempId,
          passage,
        };
      });
      const batchCreatedAt = new Date().toISOString();

      setSessionQueue((prev) => [
        ...optimisticItems.map(({ tempId, passage }) =>
          buildOptimisticItem({
            jobId: tempId,
            passage,
            analysisData: null,
            config: baseConfig,
            progressKey,
            createdAt: batchCreatedAt,
          }),
        ),
        ...prev,
      ]);
      refreshTaskQueueSoon();

      const results = await runWithConcurrency(
        optimisticItems,
        FAST_BATCH_CONCURRENCY,
        async ({ tempId, passage }) => {
          try {
            const result = await createFastQuestionGenerationJob({
              passageId: passage.id,
              mode: "AUTO",
              count: 1,
              questionType: undefined,
              difficulty,
              customPrompt: baseConfig.prompt || undefined,
              generationPlan,
            });
            const doneItem = {
              ...buildOptimisticItem({
                jobId: result.jobId,
                passage,
                analysisData: null,
                config: baseConfig,
                progressKey,
              }),
              createdAt: result.createdAt || new Date().toISOString(),
              status: "done" as const,
              progress: { [progressKey]: "done" as const },
              questions: Array.isArray(result.questions) ? result.questions : [],
              questionIds: Array.isArray(result.questionIds) ? result.questionIds : [],
            };
            setSessionQueue((prev) =>
              replaceQueueItemInPlace(prev, [tempId, result.jobId], doneItem),
            );
            return result;
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Question generation failed.";
            setSessionQueue((prev) =>
              prev.map((item) =>
                item.id === tempId
                  ? {
                      ...item,
                      status: "error" as const,
                      progress: { [progressKey]: "error" as const },
                      error: message,
                    }
                  : item,
              ),
            );
            throw err;
          }
        },
      );
      const success = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - success;

      setSelectedIds(new Set());
      triggerRefresh();
      if (success > 0) {
        toast.success(`${success}\uac1c \ubb38\uc81c\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`);
      }
      if (failed > 0) {
        toast.error(`${failed}\uac1c \ubb38\uc81c \uc0dd\uc131\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.`);
      }
      return;
    }

    const jobs: Promise<unknown>[] = [];

    for (const p of selectedPassages) {
      const pAnalysis = parsePassageAnalysis(p);
      const baseConfig = {
        typeCounts: {},
        questionTypeSettings: {},
        difficulty,
        prompt: customPrompt.trim(),
        mode: genMode,
        generationPlan,
      };

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
    setTypeCounts,
    questionTypeSettings,
    difficulty,
    customPrompt,
    autoCount,
    activeTypes,
    enqueueJob,
    setSelectedIds,
    setSessionQueue,
    loadSavedQuestions,
    refreshTaskQueueSoon,
    runManualUnitsWithFastPath,
    triggerRefresh,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!selectedPassage) return;
    if (genMode === "manual" && totalQuestions === 0) return;

    const baseConfig = {
      typeCounts: genMode === "manual" ? { ...typeCounts } : {},
      questionTypeSettings: genMode === "manual" ? { ...questionTypeSettings } : {},
      difficulty,
      prompt: customPrompt.trim(),
      mode: genMode,
      generationPlan,
    };

    try {
      if (genMode === "manual") {
        const units: ManualGenerationUnit[] = [];
        const runId = Date.now();

        for (const typeId of activeTypes) {
          const repeatCount = Math.max(0, Math.floor(Number(typeCounts[typeId]) || 0));
          for (let index = 0; index < repeatCount; index += 1) {
            units.push({
              passage: selectedPassage,
              questionType: typeId,
              questionTypeSettings: questionTypeSettings[typeId],
              tempId: `fast:${selectedPassage.id}:${typeId}:${runId}:${index}`,
              variantIndex: Math.min(index, 99),
              variantCount: Math.min(repeatCount, 99),
              config: {
                ...baseConfig,
                typeCounts: { [typeId]: 1 },
                questionTypeSettings: { [typeId]: questionTypeSettings[typeId] },
              },
            });
          }
        }

        const { success, failed } = await runManualUnitsWithFastPath(units);
        triggerRefresh();
        if (success > 0) {
          toast.success(`${success}\uac1c \ubb38\uc81c\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`);
        }
        if (failed > 0) {
          toast.error(`${failed}\uac1c \ubb38\uc81c \uc0dd\uc131\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.`);
        }
        return;
      }

      const canUseFastPath = genMode === "auto" && autoCount === 1;

      if (canUseFastPath) {
        const progressKey = "auto";
        const result = await createFastQuestionGenerationJob({
          passageId: selectedPassage.id,
          mode: "AUTO",
          count: 1,
          questionType: undefined,
          difficulty,
          customPrompt: baseConfig.prompt || undefined,
          generationPlan,
        });
        const doneItem = {
          ...buildOptimisticItem({
            jobId: result.jobId,
            passage: selectedPassage,
            analysisData: null,
            config: baseConfig,
            progressKey,
          }),
          createdAt: result.createdAt || new Date().toISOString(),
          status: "done" as const,
          progress: { [progressKey]: "done" as const },
          questions: Array.isArray(result.questions) ? result.questions : [],
          questionIds: Array.isArray(result.questionIds) ? result.questionIds : [],
        };
        setSessionQueue((prev) => [
          doneItem,
          ...prev.filter((item) => item.id !== result.jobId),
        ]);
        triggerRefresh();
        toast.success("\ubb38\uc81c\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
        return;
      }

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
            questionTypeSettings: questionTypeSettings[typeId],
            pAnalysis: analysisData,
            config: {
              ...baseConfig,
              typeCounts: { [typeId]: typeCounts[typeId] },
              questionTypeSettings: { [typeId]: questionTypeSettings[typeId] },
            },
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
    questionTypeSettings,
    difficulty,
    customPrompt,
    autoCount,
    analysisData,
    enqueueJob,
    setSessionQueue,
    loadSavedQuestions,
    refreshTaskQueueSoon,
    runManualUnitsWithFastPath,
    triggerRefresh,
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
        toast.success("문제관리에 저장되었습니다.");
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
