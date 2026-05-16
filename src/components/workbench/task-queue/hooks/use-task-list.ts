"use client";

import { useEffect, useState } from "react";

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
    const controller = new AbortController();
    let cancelled = false;

    const adapters =
      scope === "all"
        ? ALL_ADAPTERS
        : ALL_ADAPTERS.filter((a) => a.domain === scope);

    async function load() {
      if (cancelled) return;
      setLoading(true);
      try {
        const results = await Promise.all(
          adapters.map((adapter) =>
            adapter.fetchTasks(controller.signal).catch(() => [] as BaseTask[]),
          ),
        );
        if (cancelled) return;
        const flat = results
          .flat()
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        taskCache.set(scope, flat);
        setTasks(flat);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [scope, refreshKey, manualKey]);

  return {
    tasks,
    loading,
    reload: () => setManualKey((k) => k + 1),
  };
}
