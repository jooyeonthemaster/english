"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  CalendarClock,
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

import { ACTIVE_STATUSES } from "@/components/workbench/task-queue/constants";
import { TaskStatusBadge } from "@/components/workbench/task-queue/components/task-status-badge";
import { formatTaskDate } from "@/components/workbench/task-queue/utils/format";
import { DetailActionButton } from "@/components/ui/detail-action-button";
import type { TaskStatus } from "@/components/workbench/task-queue/types";
import { MODES, type ExtractionMode } from "@/lib/extraction/modes";
import type { ExtractionJobStatus } from "@/lib/extraction/types";

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

export interface JobCardProps {
  variant?: "compact" | "detailed";
  active?: boolean;
  label: string;
  subLabel?: string;
  count: number;
  draftIds?: string[];
  tone?: "blue" | "emerald";
  editable?: boolean;
  createdAt?: number | null;
  thumbnailUrl?: string | null;
  status?: ExtractionJobStatus | string | null;
  onClick: () => void;
  onRename?: (next: string | null) => void;
  /** When provided, renders a selection checkbox at the top-left of the
   *  thumbnail. The handler is invoked on toggle; the card's primary onClick
   *  is suppressed so checking does not also open the job. */
  checked?: boolean;
  onToggleCheck?: () => void;

  // ── detailed-only props ──
  mode?: ExtractionMode;
  totalPages?: number;
  successPages?: number;
  draftResultCount?: number;
  savedResultCount?: number;
  onDelete?: () => void;
  deleting?: boolean;
}

