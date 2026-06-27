import { Grid2x2, Grid3x3, List } from "lucide-react";
import type { BaseTask, TaskStatus } from "./types";
import type { ViewModeCycleOption } from "@/components/workbench/shared/view-mode-cycle-button";
import type { GridViewMode } from "./task-queue-inline-list-types";
export function gridCardClass(status: TaskStatus): string {
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

export function gridIconClass(status: TaskStatus): string {
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

export function statToneClass(
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

export const VIEW_MODE_OPTIONS = [
  { value: "grid-3", label: "3열 보기", Icon: Grid3x3 },
  { value: "grid-2", label: "2열 보기", Icon: Grid2x2 },
  { value: "list", label: "목록 보기", Icon: List },
] satisfies ReadonlyArray<ViewModeCycleOption<GridViewMode>>;
