"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface DraftSelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** 이동/복사 (아이콘 전용). 체크박스 바로 뒤, 검수완료 앞에 온다. */
  moveAction?: ReactNode;
  /** 검수완료 토글. 항상 활성 상태를 자체 관리한다. */
  primaryAction?: ReactNode;
  /** 삭제 (아이콘 전용). 검수완료 뒤에 온다. */
  deleteAction?: ReactNode;
  /** AI 복원 다시 — ml-auto 로 가장 오른쪽에 분리 배치한다. */
  trailingAction?: ReactNode;
  embedded?: boolean;
}

export function DraftSelectionToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  onSelectAll,
  onClearSelection,
  moveAction,
  primaryAction,
  deleteAction,
  trailingAction,
  embedded = false,
}: DraftSelectionToolbarProps) {
  const hasSelection = selectedCount > 0;
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Indeterminate state can't be expressed as a React prop — set it
  // imperatively whenever the partial-selection condition flips.
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = hasSelection && !isAllSelected;
    }
  }, [hasSelection, isAllSelected]);

  const chrome = embedded
    ? "transition-colors"
    : "rounded-lg border shadow-sm transition-colors " +
      (hasSelection
        ? "border-blue-200/70 bg-gradient-to-r from-blue-50 via-blue-50/90 to-blue-50/70"
        : "border-slate-200 bg-slate-50/80");

  // 선택이 없으면 선택 의존 액션(이동/삭제/AI복원)은 흐리게 + 클릭 차단.
  // 검수완료(primaryAction)는 자체 disabled 상태를 관리하므로 게이트 밖에 둔다.
  const selectionGate = hasSelection ? "" : "pointer-events-none opacity-50";

  return (
    <div className={`flex min-h-9 shrink-0 ${embedded ? "" : "flex-wrap"} items-center gap-x-1.5 gap-y-1.5 py-1 ${chrome} ${embedded ? "pl-2 pr-0" : "px-2"}`}>
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={isAllSelected && hasSelection}
        onChange={() => (hasSelection ? onClearSelection() : onSelectAll())}
        disabled={totalCount === 0}
        title={embedded ? `${selectedCount}개 선택` : undefined}
        aria-label={hasSelection ? "선택 해제" : "전체 선택"}
        className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {embedded ? null : (
        <span
          className={
            "text-[12px] font-medium tabular-nums " +
            (hasSelection ? "text-blue-700" : "text-slate-500")
          }
        >
          {selectedCount}개 선택
        </span>
      )}
      {embedded ? null : <span className="text-slate-300">|</span>}

      {moveAction ? (
        <div
          className={"flex shrink-0 items-center " + selectionGate}
          aria-disabled={!hasSelection}
        >
          {moveAction}
        </div>
      ) : null}

      {primaryAction ? primaryAction : null}

      {deleteAction ? (
        <div
          className={"flex shrink-0 items-center " + selectionGate}
          aria-disabled={!hasSelection}
        >
          {deleteAction}
        </div>
      ) : null}

      {trailingAction ? (
        <div
          className={"ml-auto flex shrink-0 items-center " + selectionGate}
          aria-disabled={!hasSelection}
        >
          {trailingAction}
        </div>
      ) : null}
    </div>
  );
}
