"use client";

import { createContext, useContext } from "react";

export interface QueueDrawerContextValue {
  /** Whether the drawer is currently shown. */
  open: boolean;
  /** Set the drawer's open/closed state explicitly. */
  setOpen: (next: boolean) => void;
  /** Flip the drawer's open/closed state. */
  toggle: () => void;
  /** Monotonic key for forcing QueuePanel to re-fetch (e.g. after CRUD). */
  refreshKey: number;
  /** Bump `refreshKey`, causing QueuePanel to re-fetch its jobs list. */
  triggerRefresh: () => void;
}

export const QueueDrawerContext = createContext<QueueDrawerContextValue | null>(
  null,
);

export function useQueueDrawer(): QueueDrawerContextValue {
  const ctx = useContext(QueueDrawerContext);
  if (!ctx) {
    throw new Error(
      "useQueueDrawer must be used inside the /import layout's QueueDrawerProvider.",
    );
  }
  return ctx;
}
