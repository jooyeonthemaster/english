"use client";

import { PanelBottomOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { ALL_ADAPTERS } from "../adapters";
import { ACTIVE_STATUSES, POLL_INTERVAL_MS } from "../constants";
import { useTaskQueue } from "../context";
import type { BaseTask } from "../types";

const ACTIVE_COUNT_CACHE_KEY = "task-queue:active-count";

function readCachedActiveCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(ACTIVE_COUNT_CACHE_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function writeCachedActiveCount(count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_COUNT_CACHE_KEY, String(count));
}

/**
 * Renders the floating toggle button. The active-count badge is always
 * computed against ALL domains (not the panel's current scope) so that any
 * page can see "something is running somewhere" without opening the drawer.
 *
 * Initial value hydrates from localStorage so navigating between pages
 * doesn't flash the badge to empty before the first fetch resolves.
 */
export function TaskQueueToggle() {
  const { open, toggle, refreshKey } = useTaskQueue();
  const [activeCount, setActiveCount] = useState<number>(readCachedActiveCount);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      try {
        const results = await Promise.all(
          ALL_ADAPTERS.map((adapter) =>
            adapter.fetchTasks(controller.signal).catch(() => [] as BaseTask[]),
          ),
        );
        if (cancelled) return;
        const count = results
          .flat()
          .filter((task) => ACTIVE_STATUSES.has(task.status)).length;
        setActiveCount(count);
        writeCachedActiveCount(count);
      } catch {
        // Best-effort badge — silent on failure.
      }
    }

    void load();
    const timer = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  const tooltip =
    activeCount > 0
      ? `진행중/대기중 작업 ${activeCount}개`
      : "진행중인 작업 없음";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      aria-label={`작업 목록 열기 — ${tooltip}`}
      title={tooltip}
      className={
        "fixed bottom-24 right-8 z-40 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg motion-safe:transition-all motion-safe:duration-150 " +
        (open
          ? "border-blue-500 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
      }
    >
      <PanelBottomOpen className="size-4" aria-hidden="true" />
      작업 목록
      {activeCount > 0 ? (
        <span
          aria-hidden="true"
          className={
            "ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold " +
            (open ? "bg-white text-blue-700" : "bg-emerald-500 text-white")
          }
        >
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}
