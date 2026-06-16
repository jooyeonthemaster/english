"use client";

import { useEffect, useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  FilePen,
  Info,
  ListStart,
  PencilLine,
  Scissors,
  TextCursorInput,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  variantModeLabel,
  variantTag,
  type VariantDirection,
  type WholePassageTransformMode,
} from "@/lib/passage-transform/schema";
import type { QueueItem } from "../generate-page-types";
import { isRowDirty, rowNeedsVariant } from "./workspace-types";
import type { WorkspaceRowsApi } from "./use-workspace-rows";
import { WorkspacePassageRow } from "./workspace-passage-row";

// ============================================================================
// 지문 워크스페이스 — 불러온 지문 스택 + 빈 상태 가이드 + 기능 코치마크.
//
// 레이아웃 규칙 (3컬럼 정렬):
//  - 헤더는 h-11(44px) + border-b — 좌측 탭 행·우측 설정 헤더와 끝선 일치
//  - 헤더 컨트롤은 전부 h-7, 아이콘 h-4, gap-1
//  - 본문 패딩 p-3, 카드 간격 space-y-2.5
// ============================================================================

const COACHMARK_DISMISS_KEY = "smoat:generate:workspace-coachmark-dismissed";

function readCoachmarkDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(COACHMARK_DISMISS_KEY) === "1";
  } catch {
    return true;
  }
}

interface PassageWorkspaceProps {
  api: WorkspaceRowsApi;
  generating: boolean;
  sessionQueue: QueueItem[];
  questionCountByPassage: Map<string, number>;
  /** 전체 공통 난이도 — 행에 개별 난이도가 없을 때 기본 뱃지로 표시. */
  globalDifficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  /** 전체 공통 생성 플랜 — 행에 개별 플랜이 없을 때 기본 뱃지로 표시. */
  globalGenerationPlan: "STANDARD" | "PREMIUM";
  /** 우측 설정이 '장문 세트' 모드 — 워크스페이스가 생성에 사용되지 않음. */
  setModeActive?: boolean;
  /** 개별 설정 대상으로 선택된 행 (선택 링 표시용). */
  activeRowId?: string | null;
  /** 행 본문 클릭 → 이 지문을 선택(설정 대상)으로 바인딩. */
  onSetActiveRow?: (localId: string) => void;
  /** '문제 생성' 버튼 → 이 지문의 문제 생성 모달을 연다. */
  onOpenRowSettings?: (localId: string) => void;
  /** 워크스페이스 여백 클릭 → 선택 해제. */
  onClearActiveRow?: () => void;
  /** 지문별 생성 통계 (문제 수·크레딧) — 카드 푸터 '문제 생성' 버튼 라벨용. */
  rowStats?: Map<string, { questions: number; creditCost: number }>;
}

