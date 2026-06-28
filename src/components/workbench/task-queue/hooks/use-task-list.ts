"use client";

import { useEffect, useState } from "react";

import { startAdaptivePoll } from "@/lib/adaptive-poll";

import { ALL_ADAPTERS } from "../adapters";
import { POLL_INTERVAL_MS } from "../constants";
import type { BaseTask, TaskScope } from "../types";

interface UseTaskListResult {
  tasks: BaseTask[];
  loading: boolean;
  reload: () => void;
}

/**
 * Module-level cache keyed by scope. Survives page navigation within the
 * same client session (cleared on full reload). Lets a freshly-mounted
 * list show the last-known tasks immediately while the background poll
 * fetches a fresh snapshot. Cuts the "empty → flash" gap that used to
 * show on every nav.
 *
 * Tradeoff: data can be up to POLL_INTERVAL_MS stale on first paint —
 * acceptable since the next poll repaints with fresh data.
 */
const taskCache = new Map<TaskScope, BaseTask[]>();

export function useTaskList({
  scope,
  refreshKey,
}: {
  scope: TaskScope;
  refreshKey: number;
}): UseTaskListResult {
  const [tasks, setTasks] = useState<BaseTask[]>(
    () => taskCache.get(scope) ?? [],
  );
  const [loading, setLoading] = useState(false);
  const [manualKey, setManualKey] = useState(0);

  useEffect(() => {
    // Seed from cache when scope changes (e.g. domain tab switch).
    const cached = taskCache.get(scope);
    if (cached) setTasks(cached);
  }, [scope]);

  useEffect(() => {
    // "all" aggregates every domain's adapter; a specific scope narrows to its
    // own adapter(s). Each adapter still tags tasks with its `domain`, so the
    // combined list stays distinguishable in the row UI.
    const adapters =
      scope === "all"
        ? ALL_ADAPTERS
        : ALL_ADAPTERS.filter((a) => a.domain === scope);

    return startAdaptivePoll({
      activeMs: POLL_INTERVAL_MS,
      idleMs: 5 * 60_000,
      run: async (signal) => {
        setLoading(true);
        try {
          const results = await Promise.all(
            adapters.map((adapter) =>
              adapter.fetchTasks(signal).catch(() => [] as BaseTask[]),
            ),
          );
          if (signal.aborted) return null;
          const flat = results
            .flat()
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
          taskCache.set(scope, flat);
          setTasks(flat);
          return flat.map((t) => `${t.id}:${t.status}`).join("|");
        } catch {
          // Parity with the other pollers: a thrown run() is a failed poll, not
          // a loop-killer (adaptive-poll also re-arms on reject as a backstop).
          return null;
        } finally {
          if (!signal.aborted) setLoading(false);
        }
      },
    });
  }, [scope, refreshKey, manualKey]);

  return {
    tasks,
    loading,
    reload: () => setManualKey((k) => k + 1),
  };
}
