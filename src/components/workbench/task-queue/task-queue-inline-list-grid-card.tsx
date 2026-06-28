"use client";

import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "./constants";
import { TaskStatusBadge } from "./components/task-status-badge";
import type { BaseTask } from "./types";
import { formatTaskDate } from "./utils/format";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { clearCardTextSelection, preventCardDoubleClickTextSelection, shouldIgnoreCardClick, shouldIgnoreCardDoubleClick, shouldIgnoreCardSelectionClick, useDeferredCardSelectionClick } from "@/components/workbench/shared/card-click";
import { gridCardClass, gridIconClass, statToneClass } from "./task-queue-inline-list-helpers";
import { EditableTaskTitle, TaskCheckbox } from "./task-queue-inline-list-card-parts";
export function TaskGridCard({
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
                <span className="text-[10px] font-medium tabular-nums text-slate-500">
                  {formatTaskDate(task.createdAt)}
                </span>
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
              </div>
            </div>
          </div>

          {canDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-red-300 text-red-500 transition-all hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
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
              className="ml-auto h-7 w-7 rounded-md"
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
