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
import {
  readQuestionTypeGenerationPlanSetting,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import type { PassageItem, QueueItem } from "../generate-page-types";
import {
  buildOptimisticItem,
  createFastQuestionGenerationJob,
  replaceQueueItemInPlace,
} from "../use-generation-handlers";
import {
  getReservedVariantTitles,
  nextGenerationRunToken,
  reserveVariantTitle,
  scheduleFastGeneration,
} from "../fast-generation-scheduler";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  QUESTION_SET_SAFETY_MAX_ATTEMPTS,
  resolvePreset,
} from "@/lib/question-sets/presets";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import {
  effectiveRowContent,
  effectiveRowMode,
  overrideHasTypeCounts,
  rowNeedsVariant,
  rowQuestionCount,
  setPresetCountEntries,
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

/**
 * 한 워크스페이스 행이 '지금 설정'으로 만들어낼 문제 수와 크레딧 비용을 계산한다.
 * 집계(summary)와 지문별 카드/모달 표시가 동일 로직을 공유해 숫자가 어긋나지
 * 않도록, 행 단위 계산을 이 순수 함수 하나로 모은다.
 */
function computeRowGenStats(
  row: WorkspaceRow,
  ctx: {
    genMode: "manual" | "set";
    generationPlan: QuestionGenerationPlan;
    questionTypeSettings: QuestionTypeGenerationSettings;
    globalQuestionCount: number;
  },
): { questions: number; creditCost: number } {
  const globalCfg = {
    genMode: ctx.genMode,
    totalQuestions: ctx.globalQuestionCount,
  };
  const questions = rowQuestionCount(row, globalCfg);
  const mode = effectiveRowMode(row.override, ctx.genMode);
  const plan = row.override?.generationPlan ?? ctx.generationPlan;
  // 수동(유형 지정)은 유형마다 플랜이 다를 수 있어, 유형별 배수를 이미 적용한
  // 비용을 따로 누적한다(rowFinal). set 도 멤버별 플랜이 가능해 rowFinal 에 직접 더한다.
  let rowFinal = 0;
  if (mode === "manual") {
    if (overrideHasTypeCounts(row.override)) {
      for (const [typeId, n] of Object.entries(row.override!.typeCounts)) {
        if (n <= 0) continue;
        const unit = VOCAB_GENERATION_TYPE_IDS.has(typeId)
          ? CREDIT_COSTS.QUESTION_GEN_VOCAB
          : CREDIT_COSTS.QUESTION_GEN_SINGLE;
        const typePlan = readQuestionTypeGenerationPlanSetting(
          row.override?.questionTypeSettings?.[typeId] ??
            ctx.questionTypeSettings[typeId],
          plan,
        );
        rowFinal += getQuestionGenerationCreditCost(unit * n, typePlan);
      }
    }
  } else if (mode === "set") {
    for (const [presetId, count] of setPresetCountEntries(row.override)) {
      const preset = resolvePreset(presetId);
      if (!preset) continue;
      const overrides =
        row.override?.setMemberOverridesByPreset?.[presetId] ??
        (presetId === row.override?.setPresetId
          ? row.override?.setMemberOverrides
          : undefined) ??
        [];
      for (let copy = 0; copy < count; copy += 1) {
        for (let index = 0; index < preset.members.length; index += 1) {
          const m = preset.members[index];
          const unit = VOCAB_GENERATION_TYPE_IDS.has(m.typeId)
            ? CREDIT_COSTS.QUESTION_GEN_VOCAB
            : CREDIT_COSTS.QUESTION_GEN_SINGLE;
          const memberPlan =
            overrides[index]?.generationPlan ?? m.generationPlan ?? plan;
          rowFinal +=
            getQuestionGenerationCreditCost(unit, memberPlan) *
            QUESTION_SET_SAFETY_MAX_ATTEMPTS;
        }
      }
    }
  }
  return {
    questions,
    creditCost: rowFinal,
  };
}

interface UseWorkspaceGenerationParams {
  api: WorkspaceRowsApi;
  passages: PassageItem[];
  genMode: "manual" | "set";
  generationPlan: QuestionGenerationPlan;
  typeCounts: Record<string, number>;
  questionTypeSettings: QuestionTypeGenerationSettings;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  customPrompt: string;
  selectedIds?: Set<string>;
  setSelectedIds?: Dispatch<SetStateAction<Set<string>>>;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  loadPassages: () => Promise<void> | void;
  /** 장문 세트는 optimistic 큐를 안 거치므로, 생성 후 결과 목록을 다시 읽는다. */
  loadSavedQuestions?: () => Promise<void> | void;
  /** 지문 세트 생성 완료 시 호출 — 하단 지문 세트 섹션을 자동 갱신하는 신호. */
  onSetCreated?: () => void;
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
  selectedIds,
  setSelectedIds,
  setSessionQueue,
  loadPassages,
  loadSavedQuestions,
  onSetCreated,
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
    genMode === "manual"
      ? Object.values(typeCounts).reduce((a, b) => a + b, 0)
      : 0;

  const globalBaseCredit = useMemo(() => {
    if (genMode !== "manual") return 0;
    return Object.entries(typeCounts).reduce((sum, [typeId, n]) => {
      if (n <= 0) return sum;
      const unit = VOCAB_GENERATION_TYPE_IDS.has(typeId)
        ? CREDIT_COSTS.QUESTION_GEN_VOCAB
        : CREDIT_COSTS.QUESTION_GEN_SINGLE;
      return sum + unit * n;
    }, 0);
  }, [genMode, typeCounts]);

  // 지문별(행별) 생성 통계 — 카드 푸터의 '문제 생성' 버튼과 모달 CTA 가 같은
  // 숫자를 쓰도록 집계와 동일 로직(computeRowGenStats)으로 미리 계산해 맵으로 둔다.
  const rowStats = useMemo(() => {
    const map = new Map<string, { questions: number; creditCost: number }>();
    for (const row of api.rows) {
      map.set(
        row.localId,
        computeRowGenStats(row, {
          genMode,
          generationPlan,
          questionTypeSettings,
          globalQuestionCount,
        }),
      );
    }
    return map;
  }, [
    api.rows,
    genMode,
    generationPlan,
    questionTypeSettings,
    globalQuestionCount,
  ]);

  const summary: WorkspaceGenerationSummary = useMemo(() => {
    let totalQuestions = 0;
    // 크레딧은 행마다 자신의 플랜(일반/프리미엄) 배수를 곱해 합산한다 —
    // 개별 지문이 서로 다른 플랜을 가질 수 있기 때문.
    let creditCost = 0;
    let variantCount = 0;
    for (const row of api.rows) {
      const stats = rowStats.get(row.localId) ?? { questions: 0, creditCost: 0 };
      totalQuestions += stats.questions;
      creditCost += stats.creditCost;
      if (rowNeedsVariant(row)) variantCount += 1;
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
    rowStats,
    genMode,
    globalQuestionCount,
    globalBaseCredit,
    selectedOnlyPassages.length,
    generationPlan,
  ]);

  // targetLocalId 가 주어지면 그 지문 한 개만 생성한다(지문별 '문제 생성' 모달).
  // 없으면 워크스페이스 전체(+ 내 지문에서 체크된 선택-only 지문)를 생성한다.
  const handleWorkspaceGenerate = useCallback(
    async (targetLocalId?: string) => {
    const targetRows = targetLocalId
      ? api.rows.filter((r) => r.localId === targetLocalId)
      : api.rows;
    // 단일 지문 생성 시에는 '내 지문 체크' 선택-only 지문을 끌어오지 않는다.
    const selectedOnlyForRun = targetLocalId ? [] : selectedOnlyPassages;
    if (
      (targetRows.length === 0 && selectedOnlyForRun.length === 0) ||
      generating
    )
      return;
    if (!targetLocalId && genMode === "set") {
      // 장문 세트는 라이브러리 체크 지문 1개로 동작 — 워크스페이스 전체 생성 금지.
      // (지문별 모달에서는 행 override.mode 가 직접 'set' 일 수 있어 막지 않는다.)
      toast.error(
        "장문 세트 모드에서는 워크스페이스 생성을 사용할 수 없습니다. 설정에서 모드를 변경하세요.",
      );
      return;
    }

    const globalCfg = {
      genMode,
      totalQuestions: globalQuestionCount,
    };
    const actionableRows = targetRows.filter(
      (row) => rowQuestionCount(row, globalCfg) > 0,
    );
    const actionableSelectedOnlyPassages =
      !targetLocalId && globalQuestionCount > 0 ? selectedOnlyPassages : [];
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
        const title = nextVariantTitle(
          row.title,
          passages,
          getReservedVariantTitles(),
        );
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
        // 저장이 실제로 성공한 제목만 예약한다(실패 시 고아 예약 방지). 행은 순차
        // 처리되므로 같은 배치의 다음 행도 이 예약을 보고 충돌을 피한다.
        reserveVariantTitle(title);
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
      const runId = nextGenerationRunToken();
      const prompt = customPrompt.trim();
      type FastUnit = {
        passage: PassageItem;
        questionType: string;
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
      // 지문 세트 — 한 잡으로 생성(멤버를 한 번에). 큐엔 세트 1개의 생성중 카드만 뜨고,
      // 완료되면 멤버가 묶인 저장 카드로 합류한다(커스텀 라우트가 inSet=false+setId 로 저장).
      const setJobs: {
        passageId: string;
        title: string;
        presetId: string;
        copyIndex: number;
        difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
        generationPlan: QuestionGenerationPlan;
        memberOverrides?: Array<{
          difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
          generationPlan?: QuestionGenerationPlan;
          typeSettings?: Record<string, unknown>;
        }>;
        localId?: string;
        tempId: string;
        passage: PassageItem;
        config: QueueItem["config"];
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
        // 선택-only 지문(내 지문 체크)은 전체 공통 모드를 따른다. (manual | set)
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
            // 유형별 생성 플랜(일반/프리미엄)을 우선 반영 — 글로벌 셀렉터 제거 후
            // 플랜은 유형별 설정에서만 지정된다. 서버도 questionTypeSettings 의
            // generationPlan 을 effectiveGenerationPlan 으로 해석하므로,
            // 낙관적 카드 뱃지/페이로드를 여기에 일치시킨다.
            const effTypePlan = readQuestionTypeGenerationPlanSetting(
              effSettings,
              effPlan,
            );
            for (let i = 0; i < repeat; i += 1) {
              if (rowLocalId) attemptedLocalIds.add(rowLocalId);
              fastUnits.push({
                passage: passageLike,
                questionType: typeId,
                settings: effSettings,
                difficulty: effDifficulty,
                generationPlan: effTypePlan,
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
                  generationPlan: effTypePlan,
                },
              });
            }
          }
        } else if (effMode === "set" && item.kind === "workspace") {
          // 지문 세트 — 한 잡(커스텀 라우트)으로 생성. 큐엔 세트 1개의 생성중 카드만 뜨고,
          // 완료되면 멤버가 묶인 저장 카드로 합류한다.
          const presetEntries = setPresetCountEntries(item.row.override);
          for (const [presetId, count] of presetEntries) {
            const preset = resolvePreset(presetId);
            if (!preset) continue;
            if (rowLocalId) attemptedLocalIds.add(rowLocalId);
            const setDiff = item.row.override?.difficulty ?? "INTERMEDIATE";
            const typeCounts: Record<string, number> = {};
            for (const m of preset.members) {
              typeCounts[m.typeId] = (typeCounts[m.typeId] ?? 0) + 1;
            }
            const memberOverrides =
              item.row.override?.setMemberOverridesByPreset?.[presetId] ??
              (presetId === item.row.override?.setPresetId
                ? item.row.override?.setMemberOverrides
                : undefined);
            for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
              setJobs.push({
                passageId: item.passageId,
                title: item.title,
                presetId,
                copyIndex,
                difficulty: setDiff,
                generationPlan: effPlan,
                memberOverrides,
                localId: rowLocalId,
                tempId: `set:${item.passageId}:${presetId}:${runId}:${copyIndex}`,
                passage: passageLike,
                config: {
                  typeCounts,
                  questionTypeSettings: {},
                  difficulty: setDiff,
                  prompt,
                  mode: "manual",
                  generationPlan: effPlan,
                },
              });
            }
          }
        }
        // 그 외(유형 지정인데 유형 없음 · 멤버 없는 세트 행) → 생성 제외.
      }

      // ── 3) optimistic 큐 등록 ── (세트는 잡 1개당 카드 1개)
      const batchCreatedAt = new Date().toISOString();
      if (fastUnits.length > 0 || setJobs.length > 0) {
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
          ...setJobs.map((job) =>
            buildOptimisticItem({
              jobId: job.tempId,
              passage: job.passage,
              analysisData: null,
              config: job.config,
              progressKey: "set",
              createdAt: batchCreatedAt,
            }),
          ),
          ...prev,
        ]);
      }
      triggerRefresh();
      window.setTimeout(triggerRefresh, 1_000);
      window.setTimeout(triggerRefresh, 3_000);

      // 선택-only 지문은 이번 배치로 소비됐으니 즉시 선택 해제(다음 배치 오발사 방지).
      if (actionableSelectedOnlyPassages.length > 0) {
        setSelectedIds?.(new Set());
      }

      // ── 4) 실행 (fire-and-forget · 전역 동시성) ──
      // setup 이 끝났으니 실제 생성은 백그라운드로 띄우고, 동기 흐름은 곧장 finally(락
      // 해제)로 빠진다. → 생성이 도는 중에도 새 배치를 바로 시작할 수 있다. 동시에 떠 있는
      // fast 요청 수는 scheduleFastGeneration 이 전역(앱 전체)으로 묶는다.
      void (async () => {
        let success = 0;
        let failed = 0;
        let createdAnySet = false;

        if (fastUnits.length > 0) {
          const results = await Promise.allSettled(
            fastUnits.map((unit) =>
              scheduleFastGeneration(async () => {
                try {
                  const result = await createFastQuestionGenerationJob({
                    passageId: unit.passage.id,
                    mode: "MANUAL",
                    count: 1,
                    questionType: unit.questionType,
                    questionTypeSettings: unit.settings,
                    difficulty: unit.difficulty,
                    customPrompt: prompt || undefined,
                    generationPlan: unit.generationPlan,
                    clientTempId: unit.tempId,
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
              }),
            ),
          );
          success += results.filter((r) => r.status === "fulfilled").length;
          failed += results.filter((r) => r.status === "rejected").length;
        }

        // 지문 세트 — 커스텀 라우트로 한 번에 생성(멤버 inSet=false + setId 저장). 완료되면
        // 생성중 카드(optimistic)를 치우고, 목록을 다시 읽어 묶인 저장 카드로 보여준다.
        for (const job of setJobs) {
          try {
            const res = await fetch("/api/workbench/ai-jobs/question-set", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                passageId: job.passageId,
                presetId: job.presetId,
                difficulty: job.difficulty,
                generationPlan: job.generationPlan,
                customPrompt: prompt || undefined,
                memberOverrides: job.memberOverrides,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || "지문 세트 생성에 실패했습니다.");
            }
            success += Array.isArray(data.questionIds) ? data.questionIds.length : 0;
            createdAnySet = true;
            if (data.status === "DEGRADED") {
              toast.warning(`"${job.title}" 세트가 생성됐지만 검수가 필요합니다.`);
            }
            // 생성중 카드 제거 → 묶인 저장 카드가 대신 보인다.
            setSessionQueue((prev) => prev.filter((q) => q.id !== job.tempId));
          } catch (err) {
            failed += 1;
            if (job.localId) failedLocalIds.add(job.localId);
            const msg = err instanceof Error ? err.message : "세트 생성 실패";
            // 구체적 이유(지문 분량 부족 등)를 토스트로 노출 — 카드 메시지는 일반적이라.
            toast.error(`"${job.title}" ${msg}`);
            setSessionQueue((prev) =>
              prev.map((q) =>
                q.id === job.tempId
                  ? {
                      ...q,
                      status: "error" as const,
                      progress: { set: "error" as const },
                      error: msg,
                    }
                  : q,
              ),
            );
          }
        }

        triggerRefresh();
        // 세트로 묶은 뒤 setId 가 반영된 목록을 다시 읽어 묶음 표시를 갱신한다.
        if (createdAnySet) {
          void loadSavedQuestions?.();
          onSetCreated?.(); // 하단 지문 세트 섹션 자동 갱신 신호
        }
        if (success > 0) {
          dispatchGenerateTourMilestone("question-generation-completed");
          toast.success(`${success}개 문제가 생성됐습니다.`);
        }
        if (failed > 0) {
          toast.error(`${failed}개 문제 생성이 실패했습니다.`);
        }
      })().catch((err) => {
        // 개별 작업 오류는 각 try/catch 에서 이미 처리(큐 상태+토스트)됨. 여기로 오는
        // 건 예기치 못한 상위 오류뿐이라 콘솔에만 남긴다.
        console.error("[workspace-generate] background batch error", err);
      });
    } catch (err) {
      // 변형본 저장/유닛 구성(setup) 단계의 예기치 못한 오류 — 무음 종료 방지.
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
    globalQuestionCount,
    selectedOnlyPassages,
    generating,
    setSelectedIds,
    setSessionQueue,
    loadPassages,
    loadSavedQuestions,
    triggerRefresh,
  ]);

  return {
    generating,
    handleWorkspaceGenerate,
    workspaceSummary: summary,
    rowStats,
  };
}
