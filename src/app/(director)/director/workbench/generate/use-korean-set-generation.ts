"use client";

// 국어 세트 생성(KO 전용 라우트) 클러스터 — generate-page-client.tsx 에서 추출.
// 지문별 생성 모달의 KO 세트 모드 판정(과목·갈래)과 CTA 표기(문항 수·크레딧),
// 세트 생성 실행(변형본 저장 → 낙관적 카드 → KO 라우트 순차 호출)을 담당한다.
// 코드는 바이트 동일 이동(무회귀).

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  koKindToTag,
  readKoKindFromTags,
} from "@/lib/korean/core/passage-meta";
import {
  KO_SET_CHARGE_ATTEMPTS,
  resolveKoSetPreset,
  resolveKoSetSlots,
} from "@/lib/korean/sets/presets";
import {
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { useTaskQueue } from "@/components/workbench/task-queue/context";
import {
  type PassageItem,
  type QueueItem,
} from "./generate-page-types";
import { buildOptimisticItem } from "./use-generation-handlers";
import {
  effectiveRowContent,
  rowNeedsVariant,
  type WorkspaceRow,
} from "./workspace/workspace-types";
import { type WorkspaceRowsApi } from "./workspace/use-workspace-rows";

interface UseKoreanSetGenerationParams {
  subjectScope?: "KOREAN";
  activeRow: WorkspaceRow | null;
  editingRow: boolean;
  panelGenMode: "manual" | "set";
  passages: PassageItem[];
  generationPlan: QuestionGenerationPlan;
  customPrompt: string;
  workspaceApi: WorkspaceRowsApi;
  loadPassages: () => Promise<void>;
  loadSavedQuestions: () => Promise<void>;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  taskQueue: ReturnType<typeof useTaskQueue>;
  closeGenModal: () => void;
  setSetRefreshNonce: Dispatch<SetStateAction<number>>;
}

export function useKoreanSetGeneration({
  subjectScope,
  activeRow,
  editingRow,
  panelGenMode,
  passages,
  generationPlan,
  customPrompt,
  workspaceApi,
  loadPassages,
  loadSavedQuestions,
  setSessionQueue,
  taskQueue,
  closeGenModal,
  setSetRefreshNonce,
}: UseKoreanSetGenerationParams) {
  // 지문별 생성 모달에 넘길 지문 과목 — "KOREAN" 이면 패널이 국어 유형 그룹만
  // 연다(영어·null 은 기존 그대로). 변형본 행이라 방금 저장된 passageId 가 아직
  // 목록에 없으면 원본(variantOfId)의 과목으로 폴백한다. 국어 라우트
  // (subjectScope="KOREAN")에서는 지문 lookup 이 실패해도 무조건 KOREAN —
  // 어떤 경우에도 국어 화면에 영어 유형 패널이 열리지 않는다.
  const activeRowSubject = useMemo(() => {
    if (subjectScope === "KOREAN") return "KOREAN";
    if (!activeRow) return null;
    const byId = new Map(passages.map((p) => [p.id, p]));
    return (
      byId.get(activeRow.passageId)?.subject ??
      (activeRow.variantOfId
        ? byId.get(activeRow.variantOfId)?.subject
        : null) ??
      null
    );
  }, [activeRow, passages, subjectScope]);

  // ── 국어 세트 생성 (KO 전용 라우트) ─────────────────────────────────────
  // 국어 지문의 '세트 생성' 모드는 영어 장문 세트 파이프라인을 타지 않고
  // /api/workbench/ai-jobs/korean-question-set 을 직접 호출한다. 큐 UX(낙관적
  // 카드 → 완료 시 카드 제거 + 하단 지문 세트 섹션 갱신)는 영어 세트와 동일.
  const [koSetGenerating, setKoSetGenerating] = useState(false);
  // 편집 중 지문의 유효 본문(범위·수정 반영) — KO 세트 분량 게이트 판정용.
  const activeRowKoContent = activeRow ? effectiveRowContent(activeRow) : "";
  // 지문 갈래(KO_KIND 태그) — 변형본 행이면 원본 태그로 폴백.
  const activeRowKoKind = useMemo(() => {
    if (!activeRow) return null;
    const byId = new Map(passages.map((p) => [p.id, p]));
    const passage =
      byId.get(activeRow.passageId) ??
      (activeRow.variantOfId ? byId.get(activeRow.variantOfId) : undefined);
    return passage ? readKoKindFromTags(passage.tags) : null;
  }, [activeRow, passages]);
  // 이 모달이 KO 세트 생성 모드인지 — 국어 지문 + 개별 모드(set).
  const koSetMode =
    activeRowSubject === "KOREAN" && editingRow && panelGenMode === "set";
  // 모달 푸터 CTA 의 문항 수·크레딧 — 라우트 선차감식(멤버 수 × 단가 ×
  // KO_SET_CHARGE_ATTEMPTS)을 그대로 미러해 표기와 실제 차감이 일치한다.
  const koSetStats = useMemo(() => {
    if (!koSetMode || !activeRow) return { questions: 0, creditCost: 0 };
    const unit = getQuestionGenerationCreditCost(
      CREDIT_COSTS.QUESTION_GEN_SINGLE,
      activeRow.override?.generationPlan ?? generationPlan,
    );
    // 행 오버라이드에서 직접 읽는다 — panelSetPresetCounts 는 렌더마다 새
    // 객체가 될 수 있어(조건식) memo 의존성으로 부적합.
    const presetCounts =
      activeRow.override?.setPresetCounts ??
      (activeRow.override?.setPresetId
        ? { [activeRow.override.setPresetId]: 1 }
        : {});
    let questions = 0;
    let creditCost = 0;
    for (const [presetId, raw] of Object.entries(presetCounts)) {
      const count = Math.max(0, Math.floor(Number(raw) || 0));
      if (count <= 0) continue;
      const preset = resolveKoSetPreset(presetId);
      if (!preset) continue;
      const resolution = resolveKoSetSlots(preset, activeRowKoKind);
      if (!resolution.ok) continue;
      questions += resolution.members.length * count;
      creditCost +=
        resolution.members.length * unit * KO_SET_CHARGE_ATTEMPTS * count;
    }
    return { questions, creditCost };
  }, [koSetMode, activeRow, generationPlan, activeRowKoKind]);

  // KO 세트 생성 실행 — 변형본 저장(필요 시) → 낙관적 카드 → KO 라우트 순차 호출.
  const handleGenerateKoSet = useCallback(async () => {
    const row = activeRow;
    if (!row || koSetGenerating) return;
    // CTA 표기(koSetStats)와 동일한 소스 — setPresetCounts 가 비어 있으면
    // legacy 단일 선택(setPresetId)을 1세트로 간주한다.
    const rawCounts =
      row.override?.setPresetCounts ??
      (row.override?.setPresetId ? { [row.override.setPresetId]: 1 } : {});
    const counts = Object.entries(rawCounts)
      .map(([id, c]) => [id, Math.max(0, Math.floor(Number(c) || 0))] as const)
      .filter(([, c]) => c > 0);
    if (counts.length === 0) {
      toast.error("세트 프리셋을 선택하세요.");
      return;
    }
    setKoSetGenerating(true);
    try {
      const content = effectiveRowContent(row);
      if (content.trim().length < 20) {
        toast.error("본문이 너무 짧아 세트를 생성할 수 없습니다.");
        return;
      }

      // 1) 편집·범위 지정된 행은 먼저 변형본 지문으로 저장한다(문제-지문 연결
      //    정합 — 영어 워크스페이스 생성과 동일 원리, subject 는 원본에서 승계).
      let passageId = row.passageId;
      let title = row.title;
      if (rowNeedsVariant(row)) {
        const base = row.title.replace(/\s*\(변형(?:\s*\d+)?\)\s*$/, "").trim();
        const taken = new Set(
          passages
            .filter((p) => p.title.startsWith(`${base} (변형`))
            .map((p) => p.title),
        );
        let variantTitle = `${base} (변형)`;
        for (let n = 2; taken.has(variantTitle); n += 1) {
          variantTitle = `${base} (변형 ${n})`;
        }
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const saved = await createDirectInputPassageMaterial({
          title: variantTitle,
          content,
          sourcePassageId: row.variantOfId ?? row.passageId,
          // [KOSET-4] 갈래 태그 승계 — 액션의 태그 병합은 data.tags 가 비어 있으면
          // 원본 tags 를 승계하지 않아 변형본이 KO_KIND 태그 없이 저장되고, 서버
          // 라우트가 kind=null 로 슬롯을 해석해 UI 표기(activeRowKoKind 기반)와
          // 어긋난다. UI 가 판정한 갈래를 명시 전달해 원본 tags 승계+갈래 태그를
          // 함께 기록한다(subject 는 액션이 원본에서 KOREAN 을 이미 승계).
          ...(activeRowKoKind ? { tags: [koKindToTag(activeRowKoKind)] } : {}),
          subject: "KOREAN" as const,
        });
        if (!saved?.success || !saved.id) {
          toast.error(
            `"${row.title}" 변형본 저장에 실패해 세트 생성을 중단했습니다.` +
              (saved && "error" in saved && saved.error
                ? ` (${saved.error})`
                : ""),
          );
          return;
        }
        workspaceApi.rebindToVariant(row.localId, {
          passageId: saved.id,
          title: variantTitle,
          content,
          variantOfId: row.variantOfId ?? row.passageId,
        });
        passageId = saved.id;
        title = variantTitle;
        toast.success(
          "편집된 지문이 변형본으로 저장됐습니다. (내 지문에서 확인)",
        );
        void loadPassages();
      }

      // 2) 생성 유닛 구성 — 세트 1개당 낙관적 큐 카드 1장(영어 세트와 동일).
      const koDifficulty = row.override?.difficulty ?? "INTERMEDIATE";
      const koPlan = row.override?.generationPlan ?? generationPlan;
      const prompt = customPrompt.trim();
      const runToken = `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const jobs = counts.flatMap(([presetId, count]) => {
        const preset = resolveKoSetPreset(presetId);
        if (!preset) return [];
        const resolution = resolveKoSetSlots(preset, activeRowKoKind);
        const typeCountsForConfig: Record<string, number> = {};
        if (resolution.ok) {
          for (const m of resolution.members) {
            typeCountsForConfig[m.typeId] =
              (typeCountsForConfig[m.typeId] ?? 0) + 1;
          }
        }
        return Array.from({ length: count }, (_, copyIndex) => ({
          presetId,
          label: preset.label,
          tempId: `koset:${passageId}:${presetId}:${runToken}:${copyIndex}`,
          config: {
            typeCounts: typeCountsForConfig,
            questionTypeSettings: {},
            difficulty: koDifficulty,
            prompt,
            mode: "manual" as const,
            generationPlan: koPlan,
          },
        }));
      });
      if (jobs.length === 0) {
        toast.error("세트 프리셋을 선택하세요.");
        return;
      }
      const original =
        passages.find((p) => p.id === row.passageId) ??
        passages.find((p) => p.id === row.variantOfId);
      const passageLike = {
        id: passageId,
        title,
        content,
        grade: original?.grade ?? null,
        semester: original?.semester ?? null,
        unit: original?.unit ?? null,
        publisher: original?.publisher ?? null,
        difficulty: original?.difficulty ?? null,
        school: original?.school ?? null,
      } as PassageItem;
      const batchCreatedAt = new Date().toISOString();
      setSessionQueue((prev) => [
        ...jobs.map((job) =>
          buildOptimisticItem({
            jobId: job.tempId,
            passage: passageLike,
            analysisData: null,
            config: job.config,
            progressKey: "set",
            createdAt: batchCreatedAt,
          }),
        ),
        ...prev,
      ]);
      taskQueue.triggerRefresh();

      // 3) 실행 (fire-and-forget) — 완료 시 카드 제거 + 목록/세트 섹션 갱신.
      void (async () => {
        let createdSets = 0;
        let createdQuestions = 0;
        for (const job of jobs) {
          try {
            const res = await fetch(
              "/api/workbench/ai-jobs/korean-question-set",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  passageId,
                  presetId: job.presetId,
                  difficulty: koDifficulty,
                  generationPlan: koPlan,
                  customPrompt: prompt || undefined,
                }),
              },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || "국어 세트 생성에 실패했습니다.");
            }
            createdSets += 1;
            createdQuestions += Array.isArray(data.questionIds)
              ? data.questionIds.length
              : 0;
            if (data.status === "DEGRADED") {
              toast.warning(
                `"${job.label}" 세트가 생성됐지만 검수가 필요합니다.`,
              );
            }
            // 생성중 카드 제거 → 하단 '지문 세트' 묶음 카드가 대신 보인다.
            setSessionQueue((prev) => prev.filter((q) => q.id !== job.tempId));
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "국어 세트 생성 실패";
            toast.error(`"${title}" ${msg}`);
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
        taskQueue.triggerRefresh();
        notifyCreditsChanged();
        if (createdSets > 0) {
          void loadSavedQuestions();
          setSetRefreshNonce((n) => n + 1); // 하단 지문 세트 섹션 자동 갱신
          toast.success(
            `${createdSets}개 세트 · ${createdQuestions}문항이 생성됐습니다.`,
          );
        }
      })().catch((err) => {
        // 개별 실패는 위 try/catch 가 처리 — 여기는 예기치 못한 상위 오류만.
        console.error("[ko-set-generate] background batch error", err);
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "국어 세트 생성 준비 중 오류가 발생했습니다.",
      );
    } finally {
      setKoSetGenerating(false);
    }
  }, [
    activeRow,
    koSetGenerating,
    activeRowKoKind,
    passages,
    generationPlan,
    customPrompt,
    workspaceApi,
    loadPassages,
    loadSavedQuestions,
    setSessionQueue,
    taskQueue,
  ]);

  // KO 세트 모드의 모달 CTA — 생성을 시작(fire-and-forget)하고 모달을 닫는다.
  const handleGenerateKoSetActiveRow = useCallback(() => {
    void handleGenerateKoSet();
    closeGenModal();
  }, [handleGenerateKoSet, closeGenModal]);

  return {
    activeRowSubject,
    activeRowKoContent,
    activeRowKoKind,
    koSetMode,
    koSetStats,
    koSetGenerating,
    handleGenerateKoSetActiveRow,
  };
}
