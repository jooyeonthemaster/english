"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import {
  readQuestionTypeDifficultySetting,
  readQuestionTypeGenerationPlanSetting,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import type { PassageItem, QueueItem } from "../generate-page-types";
import {
  FAST_BATCH_CONCURRENCY,
  buildOptimisticItem,
  createFastQuestionGenerationJob,
  createQuestionGenerationJob,
  replaceQueueItemInPlace,
  runWithConcurrency,
} from "../use-generation-handlers";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  effectiveRowContent,
  overrideHasTypeCounts,
  rowNeedsVariant,
  rowQuestionCount,
  type WorkspaceRow,
} from "./workspace-types";
import type { WorkspaceRowsApi } from "./use-workspace-rows";

// ============================================================================
// 워크스페이스 생성 핸들러 — 불러온(편집된) 지문들로 문제 생성.
//
// 1) 본문이 수정/범위 지정된 행은 먼저 "변형본"을 실제 Passage 로 저장한다
//    (문제-지문 연결 정합성: 문제는 항상 자신이 출제된 본문과 연결).
// 2) 행별 유형 오버라이드 → 없으면 우측 전체 설정을 따른다.
// 3) 생성은 기존 fast/slow 경로를 그대로 재사용한다.
// ============================================================================

const VOCAB_GENERATION_TYPE_IDS = new Set([
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);

/**
 * "제목 (변형 2)" 처럼 충돌하지 않는 변형본 제목을 만든다.
 * usedTitles: 이번 실행에서 방금 만든 제목들 — passages 목록이 아직 갱신되기
 * 전이므로 같은 실행 내 중복을 막으려면 별도로 추적해야 한다.
 */
function nextVariantTitle(
  baseTitle: string,
  passages: PassageItem[],
  usedTitles: Set<string>,
): string {
  const base = baseTitle.replace(/\s*\(변형(?:\s*\d+)?\)\s*$/, "").trim();
  const taken = new Set(
    passages.filter((p) => p.title.startsWith(`${base} (변형`)).map((p) => p.title),
  );
  for (const t of usedTitles) {
    if (t.startsWith(`${base} (변형`)) taken.add(t);
  }
  for (let n = 1; n <= taken.size + 1; n += 1) {
    const candidate = n === 1 ? `${base} (변형)` : `${base} (변형 ${n})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base} (변형 ${taken.size + 2})`;
}

/** 워크스페이스 행을 optimistic 큐 아이템용 PassageItem 모양으로. */
function rowAsPassageItem(
  row: WorkspaceRow,
  passages: PassageItem[],
): PassageItem {
  // 변형본 id 는 passages 목록에 아직 없을 수 있으므로 원본으로 폴백.
  const original =
    passages.find((p) => p.id === row.passageId) ??
    passages.find((p) => p.id === row.variantOfId);
  return {
    id: row.passageId,
    title: row.title,
    grade: original?.grade ?? null,
    semester: original?.semester ?? null,
    unit: original?.unit ?? null,
    publisher: original?.publisher ?? null,
    difficulty: original?.difficulty ?? null,
    school: original?.school ?? null,
    content: effectiveRowContent(row),
  } as PassageItem;
}

interface UseWorkspaceGenerationParams {
  api: WorkspaceRowsApi;
  passages: PassageItem[];
  genMode: "auto" | "manual" | "set";
  generationPlan: QuestionGenerationPlan;
  typeCounts: Record<string, number>;
  questionTypeSettings: QuestionTypeGenerationSettings;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  customPrompt: string;
  autoCount: number;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  loadPassages: () => Promise<void> | void;
}

export interface WorkspaceGenerationSummary {
  rowCount: number;
  totalQuestions: number;
  creditCost: number;
  /** 변형본 저장이 필요한 행 수 (버튼 안내용). */
  variantCount: number;
}

export function useWorkspaceGeneration({
  api,
  passages,
  genMode,
  generationPlan,
  typeCounts,
  questionTypeSettings,
  difficulty,
  customPrompt,
  autoCount,
  setSessionQueue,
  loadPassages,
}: UseWorkspaceGenerationParams) {
  const { triggerRefresh } = useTaskQueue();
  const [generating, setGenerating] = useState(false);

  const summary: WorkspaceGenerationSummary = useMemo(() => {
    const globalCfg = { genMode, autoCount, totalQuestions: Object.values(typeCounts).reduce((a, b) => a + b, 0) };
    let totalQuestions = 0;
    let creditCost = 0;
    let variantCount = 0;
    for (const row of api.rows) {
      totalQuestions += rowQuestionCount(row, globalCfg);
      if (rowNeedsVariant(row)) variantCount += 1;
      if (overrideHasTypeCounts(row.override)) {
        for (const [typeId, n] of Object.entries(row.override!.typeCounts)) {
          if (n <= 0) continue;
          const unit = VOCAB_GENERATION_TYPE_IDS.has(typeId)
            ? CREDIT_COSTS.QUESTION_GEN_VOCAB
            : CREDIT_COSTS.QUESTION_GEN_SINGLE;
          creditCost += getQuestionGenerationCreditCost(
            unit * n,
            readQuestionTypeGenerationPlanSetting(
              questionTypeSettings[typeId],
              generationPlan,
            ),
          );
        }
      } else if (genMode === "auto") {
        creditCost += getQuestionGenerationCreditCost(
          CREDIT_COSTS.AUTO_GEN_BATCH,
          generationPlan,
        );
      } else if (genMode === "manual") {
        for (const [typeId, n] of Object.entries(typeCounts)) {
          if (n <= 0) continue;
          const unit = VOCAB_GENERATION_TYPE_IDS.has(typeId)
            ? CREDIT_COSTS.QUESTION_GEN_VOCAB
            : CREDIT_COSTS.QUESTION_GEN_SINGLE;
          creditCost += getQuestionGenerationCreditCost(
            unit * n,
            readQuestionTypeGenerationPlanSetting(
              questionTypeSettings[typeId],
              generationPlan,
            ),
          );
        }
      }
    }
    return {
      rowCount: api.rows.length,
      totalQuestions,
      creditCost,
      variantCount,
    };
  }, [
    api.rows,
    genMode,
    autoCount,
    typeCounts,
    questionTypeSettings,
    generationPlan,
  ]);

  const handleWorkspaceGenerate = useCallback(async () => {
    if (api.rows.length === 0 || generating) return;
    if (genMode === "set") {
      // 장문 세트는 라이브러리 체크 지문 1개로 동작 — 워크스페이스 생성 금지.
      toast.error(
        "장문 세트 모드에서는 워크스페이스 생성을 사용할 수 없습니다. 설정에서 모드를 변경하세요.",
      );
      return;
    }

    const globalCfg = {
      genMode,
      autoCount,
      totalQuestions: Object.values(typeCounts).reduce((a, b) => a + b, 0),
    };
    const actionableRows = api.rows.filter(
      (row) => rowQuestionCount(row, globalCfg) > 0,
    );
    if (actionableRows.length === 0) {
      toast.error("생성할 유형이 없습니다. 유형을 선택해주세요.");
      return;
    }

    setGenerating(true);
    try {
      // ── 1) 변형본 저장 (수정/범위 지정된 행) ──
      // passageOrder 충돌 방지를 위해 순차 실행.
      const resolved: {
        row: WorkspaceRow;
        passageId: string;
        title: string;
        content: string;
      }[] = [];
      let variantsCreated = 0;

      const { createDirectInputPassageMaterial } = await import(
        "@/actions/workbench"
      );
      const usedTitles = new Set<string>();
      for (const row of actionableRows) {
        const content = effectiveRowContent(row);
        if (content.length < 20) {
          toast.error(`"${row.title}" 본문이 너무 짧아 건너뜁니다.`);
          continue;
        }
        if (!rowNeedsVariant(row)) {
          resolved.push({ row, passageId: row.passageId, title: row.title, content });
          continue;
        }
        const title = nextVariantTitle(row.title, passages, usedTitles);
        usedTitles.add(title);
        const result = await createDirectInputPassageMaterial({
          title,
          content,
          // 원본 메타(학교/학년/학기 등) 승계 — 생성 프롬프트 캘리브레이션 유지.
          sourcePassageId: row.variantOfId ?? row.passageId,
        });
        if (!result?.success || !result.id) {
          toast.error(
            `"${row.title}" 변형본 저장에 실패해 건너뜁니다.` +
              (result && "error" in result && result.error ? ` (${result.error})` : ""),
          );
          continue;
        }
        variantsCreated += 1;
        api.rebindToVariant(row.localId, {
          passageId: result.id,
          title,
          content,
          variantOfId: row.variantOfId ?? row.passageId,
        });
        resolved.push({
          row: {
            ...row,
            passageId: result.id,
            title,
            content,
            savedContent: content,
            range: null,
            // rebindToVariant 와 동일하게 — 최초 변형 행도 원본 폴백이 동작.
            variantOfId: row.variantOfId ?? row.passageId,
          },
          passageId: result.id,
          title,
          content,
        });
      }

      if (variantsCreated > 0) {
        toast.success(
          `편집된 ${variantsCreated}개 지문이 변형본으로 저장됐습니다. (내 지문에서 확인)`,
        );
        void loadPassages();
      }
      if (resolved.length === 0) {
        return;
      }

      // ── 2) 생성 유닛 구성 ──
      const runId = Date.now();
      const prompt = customPrompt.trim();
      type FastUnit = {
        passage: PassageItem;
        questionType?: string; // undefined → AUTO
        settings?: unknown;
        difficulty: string;
        generationPlan: QuestionGenerationPlan;
        tempId: string;
        config: QueueItem["config"];
        progressKey: string;
      };
      const fastUnits: FastUnit[] = [];
      const slowJobs: {
        passage: PassageItem;
        count: number;
        difficulty: string;
        config: QueueItem["config"];
      }[] = [];

      for (const item of resolved) {
        const passageLike = {
          ...rowAsPassageItem(item.row, passages),
          id: item.passageId,
          title: item.title,
          content: item.content,
        } as PassageItem;
        const effDifficulty = item.row.override?.difficulty ?? difficulty;
        // 난이도만 지정한 오버라이드는 "전체 설정 유형 + 이 난이도" — 유형이
        // 비어있다고 행을 제외하지 않는다.
        const effTypeCounts = overrideHasTypeCounts(item.row.override)
          ? item.row.override!.typeCounts
          : genMode === "manual"
            ? typeCounts
            : null;

        if (effTypeCounts) {
          for (const [typeId, rawCount] of Object.entries(effTypeCounts)) {
            const repeat = Math.max(0, Math.floor(Number(rawCount) || 0));
            const settingsForType = questionTypeSettings[typeId];
            const unitDifficulty = readQuestionTypeDifficultySetting(
              settingsForType,
              effDifficulty,
            );
            const unitGenerationPlan = readQuestionTypeGenerationPlanSetting(
              settingsForType,
              generationPlan,
            );
            for (let i = 0; i < repeat; i += 1) {
              fastUnits.push({
                passage: passageLike,
                questionType: typeId,
                settings: settingsForType,
                difficulty: unitDifficulty,
                generationPlan: unitGenerationPlan,
                tempId: `fast:${item.passageId}:${typeId}:${runId}:${i}`,
                progressKey: typeId,
                config: {
                  typeCounts: { [typeId]: 1 },
                  questionTypeSettings: { [typeId]: settingsForType },
                  difficulty: unitDifficulty,
                  prompt,
                  mode: "manual",
                  generationPlan: unitGenerationPlan,
                },
              });
            }
          }
        } else if (autoCount === 1) {
          fastUnits.push({
            passage: passageLike,
            questionType: undefined,
            difficulty: effDifficulty,
            generationPlan,
            tempId: `fast:${item.passageId}:${runId}:0`,
            progressKey: "auto",
            config: {
              typeCounts: {},
              questionTypeSettings: {},
              difficulty: effDifficulty,
              prompt,
              mode: "auto",
              generationPlan,
            },
          });
        } else {
          slowJobs.push({
            passage: passageLike,
            count: autoCount,
            difficulty: effDifficulty,
            config: {
              typeCounts: {},
              questionTypeSettings: {},
              difficulty: effDifficulty,
              prompt,
              mode: "auto",
              generationPlan,
            },
          });
        }
      }

      // ── 3) optimistic 큐 등록 ──
      const batchCreatedAt = new Date().toISOString();
      if (fastUnits.length > 0) {
        setSessionQueue((prev) => [
          ...fastUnits.map((unit) =>
            buildOptimisticItem({
              jobId: unit.tempId,
              passage: unit.passage,
              analysisData: null,
              config: unit.config,
              progressKey: unit.progressKey,
              createdAt: batchCreatedAt,
            }),
          ),
          ...prev,
        ]);
      }
      triggerRefresh();
      window.setTimeout(triggerRefresh, 1_000);
      window.setTimeout(triggerRefresh, 3_000);

      // ── 4) 실행 ──
      let success = 0;
      let failed = 0;

      if (fastUnits.length > 0) {
        const results = await runWithConcurrency(
          fastUnits,
          FAST_BATCH_CONCURRENCY,
          async (unit) => {
            try {
              const result = await createFastQuestionGenerationJob({
                passageId: unit.passage.id,
                mode: unit.questionType ? "MANUAL" : "AUTO",
                count: 1,
                questionType: unit.questionType,
                questionTypeSettings: unit.settings,
                difficulty: unit.difficulty,
                customPrompt: prompt || undefined,
                generationPlan: unit.generationPlan,
              });
              const doneItem = {
                ...buildOptimisticItem({
                  jobId: result.jobId,
                  passage: unit.passage,
                  analysisData: null,
                  config: unit.config,
                  progressKey: unit.progressKey,
                }),
                createdAt: result.createdAt || new Date().toISOString(),
                status: "done" as const,
                progress: { [unit.progressKey]: "done" as const },
                questions: Array.isArray(result.questions) ? result.questions : [],
                questionIds: Array.isArray(result.questionIds)
                  ? result.questionIds
                  : [],
              };
              setSessionQueue((prev) =>
                replaceQueueItemInPlace(prev, [unit.tempId, result.jobId], doneItem),
              );
              return result;
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "문제 생성에 실패했습니다.";
              setSessionQueue((prev) =>
                prev.map((q) =>
                  q.id === unit.tempId
                    ? {
                        ...q,
                        status: "error" as const,
                        progress: { [unit.progressKey]: "error" as const },
                        error: message,
                      }
                    : q,
                ),
              );
              throw err;
            }
          },
        );
        success += results.filter((r) => r.status === "fulfilled").length;
        failed += results.filter((r) => r.status === "rejected").length;
      }

      for (const job of slowJobs) {
        try {
          const jobId = await createQuestionGenerationJob({
            passageId: job.passage.id,
            mode: "AUTO",
            count: job.count,
            difficulty: job.difficulty,
            customPrompt: prompt || undefined,
            generationPlan,
          });
          setSessionQueue((prev) => [
            buildOptimisticItem({
              jobId,
              passage: job.passage,
              analysisData: null,
              config: job.config,
              progressKey: "auto",
            }),
            ...prev,
          ]);
          success += 1;
        } catch (err) {
          failed += 1;
          toast.error(
            err instanceof Error ? err.message : "문제 생성 작업 시작 실패",
          );
        }
      }

      triggerRefresh();
      if (success > 0) {
        toast.success(
          slowJobs.length > 0
            ? `${success}개 생성 작업이 시작/완료됐습니다.`
            : `${success}개 문제가 생성됐습니다.`,
        );
      }
      if (failed > 0) {
        toast.error(`${failed}개 문제 생성이 실패했습니다.`);
      }
    } catch (err) {
      // 변형본 저장/유닛 구성 단계의 예기치 못한 오류 — 무음 종료 방지.
      toast.error(
        err instanceof Error ? err.message : "문제 생성 준비 중 오류가 발생했습니다.",
      );
    } finally {
      setGenerating(false);
    }
  }, [
    api,
    passages,
    genMode,
    generationPlan,
    typeCounts,
    questionTypeSettings,
    difficulty,
    customPrompt,
    autoCount,
    generating,
    setSessionQueue,
    loadPassages,
    triggerRefresh,
  ]);

  return { generating, handleWorkspaceGenerate, workspaceSummary: summary };
}
