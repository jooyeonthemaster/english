"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "../constants";
import { useTaskQueue } from "../context";
import { useTaskList } from "../hooks/use-task-list";
import type { BaseTask } from "../types";
import { TaskDomainTabs } from "./task-domain-tabs";
import { TaskEmptyState } from "./task-empty-state";
import { TaskRow } from "./task-row";
import {
  TaskStatusFilter,
  type StatusFilterValue,
} from "./task-status-filter";

export function TaskQueuePanel() {
  const { scope, setScope, refreshKey, setOpen } = useTaskQueue();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");

  const { tasks, loading, reload } = useTaskList({ scope, refreshKey });

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "running") return task.status === "processing";
      if (statusFilter === "waiting") return task.status === "pending";
      return TERMINAL_STATUSES.has(task.status);
    });
  }, [tasks, statusFilter]);

  const runningCount = useMemo(
    () => tasks.filter((task) => ACTIVE_STATUSES.has(task.status)).length,
    [tasks],
  );

  const handleAfterDelete = (id: string) => {
    const removed = tasks.find((t) => t.id === id);
    reload();
    if (removed?.href && router) {
      // No-op: router cleanup is handled by host pages on next nav.
    }
  };

  const handleOpen = (task: BaseTask) => {
    if (task.href) router.push(task.href);
    setOpen(false);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">작업 목록</h2>
          <p className="mt-1 text-xs text-slate-500">
            백그라운드 작업 상태를 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runningCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-700">
              진행 {runningCount}
            </span>
          ) : null}
          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-sky-700">
            {tasks.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <TaskDomainTabs scope={scope} onChange={setScope} />

        <div className="flex items-center justify-between gap-2">
          <TaskStatusFilter value={statusFilter} onChange={setStatusFilter} />
          <button
            type="button"
            onClick={reload}
            className="cursor-pointer rounded-md border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="작업 목록 새로고침"
          >
            <RefreshCw
              className={loading ? "size-3.5 animate-spin" : "size-3.5"}
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <TaskEmptyState message="표시할 작업이 없습니다." />
          ) : (
            filtered.map((task) => (
              <TaskRow
                key={`${task.domain}:${task.id}`}
                task={task}
                onAfterDelete={handleAfterDelete}
                onOpen={handleOpen}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