export function PassageWorkspace({
  api,
  generating,
  sessionQueue,
  questionCountByPassage,
  globalDifficulty,
  globalGenerationPlan,
  setModeActive = false,
  activeRowId = null,
  onSetActiveRow,
  onOpenRowSettings,
  onClearActiveRow,
  rowStats,
}: PassageWorkspaceProps) {
  const { rows } = api;
  const [coachDismissed, setCoachDismissed] = useState(true);
  useEffect(() => {
    setCoachDismissed(readCoachmarkDismissed());
  }, []);
  const dismissCoach = () => {
    setCoachDismissed(true);
    try {
      window.localStorage.setItem(COACHMARK_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  const reopenCoach = () => setCoachDismissed(false);

  // 편집·AI 변형이 들어간 행이 있으면 비우기/제거 전에 확인을 받는다 —
  // 크레딧 들여 만든 변형이 한 클릭에 사라지는 사고 방지.
  const hasUnsavedWork = rows.some((r) => rowNeedsVariant(r));
  const handleClear = () => {
    if (
      hasUnsavedWork &&
      !window.confirm(
        "편집·AI 변형된 지문이 있습니다. 아직 생성하지 않은 변형 내용은 사라져요. 워크스페이스를 비울까요?",
      )
    ) {
      return;
    }
    api.clear();
  };
  const handleRemoveRow = (localId: string) => {
    const row = rows.find((r) => r.localId === localId);
    if (
      row &&
      isRowDirty(row) &&
      !window.confirm(
        `"${row.title}"에 아직 생성하지 않은 편집·변형 내용이 있습니다. 제거하면 사라져요. 계속할까요?`,
      )
    ) {
      return;
    }
    api.removeRow(localId);
  };

  // 전체 변형본을 새 Passage 로 저장하고 워크스페이스에 "새 행"으로 추가한다
  // (원본 행은 그대로 유지). 변형본은 지문 목록·문제 생성에 그대로 연동된다.
  const handleAddVariant = async (input: {
    sourcePassageId: string;
    title: string;
    content: string;
    mode: WholePassageTransformMode;
    direction?: VariantDirection;
  }): Promise<boolean> => {
    const title = input.title.trim();
    const content = input.content.trim();
    if (title.length === 0 || content.length < 20) {
      toast.error("변형본 제목/본문이 비어 있습니다.");
      return false;
    }
    try {
      const { createDirectInputPassageMaterial } = await import(
        "@/actions/workbench"
      );
      const result = await createDirectInputPassageMaterial({
        title,
        content,
        sourcePassageId: input.sourcePassageId,
        variantKind: variantModeLabel(input.mode, input.direction),
        variantDirection: input.direction,
        tags: [variantTag(input.mode, input.direction)],
      });
      if (!result?.success || !result.id) {
        toast.error(
          "변형본 저장에 실패했습니다." +
            (result && "error" in result && result.error
              ? ` (${result.error})`
              : ""),
        );
        return false;
      }
      const added = api.addVariantRow({
        passageId: result.id,
        title,
        content,
        variantOfId: input.sourcePassageId,
      });
      toast.success(
        added
          ? "변형본이 새 지문으로 추가됐어요 — 이 지문으로 바로 문제를 생성할 수 있습니다."
          : "변형본이 저장됐어요 (이미 워크스페이스에 있는 지문).",
      );
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "변형본 저장 중 오류가 발생했습니다.",
      );
      return false;
    }
  };

  const allCollapsed = rows.length > 0 && rows.every((r) => r.collapsed);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col bg-slate-50/60"
      data-generate-tour="workspace"
    >
      {/* ── 헤더 (44px — 3컬럼 공통 끝선) ── */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-100 bg-white pl-3 pr-1.5">
        <FilePen
          className="h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        <h3 className="shrink-0 text-[12.5px] font-bold text-slate-800">
          지문 워크스페이스
        </h3>
        {rows.length > 0 ? (
          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-violet-600 px-1 text-[10.5px] font-bold leading-none text-white tabular-nums">
            {rows.length}
          </span>
        ) : null}
        {rows.length > 0 ? (
          <span className="hidden shrink-0 text-[11px] font-medium text-slate-400 sm:inline">
            지문 편집 · AI 변형
          </span>
        ) : null}
        <span className="min-w-0 flex-1" aria-hidden="true" />
        {rows.length > 0 ? (
          <>
            <span
              className="mx-0.5 h-4 w-px shrink-0 bg-slate-200"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={reopenCoach}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-violet-600"
              title="기능 안내 다시 보기"
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => api.setAllCollapsed(!allCollapsed)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              title={allCollapsed ? "모두 펼치기" : "모두 접기"}
            >
              {allCollapsed ? (
                <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={generating}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              title="워크스페이스 비우기 (지문은 삭제되지 않음)"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {/* 장문 세트 모드 안내 — 워크스페이스가 생성에 사용되지 않는 상태 */}
      {setModeActive && rows.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11.5px] font-medium leading-snug text-slate-500">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          지금은 ‘장문 세트’ 모드예요 — 워크스페이스 지문은 사용되지 않고, ‘내
          지문’에서 체크한 지문 1개로 세트를 만듭니다.
        </div>
      ) : null}

      {/* ── 본문 — 이 컴포넌트는 행이 있을 때만 마운트된다 (빈 상태는
          상위에서 컬럼 자체를 렌더하지 않음). ── */}
      {
        <div
          // 여백(행이 아닌 배경) 클릭 → 개별 설정 선택 해제. 행/자식 클릭은
          // target !== currentTarget 이라 무시된다 (행 선택과 충돌 없음).
          onClick={(e) => {
            if (e.target === e.currentTarget) onClearActiveRow?.();
          }}
          className="grid min-h-0 flex-1 grid-cols-1 content-start items-stretch gap-2.5 overflow-y-auto p-3 xl:grid-cols-2"
        >
          {!coachDismissed ? (
            <div className="col-span-full flex items-start gap-3 rounded-lg border border-violet-100 bg-violet-50/60 py-2.5 pl-3.5 pr-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-violet-800/80">
                  이 워크스페이스에서 할 수 있는 것
                </p>
                {/* 1열 고정 — 뷰포트 브레이크포인트는 컨테이너 폭과 무관해
                    좁은 컬럼에서 2열이 글자 단위로 부서진다. */}
                <ul className="mt-1.5 space-y-1 text-[11.5px] leading-snug text-violet-900/80">
                  <li className="flex items-center gap-1.5">
                    <PencilLine className="h-3 w-3 shrink-0 text-violet-500" />
                    본문 직접 수정 — 생성 시 ‘변형본’으로 저장, 원본 보존
                  </li>
                  <li className="flex items-center gap-1.5">
                    <TextCursorInput className="h-3 w-3 shrink-0 text-violet-500" />
                    문장 드래그 →{" "}
                    <strong className="font-bold">AI 문장 변형</strong>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <ListStart className="h-3 w-3 shrink-0 text-violet-500" />
                    <strong className="font-bold">앞 맥락 추가</strong> —
                    이어지는 앞 문단 생성
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Scissors className="h-3 w-3 shrink-0 text-violet-500" />긴
                    지문은 드래그 →{" "}
                    <strong className="font-bold">이 범위만 출제</strong>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={dismissCoach}
                className="shrink-0 rounded-md p-1 text-violet-300 transition-colors hover:bg-violet-100 hover:text-violet-600"
                title="다시 보지 않기"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {rows.map((row, index) => (
            <WorkspacePassageRow
              key={row.localId}
              index={index}
              row={row}
              dragCoach={index === 0}
              globalDifficulty={globalDifficulty}
              globalGenerationPlan={globalGenerationPlan}
              disabled={generating}
              sessionQueue={sessionQueue}
              savedQuestionCount={
                (questionCountByPassage.get(row.passageId) ?? 0) +
                (row.variantOfId
                  ? (questionCountByPassage.get(row.variantOfId) ?? 0)
                  : 0)
              }
              onChangeContent={(content) =>
                api.setContent(row.localId, content)
              }
              onPushHistory={() => api.pushHistory(row.localId)}
              onApplyAi={(content, highlight) =>
                api.applyAiEdit(row.localId, content, highlight)
              }
              onUndo={() => api.undo(row.localId)}
              onRedo={() => api.redo(row.localId)}
              onClearHighlights={() => api.clearHighlights(row.localId)}
              onSetRange={(range) => api.setRange(row.localId, range)}
              onToggleCollapsed={() => api.toggleCollapsed(row.localId)}
              onRemove={() => handleRemoveRow(row.localId)}
              onAddVariant={handleAddVariant}
              active={activeRowId === row.localId}
              onSetActive={() => onSetActiveRow?.(row.localId)}
              onOpenSettings={() => onOpenRowSettings?.(row.localId)}
              genStats={rowStats?.get(row.localId)}
            />
          ))}
        </div>
      }
    </div>
  );
}
