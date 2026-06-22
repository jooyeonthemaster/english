"use client";

import type {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Grid2x2,
  Grid3x3,
  List,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  ACTIVE_STATUSES,
  DOMAIN_LABELS,
  DOMAIN_UNITS,
  TERMINAL_STATUSES,
} from "./constants";
import { TaskCard } from "./components/task-card";
import { DragSelect } from "@/components/ui/drag-select";
import { TaskEmptyState } from "./components/task-empty-state";
import { TaskStatusBadge } from "./components/task-status-badge";
import { useTaskList } from "./hooks/use-task-list";
import type { BaseTask, TaskDomain, TaskStatus } from "./types";
import { formatTaskDate } from "./utils/format";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardClick,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "@/components/workbench/shared/card-click";

type InlineListLayout = "horizontal" | "grid";
export type GridViewMode = "grid-3" | "grid-2" | "list";
export type TaskInlineSortOrder =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc";

interface TaskQueueInlineListProps {
  /** Domain to filter by. Inline list always shows a single domain. */
  domain: TaskDomain;
  /** Optional title override (defaults to "{domain label} 작업 목록"). */
  title?: string;
  /** Optional small helper text shown beside the header actions. */
  headerNote?: string;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /** Cap the number of rendered cards. Defaults to 20. */
  limit?: number;
  /** Horizontal thumbnail rail or workbench-style card grid. */
  layout?: InlineListLayout;
  /** Strip the header + outer section chrome. Renders only the card grid. */
  bare?: boolean;
  /** Intercept card clicks (e.g., to open a side drawer instead of navigating). */
  onTaskClick?: (task: BaseTask) => void;
  /** Controlled grid view mode. When provided, overrides internal state. */
  viewMode?: GridViewMode;
  /** Notified when the user picks a different view mode. */
  onViewModeChange?: (mode: GridViewMode) => void;
  /** Disable 3-column grid mode, usually while a right-side drawer is open. */
  grid3Disabled?: boolean;
  /** Free-text search applied to task title/subtitle. */
  searchQuery?: string;
  /** Restrict to a single task status; "ALL" / undefined disables. */
  statusFilter?: TaskStatus | "ALL";
  /** Sort order for the visible cards. Defaults to newest first. */
  sortOrder?: TaskInlineSortOrder;
  /** Notified whenever the filtered+capped task count changes. */
  onVisibleCountChange?: (count: number) => void;
  /** Notified whenever the filtered+capped task list changes. */
  onVisibleTasksChange?: (tasks: BaseTask[]) => void;
  /** Per-task checkbox state. When provided, each card renders a checkbox. */
  isTaskChecked?: (task: BaseTask) => boolean | "indeterminate";
  /** Toggle handler invoked when the checkbox is clicked. */
  onToggleTaskCheck?: (task: BaseTask) => void;
  /**
   * Drag payload provider for the whole task card. When provided, cards
   * become draggable using `@atlaskit/pragmatic-drag-and-drop`. Return `null`
   * to opt a specific task out of being dragged (e.g., if it has no items).
   * The shape mirrors `draft-card.tsx`: callers typically return
   * `{ type: "draft-bulk", draftIds: string[] }` so existing folder drop
   * targets can accept the payload unchanged.
   */
  getTaskDragData?: (task: BaseTask) => Record<string, unknown> | null;
  /**
   * Optional count of items inside the task. When > 1, the drag preview
   * renders a "+N" badge styled like the draft-card bulk preview.
   */
  getTaskDragCount?: (task: BaseTask) => number;
  /**
   * Optional rename handler. When provided, the task title becomes inline-
   * editable (click → input → blur/Enter commits). Receive the new label —
   * pass an empty string to clear back to the auto-derived name. The handler
   * should persist the change server-side and refresh the list so the new
   * title is reflected.
   */
  onRenameTask?: (task: BaseTask, nextTitle: string) => void | Promise<void>;
  /**
   * When provided, the section gains a header collapse/expand button and (by
   * default) a vertical resize handle at the bottom. State is persisted to
   * localStorage under `${storageKey}:collapsed` and `${storageKey}:height`.
   * Set `resizable: false` to drop the grab handle and let the body grow with
   * its content instead of being height-clamped. Ignored when `bare` is true.
   */
  collapsible?: {
    storageKey: string;
    resizable?: boolean;
    defaultHeight?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  /**
   * Optimistic placeholder cards prepended to the fetched list — e.g. a job
   * that was just submitted but isn't in the server snapshot yet. Any pending
   * task whose `id` later matches a fetched task is dropped automatically.
   */
  pendingTasks?: BaseTask[];
  /**
   * External refresh signal. When this number changes, the list refetches
   * immediately instead of waiting for the next poll. Defaults to 0.
   */
  refreshSignal?: number;
  /**
   * 마키(영역 드래그) 선택을 켠다. `marqueeSelectedTaskIds`(현재 선택된 task id 집합)와
   * `onMarqueeChange`(새 집합)를 함께 넘기면 카드 그리드/목록을 DragSelect 로 감싸고
   * 각 카드에 식별자를 부여한다. `marqueeBoundaryRef` 로 드래그 시작 영역(자료 관리 패널
   * 등)을 지정할 수 있다. 셋 다 없으면 기존 동작(체크박스 선택만).
   */
  marqueeSelectedTaskIds?: Set<string>;
  onMarqueeChange?: (next: Set<string>) => void;
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
  /**
   * Optional per-domain extra actions rendered next to each card's 상세보기
   * button (grid + list layouts). Receives the task; return null to skip a
   * given task. Additive — domains that don't pass it are unaffected.
   */
  renderTaskActions?: (task: BaseTask) => ReactNode;
}

function gridCardClass(status: TaskStatus): string {
  switch (status) {
    case "processing":
      return "border-slate-200 bg-white";
    case "completed":
      return "border-slate-200 bg-white";
    case "partial":
      return "border-slate-200 bg-white";
    case "failed":
      return "border-red-200 bg-white";
    case "cancelled":
      return "border-slate-200 bg-slate-50/70";
    case "pending":
    default:
      return "border-slate-200 bg-white";
  }
}

function gridIconClass(status: TaskStatus): string {
  switch (status) {
    case "processing":
      return "text-blue-600";
    case "completed":
      return "text-slate-500";
    case "partial":
      return "text-slate-500";
    case "failed":
      return "text-red-500";
    case "cancelled":
      return "text-slate-400";
    case "pending":
    default:
      return "text-slate-500";
  }
}

function TaskCheckbox({
  state,
  onToggle,
}: {
  state: boolean | "indeterminate";
  onToggle: () => void;
}) {
  const indeterminate = state === "indeterminate";
  const checked = state === true;
  const active = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }
      }}
      className={
        "flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-slate-300 bg-white hover:border-blue-300")
      }
    >
      {indeterminate ? (
        <span className="block h-[2px] w-[10px] rounded bg-white" />
      ) : checked ? (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5l3.5 3.5L13 5" />
        </svg>
      ) : null}
    </button>
  );
}

