"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FolderX } from "lucide-react";

interface DraftSelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  activeFolder: string | null;
  onRemoveFromFolder?: () => void;
  extraActions?: ReactNode;
  embedded?: boolean;
  primaryAction?: ReactNode;
}

export function DraftSelectionToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  onSelectAll,
  onClearSelection,
  activeFolder,
  onRemoveFromFolder,
  extraActions,
  embedded = false,
  primaryAction,
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
        ? "border-slate-200 bg-slate-50"
        : "border-slate-200 bg-slate-50/80");

  return (
    <div
      className={`flex min-h-9 shrink-0 ${embedded ? "" : "flex-wrap"} items-center gap-x-1.5 gap-y-1.5 py-1 ${chrome} ${embedded ? "pl-2 pr-0" : "px-2"}`}
    >
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
            (hasSelection ? "text-slate-700" : "text-slate-500")
          }
        >
          {selectedCount}개 선택
        </span>
      )}
      {embedded ? null : <span className="text-slate-300">|</span>}

      {primaryAction ? primaryAction : null}
      {primaryAction && !embedded ? (
        <span className="text-slate-300">|</span>
      ) : null}

      <div
        className={
          "flex items-center gap-3 " +
          (hasSelection ? "" : "pointer-events-none opacity-50")
        }
        aria-disabled={!hasSelection}
      >
        {extraActions}

        {activeFolder && onRemoveFromFolder ? (
          <button
            type="button"
            onClick={onRemoveFromFolder}
            title="폴더에서 삭제"
            aria-label="폴더에서 삭제"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
          >
            <FolderX className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