export function JobCard({
  variant = "compact",
  active = false,
  label,
  subLabel,
  count,
  draftIds = [],
  tone = "blue",
  editable,
  createdAt,
  thumbnailUrl,
  status,
  onClick,
  onRename,
  checked,
  onToggleCheck,
  mode,
  totalPages,
  successPages,
  draftResultCount,
  savedResultCount,
  onDelete,
  deleting,
}: JobCardProps) {
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

  const canDrag = variant === "compact" && draftIds.length > 0;

  useEffect(() => {
    const el = dragRef.current;
    if (!el || !canDrag) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: "draft-bulk", draftIds }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [canDrag, draftIds]);

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
  const isProcessing = status === "PROCESSING";

  const dateLabel =
    createdAt != null
      ? formatTaskDate(new Date(createdAt).toISOString())
      : null;

  const modeShort = mode ? MODES[mode]?.shortLabel : null;

  // Detailed-only progress
  const progressPct =
    isProcessing &&
    typeof totalPages === "number" &&
    totalPages > 0 &&
    typeof successPages === "number"
      ? Math.min(100, Math.max(0, (successPages / totalPages) * 100))
      : null;

  // Detailed-only result summary line
  const resultSummary = (() => {
    if (variant !== "detailed") return null;
    const parts: string[] = [];
    const reviewNeeded = draftResultCount ?? 0;
    const reviewCompleted = savedResultCount ?? 0;
    const reviewTotal = reviewCompleted + reviewNeeded;
    if (typeof successPages === "number" && typeof totalPages === "number") {
      parts.push(`${successPages}/${totalPages}장`);
    }
    if (reviewTotal > 0) {
      parts.push(`검수완료 ${reviewCompleted}/${reviewTotal}`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  })();

  const showRename = variant === "compact" && editable && !editing && onRename;
  const showDelete = variant === "detailed" && onDelete;
  const selectionMode = Boolean(onToggleCheck);
  const handleCardAction = () => {
    if (onToggleCheck) {
      onToggleCheck();
      return;
    }
    onClick();
  };

  return (
    <article
      ref={dragRef}
      role="button"
      tabIndex={0}
      onClick={editing ? undefined : handleCardAction}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardAction();
        }
      }}
      aria-pressed={selectionMode ? Boolean(checked) : active}
      title={label}
      className={
        "group relative flex shrink-0 flex-col overflow-hidden rounded-lg border bg-white motion-safe:transition-all motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (variant === "compact" ? "w-[78px] " : "w-[150px] ") +
        (selectionMode
          ? "cursor-pointer "
          : canDrag
          ? isDragging
            ? "cursor-grabbing opacity-60 "
            : "cursor-grab active:cursor-grabbing "
          : "cursor-pointer ") +
        cardClass
      }
    >
      <div
        className={
          "relative shrink-0 overflow-hidden bg-slate-50 " +
          (variant === "compact" ? "h-[46px] w-[78px]" : "h-[100px] w-[150px]")
        }
      >
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
        {onToggleCheck ? (
          <span
            role="checkbox"
            aria-checked={checked ?? false}
            aria-label="작업 선택"
            tabIndex={0}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheck();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onToggleCheck();
              }
            }}
            className="absolute left-0.5 top-0.5 z-10 inline-flex cursor-pointer items-center justify-center rounded bg-white/85 p-0.5 shadow-sm ring-1 ring-slate-200 backdrop-blur-[1px] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <input
              type="checkbox"
              checked={checked ?? false}
              readOnly
              tabIndex={-1}
              className="size-3 cursor-pointer rounded border-slate-300 text-blue-600 pointer-events-none"
            />
          </span>
        ) : null}
        <div className="absolute right-1 top-1 z-10 flex flex-col items-end gap-1">
          <span
            className={
              "rounded-full bg-slate-900/75 font-bold text-white shadow-sm " +
              (variant === "compact"
                ? "px-1 py-0 text-[9px]"
                : "px-1.5 py-0.5 text-[10.5px]")
            }
          >
            {count.toLocaleString()}개
          </span>
          {!isActiveJob && status ? (
            <TaskStatusBadge status={taskStatus} />
          ) : null}
        </div>
        {modeShort ? (
          <span className="absolute bottom-1 right-1 rounded border border-white/40 bg-slate-900/70 px-1 py-0 text-[9.5px] font-bold text-white">
            {modeShort}
          </span>
        ) : null}
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
        ) : null}
        {progressPct !== null ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-900/30">
            <div
              className="h-full bg-blue-500 transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}
      </div>
      <div
        className={
          "min-w-0 " +
          (variant === "compact" ? "px-1 py-0.5" : "px-2 py-1.5")
        }
      >
        <div className="flex min-w-0 items-start gap-0.5">
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
            <h4
              className={
                "min-w-0 flex-1 truncate font-bold text-slate-900 " +
                (variant === "compact" ? "text-[10.5px]" : "text-[13px]")
              }
            >
              {label}
            </h4>
          )}
          {showRename ? (
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
          {showDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              disabled={deleting}
              className="-mr-0.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
              aria-label="추출 작업 삭제"
              title="삭제"
            >
              {deleting ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <Trash2 className="size-2.5" />
              )}
            </button>
          ) : null}
        </div>
        {dateLabel ? (
          <div className={variant === "compact" ? "mt-0.5 flex" : "mt-1 flex"}>
            <span
              className={
                "inline-flex min-w-0 items-center gap-0.5 rounded bg-slate-50 font-medium text-slate-500 " +
                (variant === "compact"
                  ? "px-1 py-0 text-[9px]"
                  : "px-1.5 py-0.5 text-[10px]")
              }
            >
              <CalendarClock
                className={
                  variant === "compact"
                    ? "size-2.5 shrink-0"
                    : "size-3 shrink-0"
                }
                aria-hidden="true"
              />
              <span className="truncate tabular-nums">{dateLabel}</span>
            </span>
          </div>
        ) : subLabel ? (
          <p className="mt-0.5 truncate text-[12px] font-medium text-slate-900">
            {subLabel}
          </p>
        ) : null}
        {resultSummary ? (
          <p className="mt-0.5 truncate text-[10.5px] font-medium text-slate-500">
            {resultSummary}
          </p>
        ) : null}
        {!editing ? (
          <DetailActionButton
            className={
              variant === "compact"
                ? "mt-1 w-full justify-center px-1"
                : "mt-2 w-full justify-center"
            }
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          />
        ) : null}
      </div>
    </article>
  );
}
