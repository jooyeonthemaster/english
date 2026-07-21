"use client";

// 지문별 개별 설정 패널(워크스페이스 행 오버라이드) 클러스터 —
// generate-page-client.tsx 에서 추출. activeRow/editingRow 파생, 행 선택·생성
// 모달 핸들러, 우측 패널에 넘길 '유효 설정'(panel*) fork 를 담당한다.
// 코드는 바이트 동일 이동(무회귀).

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { type QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import {
  diffQuestionTypeSettings,
  isOverrideEmpty,
  overrideHasTypeCounts,
  type RowOverride,
} from "./workspace/workspace-types";
import { type WorkspaceRowsApi } from "./workspace/use-workspace-rows";

interface UseRowSettingsPanelParams {
  workspaceApi: WorkspaceRowsApi;
  workspaceVisible: boolean;
  handleWorkspaceGenerate: (targetLocalId?: string) => Promise<void>;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  setDifficulty: Dispatch<
    SetStateAction<"BASIC" | "INTERMEDIATE" | "KILLER">
  >;
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  setTypeCounts: Dispatch<SetStateAction<Record<string, number>>>;
  totalQuestions: number;
  questionTypeSettings: QuestionTypeGenerationSettings;
  setQuestionTypeSettings: Dispatch<
    SetStateAction<QuestionTypeGenerationSettings>
  >;
  genMode: "manual" | "set";
  setGenMode: Dispatch<SetStateAction<"manual" | "set">>;
  generationPlan: QuestionGenerationPlan;
  setGenerationPlan: Dispatch<SetStateAction<QuestionGenerationPlan>>;
}

export function useRowSettingsPanel({
  workspaceApi,
  workspaceVisible,
  handleWorkspaceGenerate,
  difficulty,
  setDifficulty,
  typeCounts,
  setTypeCount,
  setTypeCounts,
  totalQuestions,
  questionTypeSettings,
  setQuestionTypeSettings,
  genMode,
  setGenMode,
  generationPlan,
  setGenerationPlan,
}: UseRowSettingsPanelParams) {
  // 지문별 '문제 생성' 모달의 대상 행. 우측 사이드 설정 컬럼을 폐기하고, 각
  // 지문 카드의 '문제 생성' 버튼으로 이 지문만의 유형·난이도를 설정하는 모달을
  // 연다 — "어떤 지문의 설정인지" 혼동을 없애는 재설계의 핵심.
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [genModalOpen, setGenModalOpen] = useState(false);

  // ── 지문별 개별 설정 (워크스페이스) ───────────────────────────────
  // 워크스페이스 행을 클릭하면 우측 '유형·생성 설정'이 그 지문만 편집한다.
  // 편집 대상 행이 있으면(editingRow) 난이도·유형 개수·유형별 세부옵션을
  // 행 오버라이드로 읽고/쓰며(전체 설정값을 시드로 fork), 생성 모드·프롬프트
  // 등은 그대로 전체 공통값을 쓴다. 행이 없으면 기존처럼 전체 설정을 편집.
  const activeRow =
    workspaceVisible && activeRowId
      ? (workspaceApi.rows.find((r) => r.localId === activeRowId) ?? null)
      : null;
  const editingRow = activeRow !== null;
  // 설정 패널 헤더에 카드와 똑같은 ① 번호 배지를 비추기 위한 인덱스
  // (왼쪽 선택 지문 ↔ 오른쪽 설정의 정체성 일치 신호).
  const activeRowIndex = activeRow
    ? workspaceApi.rows.findIndex((r) => r.localId === activeRow.localId)
    : -1;

  // 워크스페이스가 사라지면 개별 설정 선택을 해제하고 생성 모달도 닫는다.
  useEffect(() => {
    if (!workspaceVisible) {
      if (activeRowId !== null) setActiveRowId(null);
      if (genModalOpen) setGenModalOpen(false);
    }
  }, [workspaceVisible, activeRowId, genModalOpen]);

  // 지문 카드 본문 클릭 → 그 지문을 선택(설정 대상)으로 바인딩 (선택 링 표시).
  const selectRow = useCallback((localId: string) => {
    setActiveRowId(localId);
  }, []);

  // 카드의 '문제 생성' 버튼/설정 배지 클릭 → 이 지문을 선택하고 생성 모달을 연다.
  const handleSetActiveRow = useCallback(
    (localId: string) => {
      selectRow(localId);
      setGenModalOpen(true);
    },
    [selectRow],
  );

  // 모달을 닫는다 — 선택(링)은 유지하지 않고 해제해 깔끔하게 비운다.
  const closeGenModal = useCallback(() => {
    setGenModalOpen(false);
    setActiveRowId(null);
  }, []);

  // 이 지문 하나로 생성 — 생성을 시작(fire-and-forget)하고 모달을 닫는다.
  const handleGenerateActiveRow = useCallback(() => {
    if (!activeRowId) return;
    // 생성은 시작 시점에 행 설정을 동기적으로 캡처하므로(setOverride 는 불변
    // 업데이트라 캡처된 참조에 영향 없음), 호출 직후 이 지문의 유형 지정을
    // 비워 초기화해도 안전하다. 난이도·유형별 세부 설정은 보존한다.
    void handleWorkspaceGenerate(activeRowId);
    const row = workspaceApi.rows.find((r) => r.localId === activeRowId);
    if (row?.override && overrideHasTypeCounts(row.override)) {
      const next = { ...row.override, typeCounts: {} };
      workspaceApi.setOverride(
        activeRowId,
        isOverrideEmpty(next) ? null : next,
      );
    }
    closeGenModal();
  }, [activeRowId, handleWorkspaceGenerate, closeGenModal, workspaceApi]);

  // 활성 행의 오버라이드를 부분 수정한다. 결과가 전체 설정과 같아지면(빈
  // 오버라이드) null 로 저장해 '전체 설정 따름'으로 되돌린다.
  const writeActiveOverride = useCallback(
    (updater: (base: RowOverride) => RowOverride) => {
      if (!activeRowId) return;
      const row = workspaceApi.rows.find((r) => r.localId === activeRowId);
      const base: RowOverride = row?.override
        ? { ...row.override }
        : { typeCounts: {}, difficulty: null };
      const next = updater(base);
      workspaceApi.setOverride(
        activeRowId,
        isOverrideEmpty(next) ? null : next,
      );
    },
    [activeRowId, workspaceApi],
  );

  // 우측 패널에 넘길 '유효 설정' — 편집 중이면 행 오버라이드(없으면 전체
  // 설정 시드), 아니면 전체 설정. 세터는 편집 중이면 오버라이드에 쓴다.
  const panelDifficulty = editingRow
    ? (activeRow.override?.difficulty ?? difficulty)
    : difficulty;
  const panelSetDifficulty = editingRow
    ? (v: "BASIC" | "INTERMEDIATE" | "KILLER") =>
        writeActiveOverride((o) => ({ ...o, difficulty: v }))
    : setDifficulty;

  // 개별 설정 중인 행은 '빈 슬레이트'에서 시작한다 — 지정하지 않은 지문은
  // 0개(생성 제외)이므로, 전체 설정 유형을 시드로 채우지 않는다(채우면 화면엔
  // 보이는데 실제로는 생성/합산되지 않아 어긋난다). 행에 이미 개별 지정이
  // 있으면 그 값을 보여준다.
  const panelTypeCounts = editingRow
    ? overrideHasTypeCounts(activeRow.override)
      ? activeRow.override!.typeCounts
      : {}
    : typeCounts;
  const panelSetTypeCount = editingRow
    ? (id: string, count: number) =>
        writeActiveOverride((o) => {
          const seed = overrideHasTypeCounts(o) ? o.typeCounts : {};
          const nextCounts = { ...seed };
          if (count <= 0) delete nextCounts[id];
          else nextCounts[id] = count;
          return { ...o, typeCounts: nextCounts };
        })
    : setTypeCount;
  // 패널은 setTypeCounts 를 값/업데이터 함수 양쪽으로 호출한다(정렬·증감 등).
  // 업데이터에는 '현재 행 typeCounts'(개별 지정 없으면 빈 슬레이트)를 넘긴다.
  const panelSetTypeCounts = editingRow
    ? (
        v:
          | Record<string, number>
          | ((prev: Record<string, number>) => Record<string, number>),
      ) =>
        writeActiveOverride((o) => {
          const seed = overrideHasTypeCounts(o) ? o.typeCounts : {};
          const next = typeof v === "function" ? v(seed) : v;
          return { ...o, typeCounts: next };
        })
    : setTypeCounts;
  const panelTotalQuestions = editingRow
    ? Object.values(panelTypeCounts).reduce((a, b) => a + b, 0)
    : totalQuestions;

  const panelQuestionTypeSettings = editingRow
    ? { ...questionTypeSettings, ...(activeRow.override?.questionTypeSettings ?? {}) }
    : questionTypeSettings;
  const panelSetQuestionTypeSettings = editingRow
    ? (
        v:
          | QuestionTypeGenerationSettings
          | ((
              prev: QuestionTypeGenerationSettings,
            ) => QuestionTypeGenerationSettings),
      ) =>
        writeActiveOverride((o) => {
          const merged = {
            ...questionTypeSettings,
            ...(o.questionTypeSettings ?? {}),
          };
          const nextFull = typeof v === "function" ? v(merged) : v;
          return {
            ...o,
            questionTypeSettings: diffQuestionTypeSettings(
              nextFull,
              questionTypeSettings,
            ),
          };
        })
    : setQuestionTypeSettings;

  // 생성 모드(자동/유형지정/장문세트)와 생성 플랜(일반/프리미엄)도 개별 설정
  // 대상이다 — 행 편집 중이면 그 행 오버라이드에 쓰고/읽고(없으면 전체 설정을
  // 시드로), 아니면 전체 공통 설정을 그대로 쓴다.
  const panelGenMode = editingRow
    ? (activeRow.override?.mode ?? genMode)
    : genMode;
  const panelSetGenMode = editingRow
    ? (m: "manual" | "set") =>
        writeActiveOverride((o) => ({ ...o, mode: m }))
    : setGenMode;
  const panelGenerationPlan = editingRow
    ? (activeRow.override?.generationPlan ?? generationPlan)
    : generationPlan;
  const panelSetGenerationPlan = editingRow
    ? (p: "STANDARD" | "PREMIUM") =>
        writeActiveOverride((o) => ({ ...o, generationPlan: p }))
    : setGenerationPlan;
  // 세트 프리셋 선택도 지문별로 저장한다(자동/유형지정과 동일 원리). 편집 중인
  // 행의 override.setPresetId/difficulty 를 controlled 값으로 넘기고, 변경 시 그 행에 쓴다.
  const panelSetPresetId = editingRow
    ? (activeRow.override?.setPresetId ?? null)
    : undefined;
  const panelSetPresetCounts = editingRow
    ? (activeRow.override?.setPresetCounts ??
        (activeRow.override?.setPresetId ? { [activeRow.override.setPresetId]: 1 } : {}))
    : undefined;
  const panelOnSetPresetChange = editingRow
    ? (presetId: string | null) =>
        writeActiveOverride((o) => {
          const nextCounts = { ...(o.setPresetCounts ?? {}) };
          if (presetId) {
            nextCounts[presetId] = Math.max(1, Number(nextCounts[presetId] ?? 1));
          }
          return {
            ...o,
            mode: "set",
            setPresetId: presetId ?? undefined,
            setPresetCounts: presetId ? nextCounts : {},
            // 프리셋이 바뀌면 멤버 인덱스가 달라지므로 legacy 멤버 오버라이드는 리셋한다.
            setMemberOverrides:
              presetId === o.setPresetId ? o.setMemberOverrides : undefined,
          };
        })
    : undefined;
  const panelOnSetPresetCountsChange = editingRow
    ? (next: Record<string, number>) =>
        writeActiveOverride((o) => {
          const first =
            Object.entries(next).find(([, count]) => Number(count) > 0)?.[0] ??
            undefined;
          return {
            ...o,
            mode: "set",
            setPresetId: first,
            setPresetCounts: next,
          };
        })
    : undefined;
  // 세트 멤버별 난이도·세부설정도 지문별로 저장한다(프리셋 멤버 순서 평행 배열).
  const panelSetMemberOverrides = editingRow
    ? (activeRow.override?.setMemberOverrides ?? [])
    : undefined;
  const panelSetMemberOverridesByPreset = editingRow
    ? (activeRow.override?.setMemberOverridesByPreset ??
        (activeRow.override?.setPresetId && activeRow.override?.setMemberOverrides
          ? { [activeRow.override.setPresetId]: activeRow.override.setMemberOverrides }
          : {}))
    : undefined;
  const panelOnSetMemberOverridesChange = editingRow
    ? (
        next: Array<{
          difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
          generationPlan?: "STANDARD" | "PREMIUM";
          typeSettings?: Record<string, unknown>;
        }>,
      ) =>
        writeActiveOverride((o) => ({
          ...o,
          mode: "set",
          setMemberOverrides: next,
        }))
    : undefined;
  const panelOnSetMemberOverridesByPresetChange = editingRow
    ? (
        next: Record<
          string,
          Array<{
            difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
            generationPlan?: "STANDARD" | "PREMIUM";
            typeSettings?: Record<string, unknown>;
          }>
        >,
      ) =>
        writeActiveOverride((o) => ({
          ...o,
          mode: "set",
          setMemberOverridesByPreset: next,
        }))
    : undefined;

  return {
    activeRowId,
    setActiveRowId,
    genModalOpen,
    setGenModalOpen,
    activeRow,
    editingRow,
    activeRowIndex,
    selectRow,
    handleSetActiveRow,
    closeGenModal,
    handleGenerateActiveRow,
    writeActiveOverride,
    panelDifficulty,
    panelSetDifficulty,
    panelTypeCounts,
    panelSetTypeCount,
    panelSetTypeCounts,
    panelTotalQuestions,
    panelQuestionTypeSettings,
    panelSetQuestionTypeSettings,
    panelGenMode,
    panelSetGenMode,
    panelGenerationPlan,
    panelSetGenerationPlan,
    panelSetPresetId,
    panelSetPresetCounts,
    panelOnSetPresetChange,
    panelOnSetPresetCountsChange,
    panelSetMemberOverrides,
    panelSetMemberOverridesByPreset,
    panelOnSetMemberOverridesChange,
    panelOnSetMemberOverridesByPresetChange,
  };
}
