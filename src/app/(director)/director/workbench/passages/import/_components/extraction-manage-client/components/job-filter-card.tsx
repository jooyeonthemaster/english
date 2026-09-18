"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  Pencil,
} from "lucide-react";

import { ACTIVE_STATUSES } from "@/components/workbench/task-queue/constants";
import { TaskStatusBadge } from "@/components/workbench/task-queue/components/task-status-badge";
import { formatTaskDateParts } from "@/components/workbench/task-queue/utils/format";
import type { TaskStatus } from "@/components/workbench/task-queue/types";

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

export function JobFilterCard({
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
