"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { DOMAIN_LABELS } from "../constants";
import type { BaseTask, TaskStatus } from "../types";
import { formatTaskDate } from "../utils/format";
import { TaskStatusBadge } from "./task-status-badge";

function deleteConfirmMessage(status: TaskStatus): string {
  if (status === "processing") {
    return "진행 중인 작업입니다. 취소하고 삭제할까요?";
  }
  if (status === "pending") {
    return "아직 시작되지 않은 작업입니다. 삭제할까요?";
  }
  return "이 작업과 결과를 삭제할까요?";
}

export function TaskRow({
  task,
  onAfterDelete,
  onOpen,
}: {
  task: BaseTask;
  onAfterDelete: (id: string) => void;
  onOpen?: (task: BaseTask) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const goToTask = () => {
    if (onOpen) {
      onOpen(task);
      return;
    }
    if (task.href) router.push(task.href);
  };

  const handleDelete = async () => {
    if (!task.onDelete) return;
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(deleteConfirmMessage(task.status));
    if (!ok) return;
    setDeleting(true);
    try {
      await task.onDelete();
      onAfterDelete(task.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-blue-200">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goToTask}
          className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {task.title}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {task.errorBadge ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
              {task.errorBadge}
            </span>
          ) : null}
          <TaskStatusBadge status={task.status} />
          {task.onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              aria-label={
                task.status === "processing" || task.status === "pending"
                  ? "작업 취소 후 삭제"
                  : "작업 삭제"
              }
              title={
                task.status === "processing" || task.status === "pending"
                  ? "작업 취소 후 삭제"
                  : "작업 삭제"
              }
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={goToTask}
        className="mt-1 flex w-full cursor-pointer items-center justify-between text-left text-xs text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="truncate">
          <span className="mr-2 rounded bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500">
            {DOMAIN_LABELS[task.domain]}
          </span>
          {task.subtitle}
        </span>
        <span className="shrink-0">{formatTaskDate(task.createdAt)}</span>
      </button>
    </div>
  );
}
