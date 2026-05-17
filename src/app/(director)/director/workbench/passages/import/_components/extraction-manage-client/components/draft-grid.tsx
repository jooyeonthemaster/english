"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Grid2X2,
  Grid3X3,
  Layers,
  LayoutGrid,
  Loader2,
  Pencil,
} from "lucide-react";

import { ACTIVE_STATUSES } from "@/components/workbench/task-queue/constants";
import { TaskStatusBadge } from "@/components/workbench/task-queue/components/task-status-badge";
import { formatTaskDateParts } from "@/components/workbench/task-queue/utils/format";
import type { TaskStatus } from "@/components/workbench/task-queue/types";

import type { M1PassageDraftWithJob } from "../types";
import { DraftCard } from "./draft-card";
import { DraftCardSkeleton } from "./draft-card-skeleton";
import { EmptyGridState } from "./empty-grid-state";

function mapJobStatusToTaskStatus(
  status: string | null | undefined,
): TaskStatus {
  switch (status) {
    case "PENDING":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "PARTIAL":
      return "partial";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "completed";
  }
}

export type GridCols = 2 | 3 | 4;

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
  selectedJobIds,
  totalDraftCount,
  onSelectJob,
  onRenameJob,
  onRenameSourceMaterial,
  groupIndexBySourceMaterialId,
}: DraftGridProps) {
  const showJobFilter = !inFolder && jobs.length > 1;

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
  const allJobDraftIds = useMemo(
    () => drafts.map((draft) => draft.id),
    [drafts],
  );

  return (
    <section className="min-w-0 pb-1">
      {showJobFilter ? (
        <div className="mb-4 flex min-w-0 shrink-0 items-stretch gap-3 overflow-x-auto pb-2">
          <JobFilterCard
            active={selectedJobIds.size === 0}
            label="전체"
            subLabel="모든 작업"
            count={totalDraftCount}
            draftIds={allJobDraftIds}
            tone="emerald"
            onClick={() => onSelectJob(null)}
          />
          {jobs.map((job) => {
            return (
              <JobFilterCard
                key={job.jobId}
                active={selectedJobIds.has(job.jobId)}
                label={job.label}
                subLabel={job.subLabel}
                count={job.count}
                draftIds={job.draftIds}
                tone="blue"
                editable
                createdAt={job.createdAt ?? null}
                thumbnailUrl={job.thumbnailUrl ?? null}
                status={job.status ?? null}
                onClick={() => onSelectJob(job.jobId)}
                onRename={(next) => onRenameJob(job.jobId, next)}
              />
            );
          })}
        </div>
      ) : null}

      <div className="mb-3 flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="shrink-0 text-sm font-bold tracking-tight text-slate-700">
          자료
          <span className="ml-1.5 text-xs font-normal tabular-nums text-slate-400">
            {drafts.length}개
          </span>
        </h3>
        <div className="flex-1" />
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
  derivedLabel,
  count,
  tone,
  expanded,
  allChecked,
  someChecked,
  onToggle,
  onToggleAllInGroup,
  sourceMaterialId,
  dragIds,
  onRenameSourceMaterial,
  children,
}: {
  label: string;
  /** Auto-derived label used when there is no teacher-set title. Shown as
   *  the input placeholder so the teacher can see what the default would
   *  revert to if they clear the field. */
  derivedLabel: string;
  count: number;
  tone: "blue" | "amber";
  expanded: boolean;
  allChecked: boolean;
  someChecked: boolean;
  onToggle: () => void;
  onToggleAllInGroup: (select: boolean) => void;
  sourceMaterialId: string | null;
  dragIds: string[];
  onRenameSourceMaterial: (id: string, title: string) => void;
  children: React.ReactNode;
}) {
  const dragRef = useRef<HTMLElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el || dragIds.length === 0) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: "draft-bulk", draftIds: dragIds }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [dragIds]);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someChecked && !allChecked;
    }
  }, [someChecked, allChecked]);

  const editable = sourceMaterialId !== null;
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(label);

  const commit = useCallback(() => {
    if (!sourceMaterialId) {
      setEditing(false);
      return;
    }
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0 || trimmed === label) {
      setEditing(false);
      setTitleDraft(label);
      return;
    }
    onRenameSourceMaterial(sourceMaterialId, trimmed);
    setEditing(false);
  }, [sourceMaterialId, titleDraft, label, onRenameSourceMaterial]);

  const cancel = useCallback(() => {
    setTitleDraft(label);
    setEditing(false);
  }, [label]);

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
    <section
      ref={dragRef}
      className={
        "overflow-hidden rounded-xl border-l-4 motion-safe:transition-opacity " +
        (isDragging
          ? "cursor-grabbing opacity-60 "
          : "cursor-grab active:cursor-grabbing ") +
        accent
      }
    >
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
        <div className="flex flex-1 items-center gap-2.5 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "그룹 접기" : "그룹 펼치기"}
            className="flex shrink-0 cursor-pointer items-center"
          >
            <ChevronRight
              className={
                "size-4 text-slate-400 motion-safe:transition-transform motion-safe:duration-150 " +
                (expanded ? "rotate-90" : "")
              }
              aria-hidden="true"
            />
          </button>
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${iconBg}`}
          >
            <ClipboardList className="size-4" aria-hidden="true" />
          </span>
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              maxLength={200}
              onChange={(e) => setTitleDraft(e.target.value)}
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
              placeholder={derivedLabel}
              className="min-w-0 flex-1 max-w-md rounded-md border border-blue-300 bg-white px-2 py-0.5 text-sm font-bold text-slate-900 outline-none ring-2 ring-blue-100"
            />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left transition-colors hover:opacity-90"
            >
              <h4 className="truncate text-sm font-bold tracking-tight text-slate-900">
                {label}
              </h4>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${badgeBg}`}
              >
                {count}개
              </span>
              {editable ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTitleDraft(label);
                    setEditing(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setTitleDraft(label);
                      setEditing(true);
                    }
                  }}
                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="시험지 이름 편집"
                  title="이름 편집"
                >
                  <Pencil className="size-3.5" />
                </span>
              ) : null}
              {!expanded ? (
                <span className="ml-auto text-[11px] font-medium text-slate-400">
                  클릭해서 펼치기
                </span>
              ) : null}
            </button>
          )}
        </div>
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
  draftIds,
  tone,
  editable,
  createdAt,
  thumbnailUrl,
  status,
  onClick,
  onRename,
}: {
  active: boolean;
  label: string;
  subLabel?: string;
  count: number;
  draftIds: string[];
  tone: "blue" | "emerald";
  editable?: boolean;
  createdAt?: number | null;
  thumbnailUrl?: string | null;
  status?: string | null;
  onClick: () => void;
  onRename?: (next: string | null) => void;
}) {
  const dragRef = useRef<HTMLElement>(null);
  const Icon = tone === "emerald" ? Layers : FileText;
  const activeRing =
    tone === "emerald"
      ? "border-emerald-400 ring-2 ring-emerald-200"
      : "border-blue-500 ring-2 ring-blue-200";
  const activeSurface =
    tone === "emerald"
      ? "bg-emerald-50 shadow-emerald-100/70"
      : "bg-blue-50 shadow-blue-100/70";
  const cardClass = active
    ? `${activeRing} ${activeSurface} shadow-md`
    : "border-slate-200 shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el || draftIds.length === 0) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: "draft-bulk", draftIds }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [draftIds]);

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

  const taskStatus = mapJobStatusToTaskStatus(status);
  const isActiveJob = status != null && ACTIVE_STATUSES.has(taskStatus);

  const dateParts =
    createdAt != null
      ? formatTaskDateParts(new Date(createdAt).toISOString())
      : null;

  return (
    <article
      ref={dragRef}
      role="button"
      tabIndex={0}
      onClick={editing ? undefined : onClick}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-pressed={active}
      title={label}
      className={
        "group relative flex w-[150px] shrink-0 flex-col overflow-hidden rounded-lg border bg-white motion-safe:transition-all motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (isDragging
          ? "cursor-grabbing opacity-60 "
          : "cursor-grab active:cursor-grabbing ") +
        cardClass
      }
    >
      <div className="relative h-[100px] w-[150px] shrink-0 overflow-hidden bg-slate-50">
        {thumbnailUrl ? (
          // Signed URLs change per fetch; no point in next/image optimization
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-slate-300">
            <Icon className="size-7" aria-hidden="true" />
          </div>
        )}
        {/* Count badge — always visible on the thumbnail, top-left */}
        <span className="absolute left-1 top-1 rounded-full bg-slate-900/75 px-1.5 py-0.5 text-[10.5px] font-bold text-white shadow-sm">
          {count.toLocaleString()}개
        </span>
        {active ? (
          <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10.5px] font-bold text-white shadow-sm ring-1 ring-white/70">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            선택됨
          </span>
        ) : null}
        {isActiveJob ? (
          <span
            className="absolute inset-0 flex items-center justify-center bg-slate-900/30"
            aria-label="진행 중"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-4 ring-white/70">
              <Loader2 className="size-7 animate-spin" aria-hidden="true" />
            </span>
          </span>
        ) : status ? (
          <span className="absolute right-1 top-1">
            <TaskStatusBadge status={taskStatus} />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <div className="flex min-w-0 items-start gap-1">
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
              className="block w-full min-w-0 rounded-md border border-blue-300 bg-white px-1.5 py-0.5 text-[13px] font-bold text-slate-900 outline-none ring-2 ring-blue-100"
            />
          ) : (
            <h4 className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-900">
              {label}
            </h4>
          )}
          {editable && !editing && onRename ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(label);
                setEditing(true);
              }}
              className="-mr-0.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700"
              aria-label="작업 이름 편집"
              title="이름 편집"
            >
              <Pencil className="size-2.5" />
            </button>
          ) : null}
        </div>
        {dateParts ? (
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[12px] font-medium text-slate-900">
            <span className="truncate">{dateParts.day}</span>
            <span className="shrink-0 tabular-nums">{dateParts.time}</span>
          </div>
        ) : subLabel ? (
          <p className="mt-0.5 truncate text-[12px] font-medium text-slate-900">
            {subLabel}
          </p>
        ) : null}
      </div>
    </article>
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
