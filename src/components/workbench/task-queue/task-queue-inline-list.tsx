"use client";

import type { MouseEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { ACTIVE_STATUSES, DOMAIN_LABELS, TERMINAL_STATUSES } from "./constants";
import { TaskCard } from "./components/task-card";
import { TaskEmptyState } from "./components/task-empty-state";
import { TaskStatusBadge } from "./components/task-status-badge";
import { useTaskList } from "./hooks/use-task-list";
import type { BaseTask, TaskDomain, TaskStatus } from "./types";
import { formatTaskDate } from "./utils/format";

type InlineListLayout = "horizontal" | "grid";

interface TaskQueueInlineListProps {
  /** Domain to filter by. Inline list always shows a single domain. */
  domain: TaskDomain;
  /** Optional title override (defaults to "{domain label} 작업 목록"). */
  title?: string;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /** Cap the number of rendered cards. Defaults to 20. */
  limit?: number;
  /** Horizontal thumbnail rail or workbench-style card grid. */
  layout?: InlineListLayout;
}

function gridCardClass(status: TaskStatus): string {
  switch (status) {
    case "processing":
      return "border-blue-200 bg-white";
    case "completed":
      return "border-emerald-200 bg-white";
    case "partial":
      return "border-amber-200 bg-white";
    case "failed":
      return "border-red-200 bg-white";
    case "cancelled":
      return "border-slate-200 bg-slate-50/70";
    case "pending":
    default:
      return "border-slate-200 bg-white";
  }
}

function gridIconClass(status: TaskStatus): string {
  switch (status) {
    case "processing":
      return "text-blue-600";
    case "completed":
      return "text-emerald-600";
    case "partial":
      return "text-amber-600";
    case "failed":
      return "text-red-500";
    case "cancelled":
      return "text-slate-400";
    case "pending":
    default:
      return "text-slate-500";
  }
}

function TaskGridStatusIcon({ status }: { status: TaskStatus }) {
  const className = `size-3 shrink-0 ${gridIconClass(status)}`;
  switch (status) {
    case "processing":
      return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />;
    case "completed":
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case "partial":
    case "failed":
      return <AlertTriangle className={className} aria-hidden="true" />;
    case "cancelled":
      return <XCircle className={className} aria-hidden="true" />;
    case "pending":
    default:
      return <Clock className={className} aria-hidden="true" />;
  }
}

function statToneClass(
  tone: NonNullable<BaseTask["stats"]>[number]["tone"] = "slate",
): string {
  switch (tone) {
    case "blue":
      return "bg-blue-50 text-blue-700";
    case "emerald":
      return "bg-emerald-50 text-emerald-700";
    case "amber":
      return "bg-amber-50 text-amber-700";
    case "red":
      return "bg-red-50 text-red-700";
    case "slate":
    default:
      return "bg-slate-50 text-slate-600";
  }
}

function TaskGridCard({
  task,
  onAfterDelete,
}: {
  task: BaseTask;
  onAfterDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const active = ACTIVE_STATUSES.has(task.status);
  const canDelete = Boolean(task.onDelete) && TERMINAL_STATUSES.has(task.status);

  const handleOpen = () => {
    if (task.href) router.push(task.href);
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!task.onDelete) return;
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm("이 작업과 결과를 삭제할까요?");
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
    <article
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpen();
        }
      }}
      role="button"
      tabIndex={0}
      className={`group relative flex min-h-[260px] cursor-pointer flex-col rounded-xl border p-4 transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${gridCardClass(task.status)}`}
    >
      {active ? (
        <div className="pointer-events-none absolute -inset-px animate-pulse rounded-xl border-2 border-blue-300/70" />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border border-slate-300 bg-white">
            <TaskGridStatusIcon status={task.status} />
          </span>
          <div className="min-w-0 flex-1">
            <h4
              className="truncate text-[13px] font-semibold text-slate-800 transition-colors group-hover:text-blue-600"
              title={task.title}
            >
              {task.title}
            </h4>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className={`text-[10px] font-medium ${gridIconClass(task.status)}`}>
                <TaskStatusBadge status={task.status} />
              </span>
              {task.errorBadge ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                  {task.errorBadge}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {canDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            aria-label="작업 삭제"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <p className="mt-2.5 min-h-[58px] max-h-[58px] overflow-hidden text-[11px] leading-relaxed text-slate-500">
        {task.description ?? task.subtitle}
      </p>

      {task.stats?.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {task.stats.slice(0, 4).map((stat) => (
            <div
              key={stat.label}
              className={`rounded-lg px-2.5 py-2 ${statToneClass(stat.tone)}`}
            >
              <div className="text-[10px] font-medium opacity-75">
                {stat.label}
              </div>
              <div className="mt-0.5 text-[13px] font-bold tabular-nums">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] font-medium text-slate-400">
          {task.subtitle}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[10px] font-medium">
        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">
          <Database className="size-3.5" aria-hidden="true" />
          {DOMAIN_LABELS[task.domain]}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-slate-500">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {formatTaskDate(task.createdAt)}
        </span>
      </div>

      {active ? (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-blue-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-700"
            style={{ width: task.status === "pending" ? "22%" : "68%" }}
          />
        </div>
      ) : null}
      {!active && task.href ? (
        <div className="absolute bottom-2 right-3 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[9px] font-medium text-blue-500">
            클릭하여 상세 보기
          </span>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Always-on, non-modal task list pinned to a page (e.g., below the input panel
 * on the extraction page). The default keeps the legacy horizontal thumbnail
 * rail, while `layout="grid"` renders a full workbench-style card grid.
 */
export function TaskQueueInlineList({
  domain,
  title,
  emptyMessage = "표시할 작업이 없습니다.",
  limit = 20,
  layout = "horizontal",
}: TaskQueueInlineListProps) {
  const { tasks, loading, reload } = useTaskList({
    scope: domain,
    refreshKey: 0,
  });

  const visible = tasks.slice(0, limit);
  const resolvedTitle = title ?? `${DOMAIN_LABELS[domain]} 작업 목록`;
  const grid = layout === "grid";

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Database className="size-4" aria-hidden="true" />
          </span>
          <h3 className="truncate text-base font-bold text-slate-950">
            {resolvedTitle}
          </h3>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-400">
            {tasks.length}개
          </span>
        </div>
        <button
          type="button"
          onClick={reload}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="작업 목록 새로고침"
        >
          <RefreshCw
            className={loading ? "size-4 animate-spin" : "size-4"}
            aria-hidden="true"
          />
        </button>
      </div>
      <div
        className={
          grid
            ? "min-w-0 overflow-visible bg-[#F4F6F9]"
            : "min-w-0 overflow-x-auto overflow-y-hidden"
        }
      >
        {visible.length === 0 ? (
          <div className="p-3">
            <TaskEmptyState message={emptyMessage} />
          </div>
        ) : grid ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-3">
            {visible.map((task) => (
              <TaskGridCard
                key={`${task.domain}:${task.id}`}
                task={task}
                onAfterDelete={() => reload()}
              />
            ))}
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
