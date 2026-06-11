"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { extractionAdapter } from "@/components/workbench/task-queue/adapters/extraction-adapter";

export interface ExtractionPromotedResult {
  passageIds: string[];
  jobId: string;
  partial: boolean;
  expectedCount: number;
  resolvedCount: number;
  complete: boolean;
}

export interface PendingExtraction {
  id: string;
  jobId: string | null;
  count: number;
}

interface UseGenerateExtractionArgs {
  onPromoted: (result: ExtractionPromotedResult) => void;
}

interface M1DraftForPromotion {
  id: string;
  savedPassageId: string | null;
}

type PromoteOutcome =
  | { draftId: string; status: "promoted"; passageId: string }
  | {
      draftId: string;
      status: "skipped";
      reason: string;
      passageId?: string;
    }
  | { draftId: string; status: "failed"; reason: string };

const PROMOTE_RETRY_DELAYS_MS = [0, 800, 1600, 3200] as const;

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJobDrafts(jobId: string): Promise<M1DraftForPromotion[]> {
  const res = await fetch(
    `/api/extraction/m1-passages?jobId=${jobId}&view=list&limit=300`,
    { credentials: "include", cache: "no-store" },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "draft_fetch_failed",
    );
  }
  return Array.isArray(data?.drafts) ? data.drafts : [];
}

async function promoteDraftIds(draftIds: string[]): Promise<string[]> {
  if (draftIds.length === 0) return [];
  const res = await fetch("/api/extraction/m1-passages/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ draftIds, markReviewed: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "draft_promote_failed",
    );
  }

  const outcomes: PromoteOutcome[] = Array.isArray(data?.outcomes)
    ? data.outcomes
    : [];
  return outcomes
    .map((outcome) => {
      if (outcome.status === "promoted") return outcome.passageId;
      if (
        outcome.status === "skipped" &&
        outcome.reason === "already_promoted"
      ) {
        return outcome.passageId ?? "";
      }
      return "";
    })
    .filter(Boolean);
}

export function useGenerateExtraction({ onPromoted }: UseGenerateExtractionArgs) {
  const inFlightRef = useRef<Set<string>>(new Set());
  const promotingRef = useRef<Set<string>>(new Set());
  const [pollCount, setPollCount] = useState(0);
  const [pending, setPending] = useState<PendingExtraction[]>([]);

  const onPromotedRef = useRef(onPromoted);
  useEffect(() => {
    onPromotedRef.current = onPromoted;
  }, [onPromoted]);

  const syncPoll = useCallback(() => setPollCount(inFlightRef.current.size), []);

  const beginJob = useCallback((id: string, count: number) => {
    setPending((prev) =>
      prev.some((p) => p.id === id)
        ? prev
        : [...prev, { id, jobId: null, count: Math.max(1, count) }],
    );
  }, []);

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

  const failJob = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearPending = useCallback((jobId: string) => {
    setPending((prev) => prev.filter((p) => p.jobId !== jobId));
  }, []);

  const promote = useCallback(async (jobId: string, partial: boolean) => {
    try {
      let drafts: M1DraftForPromotion[] = [];
      let passageIds: string[] = [];

      for (const delayMs of PROMOTE_RETRY_DELAYS_MS) {
        if (delayMs > 0) await sleep(delayMs);

        drafts = await fetchJobDrafts(jobId);
        passageIds = uniqueIds([
          ...passageIds,
          ...drafts
            .map((draft) => draft.savedPassageId)
            .filter((id): id is string => Boolean(id)),
        ]);

        const draftIds = drafts
          .filter((draft) => !draft.savedPassageId)
          .map((draft) => draft.id);
        if (draftIds.length === 0) break;

        const promotedIds = await promoteDraftIds(draftIds);
        passageIds = uniqueIds([...passageIds, ...promotedIds]);

        // The promote endpoint is per-draft best-effort. Re-read the job after
        // each attempt so transient partial successes get retried instead of
        // being mistaken for a finished 4/4 queue.
        drafts = await fetchJobDrafts(jobId);
        passageIds = uniqueIds([
          ...passageIds,
          ...drafts
            .map((draft) => draft.savedPassageId)
            .filter((id): id is string => Boolean(id)),
        ]);
        if (drafts.every((draft) => draft.savedPassageId)) break;
      }

      const expectedCount = drafts.length;
      const resolvedCount = drafts.filter((draft) => draft.savedPassageId).length;
      const complete = expectedCount === 0 || resolvedCount >= expectedCount;

      if (!complete) {
        setPending((prev) =>
          prev.map((p) =>
            p.jobId === jobId
              ? { ...p, count: Math.max(1, expectedCount - resolvedCount) }
              : p,
          ),
        );
      }

      onPromotedRef.current({
        passageIds: uniqueIds(passageIds),
        jobId,
        partial,
        expectedCount,
        resolvedCount,
        complete,
      });
    } catch {
      toast.error(
        "추출 결과를 불러오지 못했습니다. 작업 큐에서 결과를 확인해주세요.",
      );
      setPending((prev) => prev.filter((p) => p.jobId !== jobId));
    }
  }, []);

  useEffect(() => {
    if (pollCount === 0) return;
    const stop = startAdaptivePoll({
      activeMs: 4000,
      idleMs: 15000,
      run: async (signal) => {
        const tasks = await extractionAdapter.fetchTasks(signal).catch(() => []);
        const sig: string[] = [];
        for (const task of tasks) {
          if (!inFlightRef.current.has(task.id)) continue;
          sig.push(`${task.id}:${task.status}`);

          if (task.status === "completed" || task.status === "partial") {
            if (promotingRef.current.has(task.id)) continue;
            promotingRef.current.add(task.id);
            inFlightRef.current.delete(task.id);
            syncPoll();
            void promote(task.id, task.status === "partial").finally(() => {
              promotingRef.current.delete(task.id);
            });
          } else if (task.status === "failed" || task.status === "cancelled") {
            inFlightRef.current.delete(task.id);
            setPending((prev) => prev.filter((p) => p.jobId !== task.id));
            syncPoll();
            toast.error(
              "추출 작업이 실패했습니다. 작업 큐에서 결과를 확인해주세요.",
            );
          }
        }
        return sig.sort().join("|") || "waiting";
      },
    });
    return stop;
  }, [pollCount, promote, syncPoll]);

  return { beginJob, attachJob, failJob, clearPending, pending };
}
