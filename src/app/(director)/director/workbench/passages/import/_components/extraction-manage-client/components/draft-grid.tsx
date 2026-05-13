"use client";

import { Grid2X2, Grid3X3, LayoutGrid } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import { DraftCard } from "./draft-card";
import { DraftCardSkeleton } from "./draft-card-skeleton";
import { EmptyGridState } from "./empty-grid-state";

export type GridCols = 2 | 3 | 4;

interface DraftGridProps {
  drafts: M1PassageDraftWithJob[];
  loading: boolean;
  hasAnyDraft: boolean;
  inFolder: boolean;
  hasActiveSearchOrFilter: boolean;
  selectedDraftId: string | null;
  checkedIds: Set<string>;
  gridCols: GridCols;
  onGridColsChange: (cols: GridCols) => void;
  onSelectDraft: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onResetFilters?: () => void;
}

const COL_CLASS: Record<GridCols, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
};

export function DraftGrid({
  drafts,
  loading,
  hasAnyDraft,
  inFolder,
  hasActiveSearchOrFilter,
  selectedDraftId,
  checkedIds,
  gridCols,
  onGridColsChange,
  onSelectDraft,
  onToggleCheck,
  onResetFilters,
}: DraftGridProps) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-slate-600">
          자료
          <span className="ml-1.5 text-[11px] font-normal text-slate-400">
            {drafts.length}개
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-200">
            <ViewToggleButton
              active={gridCols === 2}
              label="2열 보기"
              onClick={() => onGridColsChange(2)}
            >
              <Grid2X2 className="w-3.5 h-3.5" />
            </ViewToggleButton>
            <ViewToggleButton
              active={gridCols === 3}
              label="3열 보기"
              onClick={() => onGridColsChange(3)}
              middle
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </ViewToggleButton>
            <ViewToggleButton
              active={gridCols === 4}
              label="4열 보기"
              onClick={() => onGridColsChange(4)}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </ViewToggleButton>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className={`grid gap-3 ${COL_CLASS[gridCols]}`}>
            {Array.from({ length: 8 }, (_, i) => (
              <DraftCardSkeleton key={i} />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <EmptyGridState
            variant={
              !hasAnyDraft
                ? "no-drafts"
                : hasActiveSearchOrFilter
                  ? "no-search-results"
                  : inFolder
                    ? "empty-folder"
                    : "no-drafts"
            }
            onResetFilters={onResetFilters}
          />
        ) : (
          <div className={`grid gap-3 ${COL_CLASS[gridCols]}`}>
            {drafts.map((draft, index) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                index={index}
                selected={false}
                active={selectedDraftId === draft.id}
                checked={checkedIds.has(draft.id)}
                onClick={() => onSelectDraft(draft.id)}
                onToggleCheck={() => onToggleCheck(draft.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ViewToggleButton({
  active,
  middle,
  label,
  onClick,
  children,
}: {
  active: boolean;
  middle?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        "p-1.5 cursor-pointer transition-colors " +
        (middle ? "border-x border-slate-200 " : "") +
        (active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-50 hover:text-slate-600")
      }
    >
      {children}
    </button>
  );
}