function statToneClass(
  tone: NonNullable<BaseTask["stats"]>[number]["tone"] = "slate",
): string {
  switch (tone) {
    case "blue":
      return "bg-slate-50 text-slate-600";
    case "emerald":
      return "bg-slate-50 text-slate-600";
    case "amber":
      return "bg-slate-50 text-slate-600";
    case "red":
      return "bg-red-50 text-red-700";
    case "slate":
    default:
      return "bg-slate-50 text-slate-600";
  }
}

function EditableTaskTitle({
  title,
  onRename,
  className,
  size = "card",
}: {
  title: string;
  onRename: (next: string) => void | Promise<void>;
  className: string;
  size?: "card" | "row";
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setValue(title);
  }, [title, editing]);

  const commit = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === title.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [onRename, title, value]);

  const cancel = useCallback(() => {
    setValue(title);
    setEditing(false);
  }, [title]);

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={200}
        placeholder="작업 이름"
        className={
          (size === "row"
            ? "h-6 rounded border border-blue-300 px-1.5 text-[13px] "
            : "h-7 rounded-md border border-blue-300 px-2 text-[13px] ") +
          "w-full min-w-0 bg-white font-semibold text-slate-900 outline-none ring-2 ring-blue-100 placeholder:font-medium placeholder:text-slate-400"
        }
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setValue(title);
        setEditing(true);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      title="작업 이름 편집"
      className={
        "group/edit inline-flex min-w-0 max-w-full cursor-text items-center gap-1 rounded text-left " +
        className
      }
    >
      <span className="min-w-0 truncate">{title}</span>
      <Pencil
        className="size-3 shrink-0 text-slate-300 transition-colors group-hover/edit:text-blue-500"
        aria-hidden="true"
      />
    </button>
  );
}

