"use client";

import { useContext, type ReactNode } from "react";

import { TaskQueueContext, TaskQueueProvider } from "./context";
import { TaskQueueDrawer } from "./components/task-queue-drawer";
import { TaskQueueToggle } from "./components/task-queue-toggle";
import type { TaskDomain } from "./types";

/**
 * Mounts the floating toggle button + drawer + provider for a page or layout.
 *
 * Nested-safe: if a `TaskQueueHost` already exists higher in the tree (e.g.
 * a parent route segment mounted one), this component degrades to a
 * passthrough so we don't double-render the toggle/drawer or fight over the
 * provider scope. The outermost host wins.
 *
 * `defaultDomain` controls which domain tab is selected when the drawer
 * opens. Pass the current page's domain so the user starts on their own
 * tasks; "전체" and other tabs are reachable from the panel.
 */
export function TaskQueueHost({
  children,
  defaultDomain = "all",
}: {
  children: ReactNode;
  defaultDomain?: TaskDomain | "all";
}) {
  const outer = useContext(TaskQueueContext);
  if (outer) {
    return <>{children}</>;
  }
  return (
    <TaskQueueProvider defaultDomain={defaultDomain}>
      {children}
      <TaskQueueToggle />
      <TaskQueueDrawer />
    </TaskQueueProvider>
  );
}
