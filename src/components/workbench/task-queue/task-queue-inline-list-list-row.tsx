"use client";

import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Loader2, Trash2 } from "lucide-react";
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "./constants";
import { TaskStatusBadge } from "./components/task-status-badge";
import type { BaseTask } from "./types";
import { formatTaskDate } from "./utils/format";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { clearCardTextSelection, preventCardDoubleClickTextSelection, shouldIgnoreCardClick, shouldIgnoreCardDoubleClick, shouldIgnoreCardSelectionClick, useDeferredCardSelectionClick } from "@/components/workbench/shared/card-click";
import { gridCardClass, gridIconClass, statToneClass } from "./task-queue-inline-list-helpers";
import { EditableTaskTitle, TaskCheckbox } from "./task-queue-inline-list-card-parts";
export function TaskListRow({
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
      <span className="hidden shrink-0 items-center rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 md:inline-flex">
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
