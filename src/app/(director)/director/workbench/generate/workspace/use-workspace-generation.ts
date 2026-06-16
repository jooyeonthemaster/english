"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
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
import { deriveStructuralMode } from "@/lib/question-sets/composition-ui";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import {
  effectiveRowContent,
  effectiveRowMode,
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
    passages
      .filter((p) => p.title.startsWith(`${base} (변형`))
      .map((p) => p.title),
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
  selectedIds?: Set<string>;
  setSelectedIds?: Dispatch<SetStateAction<Set<string>>>;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  loadPassages: () => Promise<void> | void;
  /** 장문 세트는 optimistic 큐를 안 거치므로, 생성 후 결과 목록을 다시 읽는다. */
  loadSavedQuestions?: () => Promise<void> | void;
}

export interface WorkspaceGenerationSummary {
  totalQuestions: number;
  creditCost: number;
  /** 워크스페이스 행 수. */
  rowCount: number;
  /** 워크스페이스에 없는, 내 지문에서 체크만 된 생성 대상 수. */
  selectedOnlyCount: number;
  /** 실제 생성 대상 수 = 워크스페이스 행 + 선택-only 지문. */
  targetCount: number;
  /** 변형본 저장이 필요한 워크스페이스 행 수 (버튼 안내용). */
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
  selectedIds,
  setSelectedIds,
  setSessionQueue,
  loadPassages,
  loadSavedQuestions,
}: UseWorkspaceGenerationParams) {
  const { triggerRefresh } = useTaskQueue();
  const [generating, setGenerating] = useState(false);

  const workspacePassageIdSet = useMemo(() => {
    return new Set(
      api.rows
        .flatMap((row) => [row.passageId, row.variantOfId])
        .filter(Boolean),
    );
  }, [api.rows]);

  const selectedOnlyPassages = useMemo(
    () =>
      passages.filter(
        (passage) =>
          selectedIds?.has(passage.id) &&
          !workspacePassageIdSet.has(passage.id),
      ),
    [passages, selectedIds, workspacePassageIdSet],
  );

  const globalQuestionCount =
    genMode === "auto"
      ? Math.max(0, autoCount)
      : genMode === "manual"
        ? Object.values(typeCounts).reduce((a, b) => a + b, 0)
        : 0;

  const globalBaseCredit = useMemo(() => {
    // 자동 출제는 문제 1개당 단가 — 문제 수(autoCount)만큼.
    if (genMode === "auto")
      return CREDIT_COSTS.AUTO_GEN_BATCH * Math.max(0, autoCount);
    if (genMode !== "manual") return 0;
    return Object.entries(typeCounts).reduce((sum, [typeId, n]) => {
      if (n <= 0) return sum;
      const unit = VOCAB_GENERATION_TYPE_IDS.has(typeId)
        ? CREDIT_COSTS.QUESTION_GEN_VOCAB
        : CREDIT_COSTS.QUESTION_GEN_SINGLE;
      return sum + unit * n;
    }, 0);
  }, [genMode, typeCounts, autoCount]);

  const summary: WorkspaceGenerationSummary = useMemo(() => {
    const globalCfg = {
      genMode,
      autoCount,
      totalQuestions: globalQuestionCount,
    };
    let totalQuestions = 0;
    // 크레딧은 행마다 자신의 플랜(일반/프리미엄) 배수를 곱해 합산한다 —
    // 개별 지문이 서로 다른 플랜을 가질 수 있기 때문.
    let creditCost = 0;
    let variantCount = 0;
    for (const row of api.rows) {
      totalQuestions += rowQuestionCount(row, globalCfg);
      if (rowNeedsVariant(row)) variantCount += 1;
      const mode = effectiveRowMode(row.override, genMode);
      const plan = row.override?.generationPlan ?? generationPlan;
      let rowBase = 0;
      if (mode === "manual") {
        if (overrideHasTypeCounts(row.override)) {
          for (const [typeId, n] of Object.entries(row.override!.typeCounts)) {
            if (n <= 0) continue;
            const unit = VOCAB_GENERATION_TYPE_IDS.has(typeId)
              ? CREDIT_COSTS.QUESTION_GEN_VOCAB
              : CREDIT_COSTS.QUESTION_GEN_SINGLE;
            rowBase += unit * n;
          }
        }
        // 유형 지정인데 유형이 없는 행은 생성에서 빠지므로 크레딧 0.
      } else if (mode === "auto") {
        // 자동 출제는 문제 1개당 단가 — 문제 수(autoCount)만큼.
        rowBase += CREDIT_COSTS.AUTO_GEN_BATCH * Math.max(0, autoCount);
      } else if (mode === "set") {
        // 장문 세트 — 구성한 문항(멤버) 1개당 단가.
        for (const m of row.override?.setMembers ?? []) {
          rowBase += VOCAB_GENERATION_TYPE_IDS.has(m.typeId)
            ? CREDIT_COSTS.QUESTION_GEN_VOCAB
            : CREDIT_COSTS.QUESTION_GEN_SINGLE;
        }
      }
      creditCost += getQuestionGenerationCreditCost(rowBase, plan);
    }
    const actionableSelectedOnlyCount =
      genMode === "set" || globalQuestionCount <= 0
        ? 0
        : selectedOnlyPassages.length;
    totalQuestions += actionableSelectedOnlyCount * globalQuestionCount;
    creditCost += getQuestionGenerationCreditCost(
      actionableSelectedOnlyCount * globalBaseCredit,
      generationPlan,
    );
    return {
      rowCount: api.rows.length,
      selectedOnlyCount: actionableSelectedOnlyCount,
      targetCount: api.rows.length + actionableSelectedOnlyCount,
      totalQuestions,
      creditCost,
      variantCount,
    };
  }, [
    api.rows,
    genMode,
    autoCount,
    globalQuestionCount,
    globalBaseCredit,
    selectedOnlyPassages.length,
    generationPlan,
  ]);

  const handleWorkspaceGenerate = useCallback(async () => {
    if (
      (api.rows.length === 0 && selectedOnlyPassages.length === 0) ||
      generating
    )
      return;
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
      totalQuestions: globalQuestionCount,
    };
    const actionableRows = api.rows.filter(
      (row) => rowQuestionCount(row, globalCfg) > 0,
    );
    const actionableSelectedOnlyPassages =
      globalQuestionCount > 0 ? selectedOnlyPassages : [];
    if (
      actionableRows.length === 0 &&
      actionableSelectedOnlyPassages.length === 0
    ) {
      toast.error("생성할 유형이 없습니다. 유형을 선택해주세요.");
      return;
    }

    setGenerating(true);
    try {
      // ── 1) 변형본 저장 (수정/범위 지정된 행) ──
      // passageOrder 충돌 방지를 위해 순차 실행.
      type ResolvedTarget =
        | {
            kind: "workspace";
            row: WorkspaceRow;
            passageId: string;
            title: string;
            content: string;
          }
        | {
            kind: "library";
            passage: PassageItem;
            passageId: string;
            title: string;
            content: string;
          };
      const resolved: ResolvedTarget[] = [];
      let variantsCreated = 0;

      const { createDirectInputPassageMaterial } =
        await import("@/actions/workbench");
      const usedTitles = new Set<string>();
      for (const row of actionableRows) {
        const content = effectiveRowContent(row);
        if (content.length < 20) {
          toast.error(`"${row.title}" 본문이 너무 짧아 건너뜁니다.`);
          continue;
        }
        if (!rowNeedsVariant(row)) {
          resolved.push({
            kind: "workspace",
            row,
            passageId: row.passageId,
            title: row.title,
            content,
          });
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
              (result && "error" in result && result.error
                ? ` (${result.error})`
                : ""),
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
          kind: "workspace",
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
      for (const passage of actionableSelectedOnlyPassages) {
        const content = passage.content.trim();
        if (content.length < 20) {
          toast.error(`"${passage.title}" 본문이 너무 짧아 건너뜁니다.`);
          continue;
        }
        resolved.push({
          kind: "library",
          passage,
          passageId: passage.id,
          title: passage.title,
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
        /** 워크스페이스 행의 localId — 생성 성공 시 그 행을 비우는 데 쓴다. */
        localId?: string;
      };
      const fastUnits: FastUnit[] = [];
      const slowJobs: {
        passage: PassageItem;
        count: number;
        difficulty: string;
        generationPlan: QuestionGenerationPlan;
        config: QueueItem["config"];
        localId?: string;
      }[] = [];
      // 장문 세트 잡 — 자동/유형지정과 같은 공용 '생성' 흐름에 합류한다.
      const setJobs: {
        passageId: string;
        title: string;
        members: { typeId: string; difficulty: string }[];
        structuralMode: string;
        generationPlan: QuestionGenerationPlan;
        localId?: string;
      }[] = [];
      // 생성을 시도한 워크스페이스 행과, 그중 실패한 행 — 성공 행만 비운다.
      const attemptedLocalIds = new Set<string>();
      const failedLocalIds = new Set<string>();

      for (const item of resolved) {
        const passageLike =
          item.kind === "workspace"
            ? ({
                ...rowAsPassageItem(item.row, passages),
                id: item.passageId,
                title: item.title,
                content: item.content,
              } as PassageItem)
            : ({
                ...item.passage,
                id: item.passageId,
                title: item.title,
                content: item.content,
              } as PassageItem);
        const rowLocalId =
          item.kind === "workspace" ? item.row.localId : undefined;
        const effDifficulty =
          item.kind === "workspace"
            ? (item.row.override?.difficulty ?? difficulty)
            : difficulty;
        // 생성 플랜(일반/프리미엄)도 행 개별 지정을 우선, 없으면 전체 설정.
        const effPlan: QuestionGenerationPlan =
          item.kind === "workspace"
            ? (item.row.override?.generationPlan ?? generationPlan)
            : generationPlan;
        // 이 지문에 적용될 생성 모드 — 워크스페이스 행은 개별 모드(없으면 전체),
        // 선택-only 지문(내 지문 체크)은 전체 공통 모드를 따른다.
        const effMode =
          item.kind === "workspace"
            ? effectiveRowMode(item.row.override, genMode)
            : genMode;

        // 유형 개수: 워크스페이스 행은 개별 유형 지정이 있어야만(폴백 금지),
        // 선택-only 지문은 수동 모드의 전체 설정을 따른다.
        const effTypeCounts =
          effMode === "manual"
            ? item.kind === "workspace"
              ? overrideHasTypeCounts(item.row.override)
                ? item.row.override!.typeCounts
                : null
              : typeCounts
            : null;

        // 유형별 세부옵션도 행 오버라이드를 우선 적용하고, 없으면 전체 설정.
        const rowTypeSettings =
          item.kind === "workspace"
            ? item.row.override?.questionTypeSettings
            : undefined;

        if (effTypeCounts) {
          for (const [typeId, rawCount] of Object.entries(effTypeCounts)) {
            const repeat = Math.max(0, Math.floor(Number(rawCount) || 0));
            const effSettings =
              rowTypeSettings?.[typeId] ?? questionTypeSettings[typeId];
            for (let i = 0; i < repeat; i += 1) {
              if (rowLocalId) attemptedLocalIds.add(rowLocalId);
              fastUnits.push({
                passage: passageLike,
                questionType: typeId,
                settings: effSettings,
                difficulty: effDifficulty,
                generationPlan: effPlan,
                tempId: `fast:${item.passageId}:${typeId}:${runId}:${i}`,
                progressKey: typeId,
                localId: rowLocalId,
                config: {
                  typeCounts: { [typeId]: 1 },
                  questionTypeSettings: {
                    [typeId]: effSettings,
                  },
                  difficulty: effDifficulty,
                  prompt,
                  mode: "manual",
                  generationPlan: effPlan,
                },
              });
            }
          }
        } else if (effMode === "auto") {
          // 자동 생성 — 개별 유형 지정이 없어도 autoCount 만큼.
          if (autoCount === 1) {
            if (rowLocalId) attemptedLocalIds.add(rowLocalId);
            fastUnits.push({
              passage: passageLike,
              questionType: undefined,
              difficulty: effDifficulty,
              generationPlan: effPlan,
              tempId: `fast:${item.passageId}:${runId}:0`,
              progressKey: "auto",
              localId: rowLocalId,
              config: {
                typeCounts: {},
                questionTypeSettings: {},
                difficulty: effDifficulty,
                prompt,
                mode: "auto",
                generationPlan: effPlan,
              },
            });
          } else {
            if (rowLocalId) attemptedLocalIds.add(rowLocalId);
            slowJobs.push({
              passage: passageLike,
              count: autoCount,
              difficulty: effDifficulty,
              generationPlan: effPlan,
              localId: rowLocalId,
              config: {
                typeCounts: {},
                questionTypeSettings: {},
                difficulty: effDifficulty,
                prompt,
                mode: "auto",
                generationPlan: effPlan,
              },
            });
          }
        } else if (effMode === "set" && item.kind === "workspace") {
          // 장문 세트 — 구성한 멤버로 세트를 생성한다(공용 '생성' 흐름).
          const members = item.row.override?.setMembers ?? [];
          if (members.length > 0) {
            if (rowLocalId) attemptedLocalIds.add(rowLocalId);
            setJobs.push({
              passageId: item.passageId,
              title: item.title,
              members,
              structuralMode: deriveStructuralMode(members.map((m) => m.typeId)),
              generationPlan: effPlan,
              localId: rowLocalId,
            });
          }
        }
        // 그 외(유형 지정인데 유형 없음 · 멤버 없는 세트 행) → 생성 제외.
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
                  : "문제 생성에 실패했습니다.";
              if (unit.localId) failedLocalIds.add(unit.localId);
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
            generationPlan: job.generationPlan,
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
          if (job.localId) failedLocalIds.add(job.localId);
          toast.error(
            err instanceof Error ? err.message : "문제 생성 작업 시작 실패",
          );
        }
      }

      // 장문 세트 — 전용 엔드포인트로 생성한다. 생성된 문항은 아래 생성/검수
      // 결과에 그대로 합류한다(triggerRefresh 로 갱신).
      for (const job of setJobs) {
        try {
          const res = await fetch("/api/workbench/ai-jobs/question-set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              passageId: job.passageId,
              structuralMode: job.structuralMode,
              generationPlan: job.generationPlan,
              customPrompt: prompt || undefined,
              members: job.members.map((m) => ({
                typeId: m.typeId,
                difficulty: m.difficulty,
              })),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || "장문 세트 생성에 실패했습니다.");
          }
          if (data.status === "DEGRADED") {
            toast.warning(
              `"${job.title}" 세트가 생성됐지만 검수가 필요합니다.`,
            );
          }
          success += Array.isArray(data.questionIds)
            ? data.questionIds.length
            : job.members.length;
        } catch (err) {
          failed += 1;
          if (job.localId) failedLocalIds.add(job.localId);
          toast.error(
            err instanceof Error
              ? `"${job.title}" ${err.message}`
              : "장문 세트 생성에 실패했습니다.",
          );
        }
      }

      // 생성을 제출한 워크스페이스 행 중 '성공'한 행만 비운다(워크스페이스는
      // 스테이징 영역). 실패한 행은 그대로 남아 같은 조건으로 재시도할 수 있다.
      const succeededLocalIds = [...attemptedLocalIds].filter(
        (id) => !failedLocalIds.has(id),
      );
      if (succeededLocalIds.length > 0) {
        api.removeRows(succeededLocalIds);
      }

      triggerRefresh();
      // 장문 세트 문항은 optimistic 큐에 없으므로 결과 목록을 직접 다시 읽는다.
      if (setJobs.length > 0) {
        void loadSavedQuestions?.();
      }
      if (success > 0) {
        dispatchGenerateTourMilestone("question-generation-completed");
        toast.success(
          slowJobs.length > 0
            ? `${success}개 생성 작업이 시작/완료됐습니다.`
            : `${success}개 문제가 생성됐습니다.`,
        );
      }
      if (failed > 0) {
        toast.error(`${failed}개 문제 생성이 실패했습니다.`);
      }
      if (actionableSelectedOnlyPassages.length > 0) {
        setSelectedIds?.(new Set());
      }
    } catch (err) {
      // 변형본 저장/유닛 구성 단계의 예기치 못한 오류 — 무음 종료 방지.
      toast.error(
        err instanceof Error
          ? err.message
          : "문제 생성 준비 중 오류가 발생했습니다.",
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
    globalQuestionCount,
    selectedOnlyPassages,
    generating,
    setSelectedIds,
    setSessionQueue,
    loadPassages,
    loadSavedQuestions,
    triggerRefresh,
  ]);

  return { generating, handleWorkspaceGenerate, workspaceSummary: summary };
}
