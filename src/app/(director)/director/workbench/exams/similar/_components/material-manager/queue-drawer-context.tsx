"use client";

import { useTaskQueue } from "@/components/workbench/task-queue";

/**
 * Backward-compat shim (forked into the similar-exam material-manager). Mirrors
 * the original extraction-manage queue context, forwarding to the shared
 * `useTaskQueue()`.
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
