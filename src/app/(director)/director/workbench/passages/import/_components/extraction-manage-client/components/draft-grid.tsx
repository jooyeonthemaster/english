"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Grid2X2, Grid3X3, List } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import { DraftCard } from "./draft-card";
import { DraftCardSkeleton } from "./draft-card-skeleton";
import { EmptyGridState } from "./empty-grid-state";
import { GroupSection } from "./group-section";
import { ViewToggleButton } from "./view-toggle-button";

export type GridCols = "grid3" | "grid2" | "list";

export interface JobFilterOption {
  jobId: string;
  label: string;
  subLabel?: string;
  count: number;
  draftIds: string[];
  createdAt?: number | null;
  thumbnailUrl?: string | null;
  status?: string | null;
}

interface DraftGridProps {
  drafts: M1PassageDraftWithJob[];
  loading: boolean;
  hasAnyDraft: boolean;
  inFolder: boolean;
  hasActiveSearchOrFilter: boolean;
  selectedDraftId: string | null;
  /** Most recently opened draft id — kept after the detail modal closes
   *  so the card stays subtly shaded. */
  lastViewedDraftId?: string | null;
  checkedIds: Set<string>;
  gridCols: GridCols;
  onGridColsChange: (cols: GridCols) => void;
  onSelectDraft: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onToggleGroupCheck: (ids: string[], select: boolean) => void;
  onResetFilters?: () => void;

  // Job filter
  jobs: JobFilterOption[];
  selectedJobIds: Set<string>;
  totalDraftCount: number;
  onSelectJob: (jobId: string | null) => void;

  // Job rename (jobId, newName | null)
  onRenameJob: (jobId: string, name: string | null) => void;

  // SourceMaterial (시험지) rename (sourceMaterialId, newTitle)
  onRenameSourceMaterial: (sourceMaterialId: string, title: string) => void;

  /** SourceMaterialId → per-job absolute 1-based index. Stable across filter
   *  changes so each 시험지 keeps its own number within its job. */
  groupIndexBySourceMaterialId: Map<string, number>;

  /** Optional. Per-draft-id, number of other drafts that share its
   *  normalized content. Used to render a "+N 중복" badge on cards. */
  dupCountById?: Map<string, number>;

  /** Optional. Set of draft IDs that have been filed into at least one
   *  folder. Cards whose IDs are absent from this set render a "미분류"
   *  badge. Pass undefined to disable the badge entirely. */
  filedDraftIds?: Set<string>;

  /** Top filter row (search, sort, duplicate, refresh, queue, extract). */
  filtersToolbar?: ReactNode;

  /** Bulk selection toolbar (select all, move/copy, rerestore, promote, delete). */
  selectionToolbar?: ReactNode;
}

const COL_CLASS: Record<GridCols, string> = {
  grid3: "grid-cols-2 md:grid-cols-3",
  grid2: "grid-cols-1 sm:grid-cols-2",
  list: "grid-cols-1",
};

