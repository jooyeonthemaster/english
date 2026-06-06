"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { CalendarClock, CheckCircle2, FileText, Loader2, Pencil } from "lucide-react";

import { ACTIVE_STATUSES } from "@/components/workbench/task-queue/constants";
import { TaskStatusBadge } from "@/components/workbench/task-queue/components/task-status-badge";
import { formatTaskDate } from "@/components/workbench/task-queue/utils/format";
import type { TaskStatus } from "@/components/workbench/task-queue/types";
import { DetailActionButton } from "@/components/ui/detail-action-button";

function mapJobStatusToTaskStatus(status: string | null | undefined): TaskStatus {
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

export interface MaterialJobCardProps {
  /** This job is the one currently open in the review panel. */
  active: boolean;
  /** This job is bulk-selected via its checkbox. */
  checked: boolean;
  label: string;
  /** Total number of extracted materials (자료) in this job — the 분모. */
  count: number;
  /** How many of those materials have been analyzed — the 분자. */
  analyzedCount: number;
  draftIds: string[];
  createdAt: number | null;
  thumbnailUrl?: string | null;
  status?: string | null;
  onClick: () => void;
  onToggleCheck: () => void;
  onRename: (next: string | null) => void;
  /** 설정 시 마키(영역 드래그) 선택 대상이 된다(DragSelect 가 읽는 식별자). */
  dragItemId?: string;
}

/**
 * Larger, fluid material card used by the embedded 자료 관리 board (left drawer
 * on the passage-create page). Unlike the tiny fixed-width `JobCard`, this card
 * stretches to fill a grid column and surfaces an at-a-glance analysis-progress
 * footer ("N건 중 M건 분석 완료") so a teacher can see how far each extraction
 * job has been processed without opening it.
 */
export function MaterialJobCard({
  active,
  checked,
  label,
  count,
  analyzedCount,
  draftIds,
  createdAt,
  thumbnailUrl,
  status,
  onClick,
  onToggleCheck,
  onRename,
  dragItemId,
}: MaterialJobCardProps) {
  const dragRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [isDragging, setIsDragging] = useState(false);

  const canDrag = draftIds.length > 0;

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
  const dateLabel =
    createdAt != null ? formatTaskDate(new Date(createdAt).toISOString()) : null;

  // ── Analysis progress (footer) ──
  const hasItems = count > 0;
  const safeAnalyzed = Math.min(analyzedCount, count);
  const allAnalyzed = hasItems && safeAnalyzed >= count;
  const someAnalyzed = safeAnalyzed > 0;
  const pct = hasItems ? Math.min(100, Math.round((safeAnalyzed / count) * 100)) : 0;

  const progressTone = !hasItems
    ? { surface: "border-slate-100 bg-slate-50", text: "text-slate-400", track: "bg-slate-200", bar: "bg-slate-300" }
    : allAnalyzed
      ? { surface: "border-emerald-100 bg-emerald-50/70", text: "text-emerald-700", track: "bg-emerald-100", bar: "bg-emerald-500" }
      : someAnalyzed
        ? { surface: "border-blue-100 bg-blue-50/60", text: "text-blue-700", track: "bg-blue-100", bar: "bg-blue-500" }
        : { surface: "border-slate-100 bg-slate-50", text: "text-slate-500", track: "bg-slate-200", bar: "bg-slate-300" };

  const cardClass = active
    ? "border-blue-500 ring-2 ring-blue-200 shadow-md shadow-blue-100/60"
    : checked
      ? "border-blue-300 ring-1 ring-blue-100 shadow-sm"
      : "border-slate-200 shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md";

  return (
    <article
      ref={dragRef}
      data-drag-item-id={dragItemId}
      role="button"
      tabIndex={0}
      onClick={editing ? undefined : onToggleCheck}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleCheck();
        }
      }}
      aria-pressed={checked}
      title={label}
      className={
        "group relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-white text-left motion-safe:transition-all motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (canDrag
          ? isDragging
            ? "cursor-grabbing opacity-60 "
            : "cursor-pointer "
          : "cursor-pointer ") +
        cardClass
      }
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-slate-100">
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
            <FileText className="size-8" aria-hidden="true" />
          </div>
        )}

        {/* Selection checkbox */}
        <span
          role="checkbox"
          aria-checked={checked}
          aria-label="자료 선택"
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
          className="absolute left-1.5 top-1.5 z-10 inline-flex cursor-pointer items-center justify-center rounded-md bg-white/90 p-1 shadow-sm ring-1 ring-slate-200 backdrop-blur-[1px] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <input
            type="checkbox"
            checked={checked}
            readOnly
            tabIndex={-1}
            className="pointer-events-none size-3.5 cursor-pointer rounded border-slate-300 text-blue-600"
          />
        </span>

        {/* Status badge */}
        {!isActiveJob && status ? (
          <span className="absolute right-1.5 top-1.5 z-10">
            <TaskStatusBadge status={taskStatus} />
          </span>
        ) : null}

        {/* Currently-open marker */}
        {active ? (
          <span className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10.5px] font-bold text-white shadow-sm ring-1 ring-white/70">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            선택됨
          </span>
        ) : null}

        {/* In-flight overlay */}
        {isActiveJob ? (
          <span
            className="absolute inset-0 flex items-center justify-center bg-slate-900/30"
            aria-label="진행 중"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-4 ring-white/70">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            </span>
          </span>
        ) : null}
      </div>

      {/* Title + date */}
      <div className="min-w-0 px-2.5 pt-2">
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
              className="block w-full min-w-0 rounded-md border border-blue-300 bg-white px-1.5 py-0.5 text-[12px] font-bold text-slate-900 outline-none ring-2 ring-blue-100"
            />
          ) : (
            <h4 className="min-w-0 flex-1 truncate text-[12px] font-bold leading-snug text-slate-900">
              {label}
            </h4>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(label);
                setEditing(true);
              }}
              className="-mr-0.5 mt-px inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="작업 이름 편집"
              title="이름 편집"
            >
              <Pencil className="size-3" />
            </button>
          ) : null}
        </div>
        {dateLabel ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
            <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">{dateLabel}</span>
          </span>
        ) : null}
      </div>

      {!editing ? (
        <div className="px-2.5 pb-2 pt-2">
          <DetailActionButton
            className="w-full justify-center"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          />
        </div>
      ) : null}

      {/* Analysis-progress footer */}
      <div className={"mt-auto border-t px-2.5 py-1.5 " + progressTone.surface}>
        <p className={"whitespace-nowrap text-[10.5px] font-bold leading-none " + progressTone.text}>
          {hasItems ? (
            <>
              <span className="tabular-nums">{count}</span>건 중{" "}
              <span className="tabular-nums">{safeAnalyzed}</span>건 분석 완료
            </>
          ) : (
            "자료 준비 중"
          )}
        </p>
        {hasItems ? (
          <div className={"mt-1.5 h-1 overflow-hidden rounded-full " + progressTone.track}>
            <div
              className={"h-full rounded-full transition-[width] duration-300 " + progressTone.bar}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
