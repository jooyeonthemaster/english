// ============================================================================
// use-extraction-stream — subscribes the Zustand store to the SSE endpoint.
// Handles auto-reconnect (Vercel 4-min SSE cap) and back-off on errors.
//
// Side-effect: when a job snapshot reports a non-null `sourceMaterialId`
// and the store does not yet hold the corresponding SourceMaterial, the
// hook fetches `/api/extraction/jobs/:id` once to hydrate it. This keeps
// the review / done steps from needing a separate detail fetch.
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import { useExtractionStore } from "@/lib/extraction/store";
import type {
  JobSnapshot,
  SourceMaterialSnapshot,
  StreamEvent,
} from "@/lib/extraction/types";

interface Options {
  jobId: string | null;
  enabled: boolean;
}

const TERMINAL = new Set(["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]);

/** Shape returned by GET /api/extraction/jobs/:id (subset used here). */
interface JobDetailResponse {
  job: JobSnapshot;
  sourceMaterial: SourceMaterialSnapshot | null;
}

async function fetchSourceMaterial(
  jobId: string,
  signal: AbortSignal,
): Promise<SourceMaterialSnapshot | null> {
  try {
    const res = await fetch(`/api/extraction/jobs/${jobId}`, {
      method: "GET",
      credentials: "include",
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as JobDetailResponse;
    return body.sourceMaterial ?? null;
  } catch {
    return null;
  }
}

export function useExtractionStream({ jobId, enabled }: Options): void {
  const applySnapshot = useExtractionStore((s) => s.applySnapshot);
  const upsertPage = useExtractionStore((s) => s.upsertPage);
  const updateJobStatus = useExtractionStore((s) => s.updateJobStatus);
  const setError = useExtractionStore((s) => s.setError);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setMode = useExtractionStore((s) => s.setMode);
  const setSourceMaterial = useExtractionStore((s) => s.setSourceMaterial);

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUs = useRef(false);
  /** Tracks the last sourceMaterialId we fetched so we don't re-fetch on
   *  every snapshot frame. */
  const lastFetchedSourceMaterialId = useRef<string | null>(null);
  /**
   * Tracks whether we've surfaced a "connection trouble" error to the store.
   * Set when `backoffMs > 10s` (two retries deep); cleared on the first
   * successful snapshot frame after reconnect. Prevents re-dispatching the
   * same message on every retry and avoids leaving a stale error when the
   * network recovers.
   */
  const networkErrorVisible = useRef(false);

  useEffect(() => {
    if (!enabled || !jobId) return;

    closedByUs.current = false;
    let source: EventSource | null = null;
    let backoffMs = 1000;
    const fetchController = new AbortController();

    const cleanup = () => {
      closedByUs.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      source?.close();
      fetchController.abort();
      // If we left a "connection trouble" message in the store, clear it
      // on unmount so the next mounted stream starts clean.
      if (networkErrorVisible.current) {
        setError(null);
        networkErrorVisible.current = false;
      }
    };

    /** Kick off a one-shot SourceMaterial fetch the first time a snapshot
     *  carries a `sourceMaterialId` we haven't seen. */
    const maybeHydrateSourceMaterial = (snapshot: JobSnapshot) => {
      const smId = snapshot.sourceMaterialId ?? null;
      if (!smId) return;
      if (lastFetchedSourceMaterialId.current === smId) return;
      lastFetchedSourceMaterialId.current = smId;
      void fetchSourceMaterial(snapshot.id, fetchController.signal).then(
        (sm) => {
          if (sm) setSourceMaterial(sm);
        },
      );
    };

    const connect = () => {
      if (closedByUs.current) return;
      const url = `/api/extraction/jobs/${jobId}/stream`;
      source = new EventSource(url, { withCredentials: true });

      // Parse via named events
      source.addEventListener("snapshot", (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as StreamEvent;
          if (ev.type === "snapshot") {
            applySnapshot(ev.job);
            // Mirror mode / sourceMaterialId into the store when the server
            // includes them on the JobSnapshot (optional fields for legacy).
            if (ev.job.mode) setMode(ev.job.mode);
            maybeHydrateSourceMaterial(ev.job);
          }
          // Successful frame received — reset backoff AND clear any sticky
          // "connection trouble" notice we may have surfaced during the
          // previous retry loop (reconnection succeeded).
          if (networkErrorVisible.current) {
            setError(null);
            networkErrorVisible.current = false;
          }
          backoffMs = 1000;
        } catch {
          /* ignore malformed frame */
        }
      });
      source.addEventListener("page-update", (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as StreamEvent;
          if (ev.type === "page-update") {
            upsertPage({
              pageIndex: ev.pageIndex,
              status: ev.status,
              attemptCount: ev.attemptCount,
              extractedText: ev.extractedText,
              errorCode: ev.errorCode,
              errorMessage: ev.errorMessage,
              latencyMs: ev.latencyMs,
              imageUrl: null, // server will send null; image URL comes from /jobs/:id GET
            });
          }
        } catch {
          /* ignore */
        }
      });
      source.addEventListener("job-update", (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as StreamEvent;
          if (ev.type === "job-update") {
            updateJobStatus({
              status: ev.status,
              successPages: ev.successPages,
              failedPages: ev.failedPages,
              pendingPages: ev.pendingPages,
              creditsConsumed: ev.creditsConsumed,
            });
            if (TERMINAL.has(ev.status)) {
              setPhase("reviewing");
            }
          }
        } catch {
          /* ignore */
        }
      });
      source.addEventListener("done", (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as StreamEvent;
          if (ev.type === "done") {
            if (TERMINAL.has(ev.status)) {
              setPhase("reviewing");
              cleanup();
            } else {
              // Server closed for session timeout — reconnect.
              source?.close();
              source = null;
              reconnectTimer.current = setTimeout(connect, backoffMs);
            }
          }
        } catch {
          /* ignore */
        }
      });
      source.addEventListener("error", () => {
        // Network hiccup or server closed unexpectedly — back off & retry.
        if (source) {
          source.close();
          source = null;
        }
        if (closedByUs.current) return;
        backoffMs = Math.min(backoffMs * 2, 15000);
        // Surface sustained connection trouble to the user so they are not
        // left staring at a stalled UI. Threshold > 10s matches "after a
        // couple of retries" — earlier blips stay silent. Cleared on the
        // next successful snapshot frame.
        if (backoffMs > 10_000 && !networkErrorVisible.current) {
          setError("서버 연결에 문제가 있습니다. 재시도 중…");
          networkErrorVisible.current = true;
        }
        reconnectTimer.current = setTimeout(connect, backoffMs);
      });
    };

    connect();

    return cleanup;
  }, [
    jobId,
    enabled,
    applySnapshot,
    upsertPage,
    updateJobStatus,
    setPhase,
    setMode,
    setSourceMaterial,
    setError,
  ]);
}
