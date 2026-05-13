"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  FileText,
  Grid2X2,
  Grid3X3,
  Layers,
  LayoutGrid,
  Pencil,
} from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import { DraftCard } from "./draft-card";
import { DraftCardSkeleton } from "./draft-card-skeleton";
import { EmptyGridState } from "./empty-grid-state";

export type GridCols = 2 | 3 | 4;

export interface JobFilterOption {
  jobId: string;
  label: string;
  subLabel?: string;
  count: number;
}

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
  onToggleGroupCheck: (ids: string[], select: boolean) => void;
  onResetFilters?: () => void;

  // Job filter
  jobs: JobFilterOption[];
  selectedJobId: string | null;
  totalDraftCount: number;
  onSelectJob: (jobId: string | null) => void;

  // Selection toolbar (shown above "자료 N개" row when active)
  selectionBar?: React.ReactNode;

  // Job rename (jobId, newName | null)
  onRenameJob: (jobId: string, name: string | null) => void;
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
  onToggleGroupCheck,
  onResetFilters,
  jobs,
  selectedJobId,
  totalDraftCount,
  onSelectJob,
  selectionBar,
  onRenameJob,
}: DraftGridProps) {
  const showJobFilter = jobs.length > 1;

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
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {showJobFilter ? (
        <div className="mb-4 flex shrink-0 items-stretch gap-3 overflow-x-auto pb-2">
          <JobFilterCard
            active={selectedJobId === null}
            label="전체"
            subLabel="모든 작업"
            count={totalDraftCount}
            tone="emerald"
            onClick={() => onSelectJob(null)}
          />
          {jobs.map((job) => (
            <JobFilterCard
              key={job.jobId}
              active={selectedJobId === job.jobId}
              label={job.label}
              subLabel={job.subLabel}
              count={job.count}
              tone="blue"
              editable
              onClick={() =>
                onSelectJob(selectedJobId === job.jobId ? null : job.jobId)
              }
              onRename={(next) => onRenameJob(job.jobId, next)}
            />
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex min-h-9 shrink-0 items-center gap-3">
        <h3 className="shrink-0 text-sm font-bold tracking-tight text-slate-700">
          자료
          <span className="ml-1.5 text-xs font-normal tabular-nums text-slate-400">
            {drafts.length}개
          </span>
        </h3>
        {selectionBar ? (
          <div className="min-w-0 flex-1">{selectionBar}</div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-md border border-slate-200">
            <ViewToggleButton
              active={gridCols === 2}
              label="2열 보기"
              onClick={() => onGridColsChange(2)}
            >
              <Grid2X2 className="size-4" />
            </ViewToggleButton>
            <ViewToggleButton
              active={gridCols === 3}
              label="3열 보기"
              onClick={() => onGridColsChange(3)}
              middle
            >
              <Grid3X3 className="size-4" />
            </ViewToggleButton>
            <ViewToggleButton
              active={gridCols === 4}
              label="4열 보기"
              onClick={() => onGridColsChange(4)}
            >
              <LayoutGrid className="size-4" />
            </ViewToggleButton>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
        ) : showGroupHeaders ? (
          <div className="space-y-4 pb-2">
            <div className="flex items-center justify-between gap-2 pb-1">
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
            {draftGroups.map((group, groupIdx) => {
              const isUnlinked = group.key === "__unlinked__";
              const label = isUnlinked
                ? "출처 미연결"
                : `시험지 ${groupIdx + 1}`;
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
                  count={group.drafts.length}
                  tone={isUnlinked ? "amber" : "blue"}
                  expanded={expanded}
                  onToggle={() => toggleGroup(group.key)}
                  allChecked={allChecked}
                  someChecked={someChecked}
                  onToggleAllInGroup={(select) =>
                    onToggleGroupCheck(groupIds, select)
                  }
                >
                  <div className={`grid gap-3 ${COL_CLASS[gridCols]}`}>
                    {group.drafts.map((draft, index) => (
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
                </GroupSection>
              );
            })}
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

function GroupSection({
  label,
  count,
  tone,
  expanded,
  allChecked,
  someChecked,
  onToggle,
  onToggleAllInGroup,
  children,
}: {
  label: string;
  count: number;
  tone: "blue" | "amber";
  expanded: boolean;
  allChecked: boolean;
  someChecked: boolean;
  onToggle: () => void;
  onToggleAllInGroup: (select: boolean) => void;
  children: React.ReactNode;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someChecked && !allChecked;
    }
  }, [someChecked, allChecked]);

  const accent =
    tone === "blue"
      ? "border-blue-500 bg-blue-50/50"
      : "border-amber-500 bg-amber-50/50";
  const iconBg =
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : "bg-amber-100 text-amber-700";
  const badgeBg =
    tone === "blue"
      ? "bg-white text-blue-700 ring-blue-200"
      : "bg-white text-amber-700 ring-amber-200";

  return (
    <section className={`overflow-hidden rounded-xl border-l-4 ${accent}`}>
      <header className="sticky top-0 z-10 flex w-full items-center gap-2.5 border-b border-slate-100/70 bg-white/95 px-4 backdrop-blur-sm">
        <div
          className="-m-1 flex shrink-0 cursor-pointer items-center p-1"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAllInGroup(!allChecked);
          }}
          title={allChecked ? "시험지 선택 해제" : "시험지 전체 선택"}
        >
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allChecked}
            readOnly
            tabIndex={-1}
            className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`${label} 전체 선택`}
          />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 cursor-pointer items-center gap-2.5 py-3 text-left transition-colors hover:opacity-90"
        >
          <ChevronRight
            className={
              "size-4 shrink-0 text-slate-400 motion-safe:transition-transform motion-safe:duration-150 " +
              (expanded ? "rotate-90" : "")
            }
            aria-hidden="true"
          />
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${iconBg}`}
          >
            <ClipboardList className="size-4" aria-hidden="true" />
          </span>
          <h4 className="text-sm font-bold tracking-tight text-slate-900">
            {label}
          </h4>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${badgeBg}`}
          >
            {count}개
          </span>
          {!expanded ? (
            <span className="ml-auto text-[11px] font-medium text-slate-400">
              클릭해서 펼치기
            </span>
          ) : null}
        </button>
      </header>
      {expanded ? <div className="px-3 py-3">{children}</div> : null}
    </section>
  );
}

function JobFilterCard({
  active,
  label,
  subLabel,
  count,
  tone,
  editable,
  onClick,
  onRename,
}: {
  active: boolean;
  label: string;
  subLabel?: string;
  count: number;
  tone: "blue" | "emerald";
  editable?: boolean;
  onClick: () => void;
  onRename?: (next: string | null) => void;
}) {
  const Icon = tone === "emerald" ? Layers : FileText;
  const iconBg =
    active
      ? tone === "emerald"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-blue-100 text-blue-700"
      : "bg-slate-100 text-slate-500";
  const cardClass = active
    ? tone === "emerald"
      ? "border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200/60 shadow-md"
      : "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200/60 shadow-md"
    : "border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:bg-slate-50/60";
  const countClass = active
    ? tone === "emerald"
      ? "text-emerald-700"
      : "text-blue-700"
    : "text-slate-700";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  const commit = useCallback(() => {
    if (!onRename) {
      setEditing(false);
      return;
    }
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next !== label) onRename(next);
    setEditing(false);
  }, [draft, label, onRename]);

  const cancel = useCallback(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  return (
    <div
      className={
        "group relative flex w-[220px] shrink-0 items-center gap-3 rounded-xl border px-3.5 py-3 motion-safe:transition-all motion-safe:duration-150 " +
        cardClass
      }
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <button
        type="button"
        onClick={editing ? undefined : onClick}
        aria-pressed={active}
        title={label}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder={label}
            className="block w-full rounded-md border border-blue-300 bg-white px-1.5 py-0.5 text-sm font-bold text-slate-900 outline-none ring-2 ring-blue-100"
          />
        ) : (
          <div className="truncate text-sm font-bold tracking-tight text-slate-900">
            {label}
          </div>
        )}
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span
            className={`text-[15px] font-extrabold tabular-nums leading-none ${countClass}`}
          >
            {count.toLocaleString()}
          </span>
          <span className="text-[10.5px] font-semibold text-slate-400">개</span>
          {subLabel ? (
            <span className="truncate text-[10.5px] font-medium text-slate-400">
              · {subLabel}
            </span>
          ) : null}
        </div>
      </button>
      {editable && !editing && onRename ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(label);
            setEditing(true);
          }}
          className="absolute right-2 top-2 inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
          aria-label="작업 이름 편집"
          title="이름 편집"
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
    </div>
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
        "p-2 cursor-pointer transition-colors " +
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
