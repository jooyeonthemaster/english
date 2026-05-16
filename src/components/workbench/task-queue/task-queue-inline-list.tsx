"use client";

import { Database, RefreshCw } from "lucide-react";

import { DOMAIN_LABELS } from "./constants";
import { TaskCard } from "./components/task-card";
import { TaskEmptyState } from "./components/task-empty-state";
import { useTaskList } from "./hooks/use-task-list";
import type { TaskDomain } from "./types";

interface TaskQueueInlineListProps {
  /** Domain to filter by. Inline list always shows a single domain. */
  domain: TaskDomain;
  /** Optional title override (defaults to "{domain label} 작업 목록"). */
  title?: string;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /** Cap the number of rendered cards. Defaults to 20. */
  limit?: number;
}

/**
 * Always-on, non-modal task list pinned to a page (e.g., below the input
 * panel on the extraction page). Renders a horizontally-scrolling row of
 * cards — each with a thumbnail (first-page preview when available),
 * status badge, title, subtitle, and timestamp.
 *
 * The floating drawer toggle is still mounted by `TaskQueueHost` and stays
 * usable for cross-domain or "전체" views.
 */
export function TaskQueueInlineList({
  domain,
  title,
  emptyMessage = "표시할 작업이 없습니다.",
  limit = 20,
}: TaskQueueInlineListProps) {
  const { tasks, loading, reload } = useTaskList({
    scope: domain,
    refreshKey: 0,
  });

  const visible = tasks.slice(0, limit);
  const resolvedTitle = title ?? `${DOMAIN_LABELS[domain]} 작업 목록`;

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Database className="size-3.5" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-bold text-slate-950">{resolvedTitle}</h3>
          <span className="text-xs font-medium tabular-nums text-slate-400">
            {tasks.length}개
          </span>
        </div>
        <button
          type="button"
          onClick={reload}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="작업 목록 새로고침"
        >
          <RefreshCw
            className={loading ? "size-3 animate-spin" : "size-3"}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        {visible.length === 0 ? (
          <div className="p-3">
            <TaskEmptyState message={emptyMessage} />
          </div>
        ) : (
          <div className="flex items-start gap-2.5 p-2.5">
            {visible.map((task) => (
              <TaskCard
                key={`${task.domain}:${task.id}`}
                task={task}
                onAfterDelete={() => reload()}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