function TaskGridCard({
  task,
  onAfterDelete,
  showThumbnail = true,
  onClick,
  checked,
  onToggleCheck,
  getDragData,
  dragCount,
  onRename,
  dragItemId,
  renderActions,
}: {
  task: BaseTask;
  onAfterDelete: (id: string) => void;
  showThumbnail?: boolean;
  onClick?: (task: BaseTask) => void;
  checked?: boolean | "indeterminate";
  onToggleCheck?: () => void;
  getDragData?: () => Record<string, unknown> | null;
  dragCount?: number;
  onRename?: (next: string) => void | Promise<void>;
  /** 설정 시 마키(영역 드래그) 선택 대상이 된다(DragSelect 가 읽는 식별자). */
  dragItemId?: string;
  renderActions?: ReactNode;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();
  const dragRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    getData?: () => Record<string, unknown> | null;
    count: number;
  }>({ getData: getDragData, count: dragCount ?? 0 });
  dragStateRef.current = { getData: getDragData, count: dragCount ?? 0 };
  const active = ACTIVE_STATUSES.has(task.status);
  const canDelete =
    Boolean(task.onDelete) && TERMINAL_STATUSES.has(task.status);

  useEffect(() => {
    if (!getDragData) return;
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => {
        const data = dragStateRef.current.getData?.();
        return data ?? {};
      },
      canDrag: () => {
        const data = dragStateRef.current.getData?.();
        return data != null;
      },
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        const count = dragStateRef.current.count;
        if (count <= 1) return;
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: ({ container }) => {
            const rect = container.getBoundingClientRect();
            return { x: Math.min(120, rect.width / 2), y: 24 };
          },
          render: ({ container }) => {
            const source = dragRef.current;
            if (!source) return;
            const rect = source.getBoundingClientRect();
            const wrapper = document.createElement("div");
            wrapper.style.position = "relative";
            wrapper.style.width = `${rect.width}px`;
            wrapper.style.height = `${rect.height}px`;
            const backCount = Math.min(2, count - 1);
            for (let i = backCount; i >= 1; i--) {
              const back = document.createElement("div");
              back.style.position = "absolute";
              back.style.inset = "0";
              back.style.transform = `translate(${i * 6}px, ${i * 6}px)`;
              back.style.borderRadius = "12px";
              back.style.background = "white";
              back.style.border = "1px solid rgb(226, 232, 240)";
              back.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
              wrapper.appendChild(back);
            }
            const clone = source.cloneNode(true) as HTMLElement;
            clone.style.position = "relative";
            clone.style.width = `${rect.width}px`;
            clone.style.margin = "0";
            clone.style.opacity = "1";
            clone.style.transform = "none";
            wrapper.appendChild(clone);
            const badge = document.createElement("div");
            badge.textContent = String(count);
            badge.style.position = "absolute";
            badge.style.top = "-10px";
            badge.style.right = "-10px";
            badge.style.minWidth = "28px";
            badge.style.height = "28px";
            badge.style.padding = "0 8px";
            badge.style.borderRadius = "14px";
            badge.style.background = "#2563eb";
            badge.style.color = "white";
            badge.style.fontSize = "13px";
            badge.style.fontWeight = "700";
            badge.style.display = "flex";
            badge.style.alignItems = "center";
            badge.style.justifyContent = "center";
            badge.style.boxShadow = "0 4px 12px rgba(37,99,235,0.35)";
            badge.style.fontVariantNumeric = "tabular-nums";
            wrapper.appendChild(badge);
            container.appendChild(wrapper);
          },
        });
      },
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [getDragData]);

  const handleOpen = () => {
    if (onClick) {
      onClick(task);
      return;
    }
    if (task.href) router.push(task.href);
  };
  const canOpen = Boolean(onClick || task.href);
  const selectionMode = Boolean(onToggleCheck);

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    if (selectionMode) {
      if (event.detail > 1 || shouldIgnoreCardSelectionClick(event)) return;
      scheduleCardSelectionClick(() => onToggleCheck?.());
      return;
    }
    if (shouldIgnoreCardClick(event)) return;
    handleOpen();
  };

  const handleCardDoubleClick = (event: MouseEvent<HTMLElement>) => {
    cancelPendingCardSelectionClick();
    clearCardTextSelection();
    if (!canOpen || shouldIgnoreCardDoubleClick(event)) return;
    handleOpen();
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!task.onDelete) return;
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm("이 작업과 결과를 삭제할까요?");
    if (!ok) return;
    setDeleting(true);
    try {
      await task.onDelete();
      onAfterDelete(task.id);
    } finally {
      setDeleting(false);
    }
  };

  const draggableEnabled = Boolean(getDragData);
  return (
    <article
      ref={(node) => {
        dragRef.current = node;
      }}
      data-drag-item-id={dragItemId}
      onClick={handleCardClick}
      onMouseDown={preventCardDoubleClickTextSelection}
      onDoubleClick={handleCardDoubleClick}
      onKeyDown={(event) => {
        if (event.key === " " && selectionMode) {
          event.preventDefault();
          onToggleCheck?.();
          return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        handleOpen();
      }}
      role="button"
      tabIndex={0}
      className={
        `group relative flex min-h-[241px] flex-row overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${gridCardClass(task.status)} ` +
        (selectionMode
          ? "cursor-pointer"
          : draggableEnabled
            ? isDragging
              ? "cursor-grabbing opacity-50"
              : "cursor-grab active:cursor-grabbing"
            : "cursor-pointer")
      }
    >
      {active ? (
        <div className="pointer-events-none absolute -inset-px animate-pulse rounded-xl border-2 border-blue-300/70" />
      ) : null}

      {showThumbnail ? (
        <div className="relative aspect-[210/297] w-[170px] shrink-0 self-start overflow-hidden border-r border-slate-100 bg-white">
          {task.thumbnailUrl ? (
            // Signed URLs change per fetch; no point in next/image optimization
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={task.thumbnailUrl}
              alt=""
              loading="lazy"
              className="size-full object-contain"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-slate-50 text-slate-300">
              <FileText className="size-8" aria-hidden="true" />
            </div>
          )}
          {active ? (
            <span
              className="absolute inset-0 flex items-center justify-center bg-slate-900/30"
              aria-label="진행 중"
            >
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-4 ring-white/70">
                <Loader2 className="size-7 animate-spin" aria-hidden="true" />
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {onToggleCheck ? (
              <span className="mt-0.5">
                <TaskCheckbox
                  state={checked ?? false}
                  onToggle={onToggleCheck}
                />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              {onRename ? (
                <EditableTaskTitle
                  title={task.title}
                  onRename={onRename}
                  className="text-[13px] font-semibold text-slate-800 hover:text-blue-600"
                  size="card"
                />
              ) : (
                <h4
                  className="truncate text-[13px] font-semibold text-slate-800 transition-colors group-hover:text-blue-600"
                  title={task.title}
                >
                  {task.title}
                </h4>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`text-[10px] font-medium ${gridIconClass(task.status)}`}
                >
                  <TaskStatusBadge status={task.status} />
                </span>
                {task.errorBadge ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                    {task.errorBadge}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  {formatTaskDate(task.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {canDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              aria-label="작업 삭제"
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>

        {task.stats?.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {task.stats.slice(0, 4).map((stat) => (
              <div
                key={stat.label}
                className={`rounded-lg px-2.5 py-2 ${statToneClass(stat.tone)}`}
              >
                <div className="text-[10px] font-medium opacity-75">
                  {stat.label}
                </div>
                <div className="mt-0.5 text-[13px] font-bold tabular-nums">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] font-medium text-slate-400">
            {task.subtitle}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-3 text-[10px] font-medium">
          {renderActions}
          {canOpen ? (
            <CardDetailIconButton
              className="ml-auto size-7 rounded-md"
              iconClassName="size-3.5"
              onClick={(e) => {
                e.stopPropagation();
                handleOpen();
              }}
            />
          ) : null}
        </div>
      </div>

      {active ? (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-blue-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-700"
            style={{ width: task.status === "pending" ? "22%" : "68%" }}
          />
        </div>
      ) : null}
    </article>
  );
}

function TaskListRow({
  task,
  onAfterDelete,
  onClick,
  checked,
  onToggleCheck,
  getDragData,
  dragCount,
  onRename,
  dragItemId,
  renderActions,
}: {
  task: BaseTask;
  onAfterDelete: (id: string) => void;
  onClick?: (task: BaseTask) => void;
  checked?: boolean | "indeterminate";
  onToggleCheck?: () => void;
  getDragData?: () => Record<string, unknown> | null;
  dragCount?: number;
  onRename?: (next: string) => void | Promise<void>;
  /** 설정 시 마키(영역 드래그) 선택 대상이 된다(DragSelect 가 읽는 식별자). */
  dragItemId?: string;
  renderActions?: ReactNode;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();
  const dragRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    getData?: () => Record<string, unknown> | null;
    count: number;
  }>({ getData: getDragData, count: dragCount ?? 0 });
  dragStateRef.current = { getData: getDragData, count: dragCount ?? 0 };
  const active = ACTIVE_STATUSES.has(task.status);
  const canDelete =
    Boolean(task.onDelete) && TERMINAL_STATUSES.has(task.status);

  useEffect(() => {
    if (!getDragData) return;
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => {
        const data = dragStateRef.current.getData?.();
        return data ?? {};
      },
      canDrag: () => {
        const data = dragStateRef.current.getData?.();
        return data != null;
      },
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [getDragData]);

  const handleOpen = () => {
    if (onClick) {
      onClick(task);
      return;
    }
    if (task.href) router.push(task.href);
  };
  const canOpen = Boolean(onClick || task.href);
  const selectionMode = Boolean(onToggleCheck);

  const handleRowClick = (event: MouseEvent<HTMLElement>) => {
    if (selectionMode) {
      if (event.detail > 1 || shouldIgnoreCardSelectionClick(event)) return;
      scheduleCardSelectionClick(() => onToggleCheck?.());
      return;
    }
    if (shouldIgnoreCardClick(event)) return;
    handleOpen();
  };

  const handleRowDoubleClick = (event: MouseEvent<HTMLElement>) => {
    cancelPendingCardSelectionClick();
    clearCardTextSelection();
    if (!canOpen || shouldIgnoreCardDoubleClick(event)) return;
    handleOpen();
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!task.onDelete) return;
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm("이 작업과 결과를 삭제할까요?");
    if (!ok) return;
    setDeleting(true);
    try {
      await task.onDelete();
      onAfterDelete(task.id);
    } finally {
      setDeleting(false);
    }
  };

  const draggableEnabled = Boolean(getDragData);
  return (
    <article
      ref={(node) => {
        dragRef.current = node;
      }}
      data-drag-item-id={dragItemId}
      onClick={handleRowClick}
      onMouseDown={preventCardDoubleClickTextSelection}
      onDoubleClick={handleRowDoubleClick}
      onKeyDown={(event) => {
        if (event.key === " " && selectionMode) {
          event.preventDefault();
          onToggleCheck?.();
          return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        handleOpen();
      }}
      role="button"
      tabIndex={0}
      className={
        `group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${gridCardClass(task.status)} ` +
        (selectionMode
          ? "cursor-pointer"
          : draggableEnabled
            ? isDragging
              ? "cursor-grabbing opacity-50"
              : "cursor-grab active:cursor-grabbing"
            : "cursor-pointer")
      }
    >
      {onToggleCheck ? (
        <TaskCheckbox state={checked ?? false} onToggle={onToggleCheck} />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {onRename ? (
            <EditableTaskTitle
              title={task.title}
              onRename={onRename}
              className="text-[13px] font-semibold text-slate-800 hover:text-blue-600"
              size="row"
            />
          ) : (
            <h4
              className="truncate text-[13px] font-semibold text-slate-800 transition-colors group-hover:text-blue-600"
              title={task.title}
            >
              {task.title}
            </h4>
          )}
          <span
            className={`shrink-0 text-[10px] font-medium ${gridIconClass(task.status)}`}
          >
            <TaskStatusBadge status={task.status} />
          </span>
          {task.errorBadge ? (
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
              {task.errorBadge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {task.subtitle}
        </p>
      </div>
      {task.stats?.length ? (
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {task.stats.slice(0, 4).map((stat) => (
            <div
              key={stat.label}
              className={`rounded px-2 py-1 text-center ${statToneClass(stat.tone)}`}
            >
              <div className="text-[9px] font-medium opacity-75">
                {stat.label}
              </div>
              <div className="text-[11px] font-bold tabular-nums">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <span className="hidden shrink-0 items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 md:inline-flex">
        <CalendarClock className="size-3.5" aria-hidden="true" />
        {formatTaskDate(task.createdAt)}
      </span>
      {renderActions}
      {canOpen ? (
        <CardDetailIconButton
          className="size-7 rounded-md shadow-none"
          iconClassName="size-3.5"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
        />
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          aria-label="작업 삭제"
        >
          {deleting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-3.5" aria-hidden="true" />
          )}
        </button>
      ) : null}
      {active ? (
        <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-lg bg-blue-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-700"
            style={{ width: task.status === "pending" ? "22%" : "68%" }}
          />
        </div>
      ) : null}
    </article>
  );
}

const VIEW_MODE_OPTIONS = [
  { value: "grid-3", label: "3열 보기", Icon: Grid3x3 },
  { value: "grid-2", label: "2열 보기", Icon: Grid2x2 },
  { value: "list", label: "목록 보기", Icon: List },
] satisfies ReadonlyArray<ViewModeCycleOption<GridViewMode>>;

function ViewModeToggle({
  value,
  onChange,
  grid3Disabled = false,
}: {
  value: GridViewMode;
  onChange: (mode: GridViewMode) => void;
  grid3Disabled?: boolean;
}) {
  const options = VIEW_MODE_OPTIONS.map((option) =>
    option.value === "grid-3"
      ? {
          ...option,
          disabled: grid3Disabled,
          disabledTitle:
            "드로어가 열려 있는 동안 3열 보기는 사용할 수 없습니다",
        }
      : option,
  );

  return (
    <ViewModeCycleButton value={value} options={options} onChange={onChange} />
  );
}

/**
 * Always-on, non-modal task list pinned to a page (e.g., below the input panel
 * on the extraction page). The default keeps the legacy horizontal thumbnail
 * rail, while `layout="grid"` renders a full workbench-style card grid.
 */
export function TaskQueueInlineList({
  domain,
  title,
  headerNote,
  emptyMessage = "표시할 작업이 없습니다.",
  limit = 20,
  layout = "horizontal",
  bare = false,
  onTaskClick,
  viewMode: controlledViewMode,
  onViewModeChange,
  grid3Disabled = false,
  searchQuery,
  statusFilter,
  sortOrder,
  onVisibleCountChange,
  onVisibleTasksChange,
  isTaskChecked,
  onToggleTaskCheck,
  getTaskDragData,
  getTaskDragCount,
  onRenameTask,
  collapsible,
  pendingTasks,
  refreshSignal,
  marqueeSelectedTaskIds,
  onMarqueeChange,
  marqueeBoundaryRef,
  renderTaskActions,
}: TaskQueueInlineListProps) {
  const marqueeEnabled = Boolean(marqueeSelectedTaskIds && onMarqueeChange);
  const sectionRef = useRef<HTMLElement | null>(null);
  const {
    tasks: fetchedTasks,
    loading,
    reload,
  } = useTaskList({
    scope: domain,
    refreshKey: refreshSignal ?? 0,
  });
  // 낙관적 placeholder를 앞에 끼워넣되, 실제 잡이 들어오면(같은 id) 자동 제외.
  const tasks = useMemo(() => {
    if (!pendingTasks || pendingTasks.length === 0) return fetchedTasks;
    const realIds = new Set(fetchedTasks.map((t) => t.id));
    const extras = pendingTasks.filter((p) => !realIds.has(p.id));
    return extras.length ? [...extras, ...fetchedTasks] : fetchedTasks;
  }, [pendingTasks, fetchedTasks]);
  const [internalViewMode, setInternalViewMode] =
    usePersistedState<GridViewMode>(
      `smoat:view-mode:task-queue-inline:${domain}`,
      "grid-3",
      (v): v is GridViewMode =>
        v === "grid-3" || v === "grid-2" || v === "list",
    );
  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (mode: GridViewMode) => {
    if (grid3Blocked && mode === "grid-3") return;
    if (onViewModeChange) onViewModeChange(mode);
    if (controlledViewMode === undefined) setInternalViewMode(mode);
  };

  // Auto-collapse the 3-column grid to 2 columns when the grid itself gets too
  // narrow (sidebar/review drawer open, smaller window). Measured on the grid
  // container, not the viewport, so it reacts to layout changes around it. This
  // single signal drives both the rendered columns AND the view toggle, so the
  // two never disagree.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [autoGrid3Disabled, setAutoGrid3Disabled] = useState(false);

  useEffect(() => {
    if (layout !== "grid") return;
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = (width: number) => {
      // 3 columns need ~900px before cards get thin enough to break.
      setAutoGrid3Disabled(width > 0 && width < 900);
    };
    measure(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);

  const grid3Blocked = grid3Disabled || autoGrid3Disabled;
  const effectiveViewMode =
    grid3Blocked && viewMode === "grid-3" ? "grid-2" : viewMode;

  // Persist the fallback only when grid-3 is *externally* disabled — an auto
  // width-collapse must not overwrite the user's saved preference, so 3 columns
  // come back once there's room again.
  useEffect(() => {
    if (!grid3Disabled || viewMode !== "grid-3") return;
    if (onViewModeChange) onViewModeChange("grid-2");
  }, [grid3Disabled, onViewModeChange, viewMode]);

  const collapseEnabled = Boolean(collapsible) && !bare;
  const resizeEnabled = collapseEnabled && collapsible?.resizable !== false;
  const collapseKey = collapsible ? `${collapsible.storageKey}:collapsed` : "";
  const heightKey = collapsible ? `${collapsible.storageKey}:height` : "";
  const minHeight = collapsible?.minHeight ?? 160;
  const maxHeight = collapsible?.maxHeight ?? 720;
  const defaultHeight = collapsible?.defaultHeight ?? 320;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!collapseEnabled || typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(collapseKey) === "1";
    } catch {
      return false;
    }
  });
  const [bodyHeight, setBodyHeight] = useState<number>(() => {
    if (!collapseEnabled || typeof window === "undefined") return defaultHeight;
    try {
      const raw = window.localStorage.getItem(heightKey);
      if (!raw) return defaultHeight;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return defaultHeight;
      return Math.min(maxHeight, Math.max(minHeight, n));
    } catch {
      return defaultHeight;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(collapseKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [collapseKey]);
  const beginResize = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = bodyHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          maxHeight,
          Math.max(minHeight, startHeight + (ev.clientY - startY)),
        );
        setBodyHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(heightKey, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [bodyHeight, heightKey, maxHeight, minHeight],
  );
  const resetHeight = useCallback(() => {
    setBodyHeight(defaultHeight);
    try {
      window.localStorage.setItem(heightKey, String(defaultHeight));
    } catch {
      /* ignore */
    }
  }, [defaultHeight, heightKey]);

  const visible = useMemo(() => {
    let result = tasks;

    const trimmed = searchQuery?.trim().toLowerCase() ?? "";
    if (trimmed) {
      result = result.filter((task) => {
        const title = task.title?.toLowerCase() ?? "";
        const subtitle = task.subtitle?.toLowerCase() ?? "";
        return title.includes(trimmed) || subtitle.includes(trimmed);
      });
    }

    if (statusFilter && statusFilter !== "ALL") {
      result = result.filter((task) => task.status === statusFilter);
    }

    if (sortOrder) {
      const sorted = [...result];
      sorted.sort((a, b) => {
        if (sortOrder === "name_asc") {
          return (a.title ?? "").localeCompare(b.title ?? "", "ko");
        }
        if (sortOrder === "name_desc") {
          return (b.title ?? "").localeCompare(a.title ?? "", "ko");
        }
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
      });
      result = sorted;
    }

    return result.slice(0, limit);
  }, [tasks, searchQuery, statusFilter, sortOrder, limit]);

  useEffect(() => {
    onVisibleCountChange?.(visible.length);
  }, [onVisibleCountChange, visible.length]);

  useEffect(() => {
    onVisibleTasksChange?.(visible);
  }, [onVisibleTasksChange, visible]);

  const resolvedTitle = title ?? `${DOMAIN_LABELS[domain]} 작업 목록`;
  const HeaderIcon =
    domain === "extraction" ? ExtractionTaskListIcon : Database;
  const grid = layout === "grid";
  const isList = grid && effectiveViewMode === "list";
  // Column count follows effectiveViewMode, which already accounts for the
  // auto width-collapse above — so grid and toggle stay in sync.
  const gridColsClass =
    effectiveViewMode === "grid-2" ? "grid-cols-2" : "grid-cols-3";

  const bodyPadding = bare ? "" : "p-3";
  const sectionClass = bare
    ? "flex min-w-0 flex-col"
    : "flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm";
  const bodyClass = bare
    ? "min-w-0"
    : grid
      ? "min-w-0 overflow-visible bg-[#F4F6F9]"
      : "min-w-0 overflow-x-auto overflow-y-hidden";
  const effectiveMarqueeBoundaryRef = marqueeBoundaryRef ?? sectionRef;

  return (
    <section ref={sectionRef} className={sectionClass}>
      {bare ? null : (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500 ring-1 ring-slate-200">
              <HeaderIcon className="size-4" aria-hidden="true" />
            </span>
            <h3 className="truncate text-[13px] font-bold text-slate-900">
              {resolvedTitle}
            </h3>
            <span
              aria-hidden="true"
              className="shrink-0 text-[11px] font-medium text-slate-300"
            >
              ·
            </span>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
              {tasks.length}
              {DOMAIN_UNITS[domain]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerNote ? (
              <span className="shrink-0 text-[11px] font-medium text-slate-400">
                {headerNote}
              </span>
            ) : null}
            <button
              type="button"
              onClick={reload}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="작업 목록 새로고침"
            >
              <RefreshCw
                className={loading ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
            </button>
            {grid ? (
              <ViewModeToggle
                value={effectiveViewMode}
                onChange={setViewMode}
                grid3Disabled={grid3Blocked}
              />
            ) : null}
            {collapseEnabled && collapsed ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={false}
                title="작업 목록 펼치기"
                className="inline-flex h-8 cursor-pointer items-center gap-1 px-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
              >
                <ChevronDown className="size-3.5" aria-hidden="true" />
                <span>펼치기</span>
              </button>
            ) : null}
          </div>
        </div>
      )}
      {collapseEnabled && collapsed ? null : (
        <>
          <div
            ref={bodyRef}
            className={bodyClass}
            style={
              resizeEnabled
                ? { height: bodyHeight, overflowY: "auto" }
                : undefined
            }
          >
            {visible.length === 0 ? (
              <div className={bodyPadding || "p-3"}>
                <TaskEmptyState message={emptyMessage} />
              </div>
            ) : grid ? (
              isList ? (
                (() => {
                  const rows = visible.map((task) => (
                    <TaskListRow
                      key={`${task.domain}:${task.id}`}
                      task={task}
                      onAfterDelete={() => reload()}
                      onClick={onTaskClick}
                      checked={isTaskChecked?.(task) ?? false}
                      onToggleCheck={
                        onToggleTaskCheck
                          ? () => onToggleTaskCheck(task)
                          : undefined
                      }
                      getDragData={
                        getTaskDragData
                          ? () => getTaskDragData(task)
                          : undefined
                      }
                      dragCount={getTaskDragCount?.(task)}
                      onRename={
                        onRenameTask
                          ? async (next) => {
                              await onRenameTask(task, next);
                              reload();
                            }
                          : undefined
                      }
                      dragItemId={marqueeEnabled ? task.id : undefined}
                      renderActions={renderTaskActions?.(task)}
                    />
                  ));
                  const cls = `flex flex-col gap-2 ${bodyPadding}`.trim();
                  return marqueeEnabled ? (
                    <DragSelect
                      className={cls}
                      value={marqueeSelectedTaskIds!}
                      onChange={onMarqueeChange!}
                      boundaryRef={effectiveMarqueeBoundaryRef}
                    >
                      {rows}
                    </DragSelect>
                  ) : (
                    <div className={cls}>{rows}</div>
                  );
                })()
              ) : (
                (() => {
                  const cards = visible.map((task) => (
                    <TaskGridCard
                      key={`${task.domain}:${task.id}`}
                      task={task}
                      onAfterDelete={() => reload()}
                      onClick={onTaskClick}
                      checked={isTaskChecked?.(task) ?? false}
                      onToggleCheck={
                        onToggleTaskCheck
                          ? () => onToggleTaskCheck(task)
                          : undefined
                      }
                      getDragData={
                        getTaskDragData
                          ? () => getTaskDragData(task)
                          : undefined
                      }
                      dragCount={getTaskDragCount?.(task)}
                      onRename={
                        onRenameTask
                          ? async (next) => {
                              await onRenameTask(task, next);
                              reload();
                            }
                          : undefined
                      }
                      dragItemId={marqueeEnabled ? task.id : undefined}
                      renderActions={renderTaskActions?.(task)}
                    />
                  ));
                  const cls =
                    `grid gap-3 ${bodyPadding} ${gridColsClass}`.trim();
                  return marqueeEnabled ? (
                    <DragSelect
                      className={cls}
                      value={marqueeSelectedTaskIds!}
                      onChange={onMarqueeChange!}
                      boundaryRef={effectiveMarqueeBoundaryRef}
                    >
                      {cards}
                    </DragSelect>
                  ) : (
                    <div className={cls}>{cards}</div>
                  );
                })()
              )
            ) : (
              <div className="flex items-start gap-2.5 p-2.5">
                {visible.map((task) => (
                  <TaskCard
                    key={`${task.domain}:${task.id}`}
                    task={task}
                    onAfterDelete={() => reload()}
                  />
                ))}
              </div>
            )}
          </div>
          {collapseEnabled ? (
            <div className="relative flex items-center justify-end px-4 pb-1 pt-1">
              {resizeEnabled ? (
                <div
                  onPointerDown={beginResize}
                  onDoubleClick={resetHeight}
                  title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
                  className="group/jhandle absolute left-1/2 top-1/2 inline-flex h-3 w-[200px] -translate-x-1/2 -translate-y-1/2 cursor-row-resize items-center justify-center px-1 select-none"
                >
                  <div className="h-0.5 w-full rounded-full bg-slate-200 transition-colors group-hover/jhandle:bg-blue-400 group-active/jhandle:bg-blue-500" />
                </div>
              ) : null}
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded
                title="작업 목록 접기"
                className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
              >
                <ChevronUp className="size-3.5" aria-hidden="true" />
                <span>접기</span>
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
