"use client";

import { useTaskQueue } from "@/components/workbench/task-queue";

/**
 * Backward-compat shim for the original extraction-only queue context. The
 * real implementation now lives in `@/components/workbench/task-queue` and
 * is shared across every workbench domain. Existing callers continue using
 * `useQueueDrawer()` — this hook just forwards to `useTaskQueue()`.
 */
export interface QueueDrawerContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

export function useQueueDrawer(): QueueDrawerContextValue {
  const ctx = useTaskQueue();
  return {
    open: ctx.open,
    setOpen: ctx.setOpen,
    toggle: ctx.toggle,
    refreshKey: ctx.refreshKey,
    triggerRefresh: ctx.triggerRefresh,
  };
}