export function DraftGrid({
  drafts,
  loading,
  hasAnyDraft,
  inFolder,
  hasActiveSearchOrFilter,
  selectedDraftId,
  lastViewedDraftId,
  checkedIds,
  gridCols,
  onGridColsChange,
  onSelectDraft,
  onToggleCheck,
  onToggleGroupCheck,
  onResetFilters,
  jobs,
  selectedJobIds,
  totalDraftCount,
  onSelectJob,
  onRenameJob,
  onRenameSourceMaterial,
  groupIndexBySourceMaterialId,
  dupCountById,
  filedDraftIds,
  filtersToolbar,
  selectionToolbar,
}: DraftGridProps) {
  // The per-job card row was lifted to the page header above the folder
  // section so it stays visible regardless of folder navigation. Clicking
  // a card now opens the per-job review popup, not a filter.
  void jobs;
  void selectedJobIds;
  void totalDraftCount;
  void onSelectJob;
  void onRenameJob;

  const draftGroups = useMemo(() => {
    const map = new Map<string, M1PassageDraftWithJob[]>();
    for (const d of drafts) {
      const key = d.sourceMaterialId ?? "__unlinked__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      drafts: items,
    }));
  }, [drafts]);

  const showGroupHeaders = draftGroups.length > 1;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const allExpanded =
    draftGroups.length > 0 &&
    draftGroups.every((g) => expandedGroups.has(g.key));
  const toggleAllGroups = useCallback(() => {
    if (allExpanded) {
      setExpandedGroups(new Set());
    } else {
      setExpandedGroups(new Set(draftGroups.map((g) => g.key)));
    }
  }, [allExpanded, draftGroups]);
  return (
    <section className="min-w-0 pb-1 pt-2">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="shrink-0 text-sm font-bold tracking-tight text-slate-700">
          자료
          <span className="ml-1.5 text-xs font-normal tabular-nums text-slate-400">
            {drafts.length}개
          </span>
        </h3>
        {filtersToolbar ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {filtersToolbar}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
          <ViewToggleButton
            active={gridCols === "grid3"}
            label="3열 보기"
            onClick={() => onGridColsChange("grid3")}
          >
            <Grid3X3 className="size-4" />
          </ViewToggleButton>
          <ViewToggleButton
            active={gridCols === "grid2"}
            label="2열 보기"
            onClick={() => onGridColsChange("grid2")}
            middle
          >
            <Grid2X2 className="size-4" />
          </ViewToggleButton>
          <ViewToggleButton
            active={gridCols === "list"}
            label="목록 보기"
            onClick={() => onGridColsChange("list")}
          >
            <List className="size-4" />
          </ViewToggleButton>
        </div>
      </div>

      {selectionToolbar ? (
        <div className="sticky top-0 z-20 -mx-1 mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/95">
          {selectionToolbar}
        </div>
      ) : null}

      <div className="pr-1">
        {loading ? (
          <div className="space-y-4 pb-2">
            {/* Mirror the live "{N}개 시험지 감지됨" header */}
            <div className="flex items-center justify-between gap-2 pb-1">
              <span className="block h-3 w-32 animate-pulse rounded bg-slate-200" />
              <span className="block h-7 w-20 animate-pulse rounded-md bg-slate-200" />
            </div>
            {Array.from({ length: 2 }, (_, gi) => (
              <section
                key={gi}
                className="overflow-hidden rounded-xl border-l-4 border-slate-200 bg-slate-50/50"
              >
                <header className="flex w-full items-center gap-2.5 border-b border-slate-100 bg-white px-4 py-3">
                  <span className="size-4 shrink-0 animate-pulse rounded bg-slate-200" />
                  <span className="size-4 shrink-0 animate-pulse rounded bg-slate-200" />
                  <span className="size-7 shrink-0 animate-pulse rounded-md bg-slate-200" />
                  <span className="h-4 w-48 animate-pulse rounded bg-slate-200" />
                  <span className="ml-1 h-5 w-12 animate-pulse rounded-full bg-slate-200" />
                </header>
                <div className="px-3 py-3">
                  <div className={`grid gap-3 ${COL_CLASS[gridCols]}`}>
                    {Array.from({ length: 3 }, (_, ci) => (
                      <DraftCardSkeleton key={ci} />
                    ))}
                  </div>
                </div>
              </section>
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
        ) : showGroupHeaders ? (
          <div className="pb-2">
            <div className="flex items-center justify-between gap-2 pb-3">
              <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                {draftGroups.length}개 시험지 감지됨
              </span>
              <button
                type="button"
                onClick={toggleAllGroups}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                {allExpanded ? "전체 접기" : "전체 펼치기"}
              </button>
            </div>
            <div className={`grid items-start gap-4 ${COL_CLASS[gridCols]}`}>
            {draftGroups.map((group) => {
              const isUnlinked = group.key === "__unlinked__";
              // Per-job absolute index lookup (passed from parent so the
              // number is stable regardless of UI filter/sort).
              const absoluteIndex = isUnlinked
                ? 0
                : (groupIndexBySourceMaterialId.get(group.key) ?? 0);
              const firstJob = group.drafts[0]?.job;
              const jobName =
                (firstJob?.displayName?.trim() && firstJob.displayName) ||
                firstJob?.originalFileName ||
                "";
              const derivedLabel = isUnlinked
                ? "출처 미연결"
                : `${jobName ? jobName + " " : ""}시험지 ${absoluteIndex || "?"}`;
              // Teacher-set customLabel takes precedence over the derived
              // label. (Auto-set `title` is intentionally not consulted —
              // extraction AI fills it with unreliable guesses.)
              const sourceMaterial = group.drafts.find(
                (d) => d.sourceMaterial,
              )?.sourceMaterial;
              const label = sourceMaterial?.customLabel?.trim()
                ? sourceMaterial.customLabel
                : derivedLabel;
              const expanded = expandedGroups.has(group.key);
              const groupIds = group.drafts.map((d) => d.id);
              const allChecked =
                groupIds.length > 0 &&
                groupIds.every((id) => checkedIds.has(id));
              const someChecked = groupIds.some((id) => checkedIds.has(id));
              return (
                <GroupSection
                  key={group.key}
                  label={label}
                  derivedLabel={derivedLabel}
                  count={group.drafts.length}
                  tone={isUnlinked ? "amber" : "blue"}
                  expanded={expanded}
                  onToggle={() => toggleGroup(group.key)}
                  allChecked={allChecked}
                  someChecked={someChecked}
                  onToggleAllInGroup={(select) =>
                    onToggleGroupCheck(groupIds, select)
                  }
                  sourceMaterialId={sourceMaterial?.id ?? null}
                  dragIds={groupIds}
                  onRenameSourceMaterial={onRenameSourceMaterial}
                >
                  <div
                    className={`grid gap-3 ${
                      gridCols === "list"
                        ? COL_CLASS.list
                        : "grid-cols-1"
                    }`}
                  >
                    {group.drafts.map((draft, index) => (
                      <DraftCard
                        key={draft.id}
                        draft={draft}
                        index={index}
                        selected={false}
                        active={selectedDraftId === draft.id}
                        recentlyViewed={
                          selectedDraftId !== draft.id &&
                          lastViewedDraftId === draft.id
                        }
                        checked={checkedIds.has(draft.id)}
                        onClick={() => onSelectDraft(draft.id)}
                        onToggleCheck={() => onToggleCheck(draft.id)}
                        dupCount={dupCountById?.get(draft.id) ?? 0}
                        unfiled={
                          filedDraftIds
                            ? !filedDraftIds.has(draft.id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </GroupSection>
              );
            })}
            </div>
          </div>
        ) : (
          <div className={`grid gap-3 pb-2 ${COL_CLASS[gridCols]}`}>
            {drafts.map((draft, index) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                index={index}
                selected={false}
                active={selectedDraftId === draft.id}
                recentlyViewed={
                  selectedDraftId !== draft.id &&
                  lastViewedDraftId === draft.id
                }
                checked={checkedIds.has(draft.id)}
                onClick={() => onSelectDraft(draft.id)}
                onToggleCheck={() => onToggleCheck(draft.id)}
                dupCount={dupCountById?.get(draft.id) ?? 0}
                unfiled={
                  filedDraftIds ? !filedDraftIds.has(draft.id) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
