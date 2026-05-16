"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Trash2 } from "lucide-react";

import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "../constants";
import type { BaseTask } from "../types";
import { formatTaskDateParts } from "../utils/format";
import { TaskStatusBadge } from "./task-status-badge";

export function TaskCard({
  task,
  onAfterDelete,
}: {
  task: BaseTask;
  onAfterDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleOpen = () => {
    if (task.href) router.push(task.href);
  };

  const handleDelete = async (event: React.MouseEvent<HTMLButtonElement>) => {
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

  const canDelete = task.onDelete && TERMINAL_STATUSES.has(task.status);
  const dateParts = formatTaskDateParts(task.createdAt);

  return (
    <article
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      role="button"
      tabIndex={0}
      className="flex w-[150px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* Landscape thumbnail — 150×100. Image is `object-cover object-top` so
          tall scans/PDFs show their top portion (title / first lines)
          instead of being letter-boxed or center-cropped. */}
      <div className="relative h-[100px] w-[150px] shrink-0 overflow-hidden bg-slate-50">
        {task.thumbnailUrl ? (
          // Signed URLs change per fetch; no point in next/image optimization
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={task.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-slate-300">
            <FileText className="size-6" aria-hidden="true" />
          </div>
        )}
        {ACTIVE_STATUSES.has(task.status) ? (
          <span
            className="absolute inset-0 flex items-center justify-center bg-slate-900/30"
            aria-label="진행 중"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-4 ring-white/70">
              <Loader2 className="size-7 animate-spin" aria-hidden="true" />
            </span>
          </span>
        ) : (
          <span className="absolute right-1 top-1">
            <TaskStatusBadge status={task.status} />
          </span>
        )}
        {task.errorBadge ? (
          <span className="absolute left-1 top-1 rounded-full bg-red-500/95 px-1.5 py-0.5 text-[9.5px] font-bold text-white shadow-sm">
            {task.errorBadge}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <div className="flex min-w-0 items-start gap-1">
          <h4
            className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-900"
            title={task.title}
          >
            {task.title}
          </h4>
          {canDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="-mr-0.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              aria-label="작업 삭제"
            >
              {deleting ? (
                <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-2.5" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
        {dateParts ? (
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[12px] font-medium text-slate-900">
            <span className="truncate">{dateParts.day}</span>
            <span className="shrink-0 tabular-nums">{dateParts.time}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
