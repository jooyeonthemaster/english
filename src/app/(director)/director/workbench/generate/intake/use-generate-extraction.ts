"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { extractionAdapter } from "@/components/workbench/task-queue/adapters/extraction-adapter";

export interface ExtractionPromotedResult {
  /** Passage ids created by promoting this job's drafts (may be empty). */
  passageIds: string[];
  jobId: string;
  /** True when the job finished PARTIAL (some pages failed). */
  partial: boolean;
}

export interface PendingExtraction {
  /** Stable client id (survives the begin → attach transition; card key). */
  id: string;
  /** Real extraction job id once the job is created (null while uploading). */
  jobId: string | null;
  /** Expected passage count (crop regions) — drives per-passage loading cards. */
  count: number;
}

interface UseGenerateExtractionArgs {
  /** Called once a finished extraction job's drafts are promoted to Passages. */
  onPromoted: (result: ExtractionPromotedResult) => void;
}

/**
 * Bridges image/PDF extraction (started from the generate page) into the
 * selectable passage set, AND surfaces per-passage loading cards in the 내 지문
 * list while it runs.
 *
 * Lifecycle: begin (button pressed → loading cards appear immediately, even
 * before the job exists) → attach (job created → start polling its status) →
 * complete (promote drafts → Passages, hand ids to the page) → clearPending
 * (page drops the cards once the real passages have loaded → seamless swap).
 * fail drops the cards on upload/extraction failure.
 *
 * Reuses extractionAdapter.fetchTasks (status mapping, PASSAGE_ONLY filter) and
 * startAdaptivePoll (hidden-tab pause + visibility resume).
 */
export function useGenerateExtraction({ onPromoted }: UseGenerateExtractionArgs) {
  // Real job ids we still poll for status (removed on completion/fail).
  const inFlightRef = useRef<Set<string>>(new Set());
  const promotingRef = useRef<Set<string>>(new Set());
  const [pollCount, setPollCount] = useState(0);
  const [pending, setPending] = useState<PendingExtraction[]>([]);

  const onPromotedRef = useRef(onPromoted);
  useEffect(() => {
    onPromotedRef.current = onPromoted;
  }, [onPromoted]);

  const syncPoll = useCallback(() => setPollCount(inFlightRef.current.size), []);

  /** Button pressed: show loading cards now (job not created yet). */
  const beginJob = useCallback((id: string, count: number) => {
    setPending((prev) =>
      prev.some((p) => p.id === id)
        ? prev
        : [...prev, { id, jobId: null, count: Math.max(1, count) }],
    );
  }, []);

  /** Job created: bind the real jobId and start polling its status. */
  const attachJob = useCallback(
    (id: string, jobId: string) => {
      inFlightRef.current.add(jobId);
      setPending((prev) =>
        prev.map((p) => (p.id === id ? { ...p, jobId } : p)),
      );
      syncPoll();
    },
    [syncPoll],
  );

  /** Upload/extraction never started (e.g. create-job failed): drop the cards. */
  const failJob = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Drop a job's loading cards — the page calls this after loadPassages. */
  const clearPending = useCallback((jobId: string) => {
    setPending((prev) => prev.filter((p) => p.jobId !== jobId));
  }, []);

  // Fetch a finished job's drafts and promote them → Passages.
  const promote = useCallback(async (jobId: string, partial: boolean) => {
    try {
      const res = await fetch(
        `/api/extraction/m1-passages?jobId=${jobId}&view=list&limit=300`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      const drafts: Array<{ id: string; savedPassageId: string | null }> =
        Array.isArray(data?.drafts) ? data.drafts : [];
      const draftIds = drafts
        .filter((d) => !d.savedPassageId)
        .map((d) => d.id);

      let passageIds: string[] = [];
      if (draftIds.length > 0) {
        const pr = await fetch("/api/extraction/m1-passages/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ draftIds }),
        });
        const pd = await pr.json().catch(() => ({}));
        passageIds = (Array.isArray(pd?.outcomes) ? pd.outcomes : [])
          .filter((o: { status?: string }) => o?.status === "promoted")
          .map((o: { passageId: string }) => o.passageId)
          .filter(Boolean);
      } else {
        // Already promoted (savedPassageId set) → reuse those passage ids.
        passageIds = drafts
          .map((d) => d.savedPassageId)
          .filter((id): id is string => Boolean(id));
      }

      onPromotedRef.current({ passageIds, jobId, partial });
    } catch {
      toast.error("추출 결과를 불러오지 못했습니다. 작업 큐에서 확인하세요.");
      // 실패해도 로딩 카드는 치워 무한 로딩을 막는다.
      setPending((prev) => prev.filter((p) => p.jobId !== jobId));
    }
  }, []);

  useEffect(() => {
    if (pollCount === 0) return;
    const stop = startAdaptivePoll({
      activeMs: 4000,
      idleMs: 15000,
      run: async (signal) => {
        const tasks = await extractionAdapter
          .fetchTasks(signal)
          .catch(() => []);
        const sig: string[] = [];
        for (const t of tasks) {
          if (!inFlightRef.current.has(t.id)) continue;
          sig.push(`${t.id}:${t.status}`);

          if (t.status === "completed" || t.status === "partial") {
            // Edge-trigger: promote each job exactly once.
            if (promotingRef.current.has(t.id)) continue;
            promotingRef.current.add(t.id);
            inFlightRef.current.delete(t.id);
            syncPoll();
            void promote(t.id, t.status === "partial").finally(() => {
              promotingRef.current.delete(t.id);
            });
          } else if (t.status === "failed" || t.status === "cancelled") {
            inFlightRef.current.delete(t.id);
            setPending((prev) => prev.filter((p) => p.jobId !== t.id));
            syncPoll();
            toast.error("추출 작업이 실패했습니다. 작업 큐에서 확인하세요.");
          }
        }
        return sig.sort().join("|") || "waiting";
      },
    });
    return stop;
  }, [pollCount, promote, syncPoll]);

  return { beginJob, attachJob, failJob, clearPending, pending };
}
