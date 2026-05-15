"use client";

import { STATUS_LABELS } from "../constants";
import type { TaskStatus } from "../types";

const STATUS_CLASSES: Record<TaskStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  processing: "bg-sky-50 text-sky-700",
  completed: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10.5px] font-bold " +
        STATUS_CLASSES[status]
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
