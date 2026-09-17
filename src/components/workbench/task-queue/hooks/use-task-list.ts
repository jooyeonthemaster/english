"use client";

import { useEffect, useRef, useState } from "react";

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
  /** 직전 폴에서 본 활성 작업 유무 — 백오프 상한 결정에만 쓴다. */
  const anyActiveRef = useRef(false);

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
      // 진행 중에는 상한 30초(유휴는 기존 5분). 한 틱이 어댑터 수만큼 요청을
      // 내므로 하드 핀은 비싸고, 5분 상한은 끝난 작업이 목록에 몇 분씩 「진행
      // 중」으로 남게 한다 — 그 사이를 끊는 값이다(26-08-18).
      idleMs: () => (anyActiveRef.current ? 30_000 : 5 * 60_000),
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
          // 진행 중 여부는 위 idleMs 상한이 소비한다(서명은 순수 유지).
          anyActiveRef.current = flat.some(
            (t) => t.status === "pending" || t.status === "processing",
          );
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
