"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  FolderOpen,
  Info,
  Layers,
  ListStart,
  PencilLine,
  Scissors,
  TextCursorInput,
  Trash2,
  X,
} from "lucide-react";

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
  /** 왼쪽 라이브러리에서 체크된 지문 수. */
  selectedCount: number;
  onLoadSelected: () => void;
  /** 왼쪽 패널을 펴고 '내 지문' 탭으로 전환. */
  onOpenLibrary: () => void;
  generating: boolean;
  sessionQueue: QueueItem[];
  questionCountByPassage: Map<string, number>;
  /** 우측 설정이 '장문 세트' 모드 — 워크스페이스가 생성에 사용되지 않음. */
  setModeActive?: boolean;
}

export function PassageWorkspace({
  api,
  selectedCount,
  onLoadSelected,
  onOpenLibrary,
  generating,
  sessionQueue,
  questionCountByPassage,
  setModeActive = false,
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

  const allCollapsed = rows.length > 0 && rows.every((r) => r.collapsed);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-slate-50/60">
      {/* ── 헤더 (44px — 3컬럼 공통 끝선) ── */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-100 bg-white pl-3 pr-1.5">
        <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <h3 className="shrink-0 text-[12.5px] font-bold text-slate-800">
          지문 워크스페이스
        </h3>
        {rows.length > 0 ? (
          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold leading-none text-white tabular-nums">
            {rows.length}
          </span>
        ) : null}
        <span className="min-w-0 flex-1" aria-hidden="true" />
        {selectedCount > 0 ? (
          <button
            type="button"
            onClick={onLoadSelected}
            disabled={generating}
            title={`왼쪽에서 선택한 ${selectedCount}개 지문을 워크스페이스로 불러옵니다`}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 pl-2 pr-1.5 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
            선택 지문 불러오기
            <span className="rounded-sm bg-white/20 px-1 py-px text-[10px] font-bold tabular-nums">
              {selectedCount}
            </span>
          </button>
        ) : null}
        {rows.length > 0 ? (
          <>
            <span
              className="mx-0.5 h-4 w-px shrink-0 bg-slate-200"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={reopenCoach}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
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
          지금은 ‘장문 세트’ 모드예요 — 워크스페이스 지문은 사용되지 않고,
          왼쪽 ‘내 지문’에서 체크한 지문 1개로 세트를 만듭니다.
        </div>
      ) : null}

      {/* ── 본문 ── */}
      {rows.length === 0 ? (
        <EmptyState
          selectedCount={selectedCount}
          onLoadSelected={onLoadSelected}
          onOpenLibrary={onOpenLibrary}
        />
      ) : (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          {!coachDismissed ? (
            <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 py-2.5 pl-3.5 pr-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-blue-800/80">
                  이 워크스페이스에서 할 수 있는 것
                </p>
                {/* 1열 고정 — 뷰포트 브레이크포인트는 컨테이너 폭과 무관해
                    좁은 컬럼에서 2열이 글자 단위로 부서진다. */}
                <ul className="mt-1.5 space-y-1 text-[11.5px] leading-snug text-blue-900/80">
                  <li className="flex items-center gap-1.5">
                    <PencilLine className="h-3 w-3 shrink-0 text-blue-500" />
                    본문 직접 수정 — 생성 시 ‘변형본’으로 저장, 원본 보존
                  </li>
                  <li className="flex items-center gap-1.5">
                    <TextCursorInput className="h-3 w-3 shrink-0 text-blue-500" />
                    문장 드래그 → <strong className="font-bold">AI 문장 변형</strong>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <ListStart className="h-3 w-3 shrink-0 text-blue-500" />
                    <strong className="font-bold">앞 맥락 추가</strong> — 이어지는 앞
                    문단 생성
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Scissors className="h-3 w-3 shrink-0 text-blue-500" />
                    긴 지문은 드래그 →{" "}
                    <strong className="font-bold">이 범위만 출제</strong>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={dismissCoach}
                className="shrink-0 rounded-md p-1 text-blue-300 transition-colors hover:bg-blue-100 hover:text-blue-600"
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
              disabled={generating}
              sessionQueue={sessionQueue}
              savedQuestionCount={
                (questionCountByPassage.get(row.passageId) ?? 0) +
                (row.variantOfId
                  ? questionCountByPassage.get(row.variantOfId) ?? 0
                  : 0)
              }
              onChangeContent={(content) => api.setContent(row.localId, content)}
              onSetRange={(range) => api.setRange(row.localId, range)}
              onSetOverride={(override) =>
                api.setOverride(row.localId, override)
              }
              onToggleCollapsed={() => api.toggleCollapsed(row.localId)}
              onRemove={() => handleRemoveRow(row.localId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  selectedCount,
  onLoadSelected,
  onOpenLibrary,
}: {
  selectedCount: number;
  onLoadSelected: () => void;
  onOpenLibrary: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-8">
      <div className="w-full max-w-[400px]">
        <p className="px-0.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-400">
          이렇게 진행해요
        </p>
        <ol className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Step
            n={1}
            title="왼쪽 ‘내 지문’에서 지문 선택"
            desc="체크박스로 여러 지문을 한 번에 선택할 수 있어요."
          />
          <Step
            n={2}
            title="‘선택 지문 불러오기’로 이곳에 불러오기"
            desc="불러온 지문은 자유롭게 편집할 수 있어요. 원본은 보존돼요."
          />
          <Step
            n={3}
            title="편집 · AI 변형 · 출제 범위 지정"
            desc="문장을 드래그하면 AI 변형, ‘앞 맥락 추가’로 지문 확장."
          />
          <Step
            n={4}
            title="유형·난이도 설정 후 문제 생성"
            desc="오른쪽 ‘유형·생성 설정’ 또는 지문별 유형 지정."
            last
          />
        </ol>
      </div>
      {selectedCount === 0 ? (
        // 왼쪽 패널이 접혀 있거나 다른 탭일 수 있으니, 안내가 아니라
        // 실제로 '내 지문'을 열어주는 버튼을 준다. (화면 유일의 실행
        // 액션이므로 1차 CTA 톤)
        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex h-10 w-full max-w-[400px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[12.5px] font-bold text-white shadow-md shadow-blue-200/60 transition-colors hover:bg-blue-700"
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          ‘내 지문’ 열고 지문 선택하기
        </button>
      ) : (
        <button
          type="button"
          onClick={onLoadSelected}
          title={`선택한 ${selectedCount}개 지문을 불러옵니다`}
          className="flex h-10 w-full max-w-[400px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[12.5px] font-bold text-white shadow-md shadow-blue-200/60 transition-colors hover:bg-blue-700"
        >
          <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
          선택 지문 불러오기 ({selectedCount}개)
        </button>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  last = false,
}: {
  n: number;
  title: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <li
      className={
        "flex items-start gap-3 px-3.5 py-2.5 " +
        (last ? "" : "border-b border-slate-100")
      }
    >
      <span className="mt-px flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-md bg-blue-50 px-1 text-[11px] font-bold leading-none text-blue-600 ring-1 ring-inset ring-blue-100 tabular-nums">
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold leading-snug text-slate-700">
          {title}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">
          {desc}
        </span>
      </span>
    </li>
  );
}
