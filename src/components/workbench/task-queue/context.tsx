"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { TaskScope, TaskDomain } from "./types";

interface TaskQueueContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
  refreshKey: number;
  triggerRefresh: () => void;
  defaultDomain: TaskScope;
  scope: TaskScope;
  setScope: (next: TaskScope) => void;
}

export const TaskQueueContext = createContext<TaskQueueContextValue | null>(null);

export function TaskQueueProvider({
  children,
  defaultDomain = "all",
}: {
  children: ReactNode;
  defaultDomain?: TaskDomain | "all";
}) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scope, setScope] = useState<TaskScope>(defaultDomain);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      refreshKey,
      triggerRefresh,
      defaultDomain,
      scope,
      setScope,
    }),
    [open, toggle, refreshKey, triggerRefresh, defaultDomain, scope],
  );

  return (
    <TaskQueueContext.Provider value={value}>
      {children}
    </TaskQueueContext.Provider>
  );
}

export function useTaskQueue(): TaskQueueContextValue {
  const ctx = useContext(TaskQueueContext);
  if (!ctx) {
    throw new Error(
      "useTaskQueue must be used inside a <TaskQueueProvider>.",
    );
  }
  return ctx;
}
