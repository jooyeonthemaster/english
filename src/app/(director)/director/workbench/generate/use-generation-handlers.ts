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
import { type QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  nextGenerationRunToken,
  scheduleFastGeneration,
} from "./fast-generation-scheduler";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import { resolveSelectionToPassageIds } from "@/lib/extraction/resolve-draft-selection";

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
  genMode: "manual" | "set";
  generationPlan: QuestionGenerationPlan;
  typeCounts: Record<string, number>;
  setTypeCounts: Dispatch<SetStateAction<Record<string, number>>>;
  activeTypes: string[];
  difficulty: string;
  customPrompt: string;
  questionTypeSettings: QuestionTypeGenerationSettings;
  selectedPassage: PassageItem | null;
  analysisData: any;
  totalQuestions: number;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  reviewItem: QueueItem | null;
  setReviewModalId: (v: string | null) => void;
  loadSavedQuestions: () => void;
  onGenerationCompleted?: () => void;
  /** 검수 전 자료를 승격해 생성한 직후 '내 지문' 목록을 새로고침(선택). */
  loadPassages?: () => Promise<void> | void;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags))
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
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
  mode: "MANUAL";
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
  clientTempId,
}: {
  passageId: string;
  mode: "MANUAL";
  count: 1;
  questionType?: string;
  questionTypeSettings?: unknown;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
  /** 같은 유형 N개 병렬 생성 중 몇 번째인지 — 서버 다양성(타깃/정답 위치 분산)용 */
  variantIndex?: number;
  variantCount?: number;
  /** 낙관적 temp 의 id — 서버 config 에 저장됐다 DB 폴링 때 되읽어 temp↔DB 1:1 매칭. */
  clientTempId?: string;
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
      clientTempId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(
      data.details || data.error || "Question generation failed.",
    );
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
    return [stableReplacement, ...prev.filter((item) => !targets.has(item.id))];
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
  selectedPassage,
  analysisData,
  totalQuestions,
  setSessionQueue,
  reviewItem,
  setReviewModalId,
  loadSavedQuestions,
  onGenerationCompleted,
  loadPassages,
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

      const results = await Promise.allSettled(
        units.map((unit) =>
          scheduleFastGeneration(async () => {
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
                clientTempId: unit.tempId,
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
                questions: Array.isArray(result.questions)
                  ? result.questions
                  : [],
                questionIds: Array.isArray(result.questionIds)
                  ? result.questionIds
                  : [],
              };
              setSessionQueue((prev) =>
                replaceQueueItemInPlace(
                  prev,
                  [unit.tempId, result.jobId],
                  doneItem,
                ),
              );
              return result;
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Question generation failed.";
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
          }),
        ),
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
      mode: "MANUAL";
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
    let selectedPassages = passages.filter((p) => selectedIds.has(p.id));

    // 검수 전 자료(미승격 draft)는 실제 지문으로 승격한 뒤 생성한다.
    if (selectedPassages.some((p) => isDraftPseudoId(p.id))) {
      const { resolvedById, failedCount } = await resolveSelectionToPassageIds(
        selectedPassages.map((p) => p.id),
      );
      selectedPassages = selectedPassages
        .map((p) => {
          const realId = resolvedById[p.id];
          if (!realId) return null;
          return isDraftPseudoId(p.id)
            ? { ...p, id: realId, source: null, extractionReviewDraft: null }
            : p;
        })
        .filter(Boolean) as PassageItem[];
      if (failedCount > 0) {
        toast.warning(`${failedCount}개 자료는 지문으로 준비하지 못해 제외했어요.`);
      }
      if (selectedPassages.length === 0) return;
      void loadPassages?.();
    }

    if (genMode === "manual") {
      const units: ManualGenerationUnit[] = [];
      const runId = nextGenerationRunToken();

      for (const p of selectedPassages) {
        for (const typeId of Object.keys(typeCounts).filter(
          (k) => typeCounts[k] > 0,
        )) {
          const repeatCount = Math.max(
            0,
            Math.floor(Number(typeCounts[typeId]) || 0),
          );
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
                questionTypeSettings: {
                  [typeId]: questionTypeSettings[typeId],
                },
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
      if (success > 0) onGenerationCompleted?.();
      if (success > 0) {
        toast.success(
          `${success}\uac1c \ubb38\uc81c\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`,
        );
      }
      if (failed > 0) {
        toast.error(
          `${failed}\uac1c \ubb38\uc81c \uc0dd\uc131\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.`,
        );
      }
      return;
    }

    // 자동 생성 모드 제거 — 라이브러리 직접 선택 배치 생성은 '유형 지정'만
    // 지원한다. ('set'/장문 세트는 워크스페이스 흐름에서만 동작.)
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
    activeTypes,
    enqueueJob,
    setSelectedIds,
    setSessionQueue,
    loadSavedQuestions,
    loadPassages,
    refreshTaskQueueSoon,
    runManualUnitsWithFastPath,
    triggerRefresh,
    onGenerationCompleted,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!selectedPassage) return;
    if (genMode === "manual" && totalQuestions === 0) return;

    const baseConfig = {
      typeCounts: genMode === "manual" ? { ...typeCounts } : {},
      questionTypeSettings:
        genMode === "manual" ? { ...questionTypeSettings } : {},
      difficulty,
      prompt: customPrompt.trim(),
      mode: genMode,
      generationPlan,
    };

    try {
      if (genMode === "manual") {
        const units: ManualGenerationUnit[] = [];
        const runId = nextGenerationRunToken();

        for (const typeId of activeTypes) {
          const repeatCount = Math.max(
            0,
            Math.floor(Number(typeCounts[typeId]) || 0),
          );
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
                questionTypeSettings: {
                  [typeId]: questionTypeSettings[typeId],
                },
              },
            });
          }
        }

        const { success, failed } = await runManualUnitsWithFastPath(units);
        triggerRefresh();
        if (success > 0) {
          toast.success(
            `${success}\uac1c \ubb38\uc81c\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`,
          );
        }
        if (failed > 0) {
          toast.error(
            `${failed}\uac1c \ubb38\uc81c \uc0dd\uc131\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.`,
          );
        }
        return;
      }

      // 자동 생성 모드 제거 — 단일 지문 생성은 '유형 지정'만 지원한다.
      // 위 manual 분기에서 처리되며, 그 외 모드(set)는 워크스페이스 흐름 전용.
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "문제 생성 작업 시작 실패",
      );
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
    analysisData,
    enqueueJob,
    setSessionQueue,
    loadSavedQuestions,
    refreshTaskQueueSoon,
    runManualUnitsWithFastPath,
    triggerRefresh,
    onGenerationCompleted,
  ]);

  const handleSaveQuestions = useCallback(
    async (questions: any[]) => {
      if (!reviewItem) return;
      try {
        const { saveGeneratedQuestions } = await import("@/actions/workbench");
        const questionsToSave = questions.map((q: any) => {
          const plan = normalizeQuestionGenerationPlan(
            q?._generationPlan ??
              reviewItem.config.generationPlan ??
              generationPlan,
          );
          const tags = mergeQuestionGenerationPlanTag(
            readQuestionTags(q?.tags),
            plan,
          );
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
            explanation:
              typeof q.explanation === "string" ? q.explanation : undefined,
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
            prev.map((item) =>
              item.id === reviewItem.id
                ? { ...item, status: "reviewed" }
                : item,
            ),
          );
          setReviewModalId(null);
          loadSavedQuestions();
        } else {
          toast.error(result.error || "저장 실패");
        }
      } catch {
        toast.error("저장 중 오류가 발생했습니다.");
      }
    },
    [
      generationPlan,
      reviewItem,
      toStructuredData,
      setSessionQueue,
      setReviewModalId,
      loadSavedQuestions,
    ],
  );

  // ── 실패한 생성 다시 시도 — 그 카드에 저장된 config(같은 조건)로 재실행 ──
  // 현재 패널 설정이 아니라 item.config 의 난이도·플랜·유형·프롬프트를 그대로 쓴다.
  const retryGeneration = useCallback(
    async (item: QueueItem) => {
      const config = item.config;
      const passage: PassageItem =
        passages.find((p) => p.id === item.passageId) ??
        ({
          id: item.passageId,
          title: item.passageTitle,
          content: item.passageContent,
          school: item.passageMeta?.school
            ? { name: item.passageMeta.school }
            : undefined,
          grade: item.passageMeta?.grade ?? null,
          semester: item.passageMeta?.semester ?? null,
          unit: item.passageMeta?.unit ?? null,
        } as unknown as PassageItem);

      const typeId = Object.keys(config.typeCounts).find(
        (t) => Number(config.typeCounts[t]) > 0,
      );
      // 자동 생성 제거 — 재시도는 항상 '유형 지정'(MANUAL) 으로 동작한다.
      const progressKey = typeId ?? "manual";
      const plan = config.generationPlan ?? generationPlan;

      // 실패 카드를 그 자리에서 '생성 중'으로 되돌린다(같은 id 유지).
      setSessionQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? buildOptimisticItem({
                jobId: item.id,
                passage,
                analysisData: item.analysisData,
                config,
                progressKey,
                createdAt: item.createdAt,
              })
            : q,
        ),
      );

      try {
        const result = await createFastQuestionGenerationJob({
          passageId: passage.id,
          mode: "MANUAL",
          count: 1,
          questionType: typeId,
          questionTypeSettings: typeId
            ? (config.questionTypeSettings as
                | Record<string, unknown>
                | undefined)?.[typeId]
            : undefined,
          difficulty: config.difficulty,
          customPrompt: config.prompt?.trim() || undefined,
          generationPlan: plan,
          clientTempId: item.id,
        });
        const doneItem: QueueItem = {
          ...buildOptimisticItem({
            jobId: result.jobId,
            passage,
            analysisData: item.analysisData,
            config,
            progressKey,
          }),
          createdAt: result.createdAt || new Date().toISOString(),
          status: "done",
          progress: { [progressKey]: "done" },
          questions: Array.isArray(result.questions) ? result.questions : [],
          questionIds: Array.isArray(result.questionIds)
            ? result.questionIds
            : [],
        };
        setSessionQueue((prev) =>
          replaceQueueItemInPlace(prev, [item.id, result.jobId], doneItem),
        );
        triggerRefresh();
        onGenerationCompleted?.();
        toast.success("다시 생성했습니다.");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Question generation failed.";
        setSessionQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "error",
                  progress: { [progressKey]: "error" },
                  error: message,
                }
              : q,
          ),
        );
        toast.error("다시 생성에 실패했습니다.");
      }
    },
    [
      passages,
      generationPlan,
      setSessionQueue,
      triggerRefresh,
      onGenerationCompleted,
    ],
  );

  return {
    handleBatchGenerate,
    handleGenerate,
    handleSaveQuestions,
    retryGeneration,
  };
}
