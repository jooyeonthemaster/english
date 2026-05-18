import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  fetchAllDraftPages,
  getCachedDrafts,
  getCachedJobMeta,
  patchCachedDraft,
  setCachedDrafts,
  setCachedJobMeta,
  type JobMetaSnapshot,
} from "../drafts-cache";
import type {
  JobDetailResponse,
  M1DraftJobSummary,
  M1PassageDraftWithJob,
} from "../types";
import { buildExamPageNumberMap } from "../utils/exam-page-number";

const TERMINAL_JOB_STATUSES = ["COMPLETED", "PARTIAL", "FAILED"];

interface UseDraftsDataParams {
  onJobsRefresh: () => void;
}

export function useDraftsData({ onJobsRefresh: _onJobsRefresh }: UseDraftsDataParams) {
  void _onJobsRefresh;

  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>(
    () => getCachedDrafts() ?? [],
  );
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedDraftDetail, setSelectedDraftDetail] =
    useState<M1PassageDraftWithJob | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(
    () => getCachedDrafts() === null,
  );
  const [resultScope, setResultScope] = useState<"all" | "job">("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobMetaByJobId, setJobMetaByJobId] = useState<
    Map<string, JobMetaSnapshot>
  >(() => getCachedJobMeta() ?? new Map());

  const bootstrapped = useRef(false);
  const detailRequestSeq = useRef(0);

  // ─── Data fetchers ───
  const loadJobDetails = useCallback(async (nextJobId: string) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/jobs/" + nextJobId, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("작업 정보를 불러오지 못했습니다.");

      const data = (await res.json()) as JobDetailResponse;
      const examPageNumberByPageIndex = buildExamPageNumberMap(data.items);
      const jobSummary: M1DraftJobSummary = {
        id: data.job.id,
        originalFileName: data.job.originalFileName,
        displayName: data.job.displayName ?? null,
        totalPages: data.job.totalPages,
        status: data.job.status,
        createdAt: data.job.createdAt,
        completedAt: data.job.completedAt,
        pages: (data.pages ?? []).map((page) => ({
          pageIndex: page.pageIndex,
          sourceFileName: page.sourceFileName ?? null,
          examPageNumber: examPageNumberByPageIndex.get(page.pageIndex) ?? null,
        })),
      };
      const nextDrafts = data.m1PassageDrafts.map((draft) => ({
        ...draft,
        job: jobSummary,
      }));
      setDrafts(nextDrafts);
      setSelectedDraftId(null);
      setResultScope("job");
      setJobId(nextJobId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "작업 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadJobsDetails = useCallback(async (nextJobIds: Set<string>) => {
    if (nextJobIds.size === 0) return;
    setLoadingDetails(true);
    setError(null);
    try {
      const responses = await Promise.all(
        Array.from(nextJobIds).map(async (nextJobId) => {
          const res = await fetch("/api/extraction/jobs/" + nextJobId, {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) {
            throw new Error("작업 정보를 불러오지 못했습니다.");
          }
          return (await res.json()) as JobDetailResponse;
        }),
      );

      const nextDrafts = responses.flatMap((data) => {
        const examPageNumberByPageIndex = buildExamPageNumberMap(data.items);
        const jobSummary: M1DraftJobSummary = {
          id: data.job.id,
          originalFileName: data.job.originalFileName,
          displayName: data.job.displayName ?? null,
          totalPages: data.job.totalPages,
          status: data.job.status,
          createdAt: data.job.createdAt,
          completedAt: data.job.completedAt,
          pages: (data.pages ?? []).map((page) => ({
            pageIndex: page.pageIndex,
            sourceFileName: page.sourceFileName ?? null,
            examPageNumber: examPageNumberByPageIndex.get(page.pageIndex) ?? null,
          })),
        };
        return data.m1PassageDrafts.map((draft) => ({
          ...draft,
          job: jobSummary,
        }));
      });

      setDrafts(nextDrafts);
      setSelectedDraftId(null);
      setResultScope("job");
      setJobId(nextJobIds.size === 1 ? Array.from(nextJobIds)[0] : null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "작업 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadAllDrafts = useCallback(async () => {
    // If we already have a cached snapshot, repaint instantly and fetch in
    // the background so the user sees the list right away on nav. The
    // initial first-load (no cache) still shows the skeleton.
    if (getCachedDrafts() === null) setLoadingDetails(true);
    setError(null);
    try {
      const nextDrafts = await fetchAllDraftPages();
      setCachedDrafts(nextDrafts);
      setDrafts(nextDrafts);
      setSelectedDraftId(null);
      setResultScope("all");
      setJobId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "자료 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // ─── Silent polling for PENDING restoration ───
  const pollJobSilent = useCallback(async (nextJobId: string) => {
    try {
      const res = await fetch("/api/extraction/jobs/" + nextJobId, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as JobDetailResponse;
      const examPageNumberByPageIndex = buildExamPageNumberMap(data.items);
      const jobSummary: M1DraftJobSummary = {
        id: data.job.id,
        originalFileName: data.job.originalFileName,
        displayName: data.job.displayName ?? null,
        totalPages: data.job.totalPages,
        status: data.job.status,
        createdAt: data.job.createdAt,
        completedAt: data.job.completedAt,
        pages: (data.pages ?? []).map((page) => ({
          pageIndex: page.pageIndex,
          sourceFileName: page.sourceFileName ?? null,
          examPageNumber: examPageNumberByPageIndex.get(page.pageIndex) ?? null,
        })),
      };
      setDrafts(
        data.m1PassageDrafts.map((draft) => ({ ...draft, job: jobSummary })),
      );
    } catch {
      /* polling errors are non-fatal */
    }
  }, []);

  const pollAllSilent = useCallback(async () => {
    try {
      const nextDrafts = await fetchAllDraftPages();
      setCachedDrafts(nextDrafts);
      setDrafts(nextDrafts);
    } catch {
      /* polling errors are non-fatal */
    }
  }, []);

  const hasPendingDrafts = useMemo(
    () => drafts.some((draft) => draft.restorationStatus === "PENDING"),
    [drafts],
  );

  // ─── Polling effect for PENDING drafts ───
  useEffect(() => {
    if (!hasPendingDrafts) return;
    const POLL_INTERVAL_MS = 4000;
    const id = window.setInterval(() => {
      if (resultScope === "job" && jobId) void pollJobSilent(jobId);
      else void pollAllSilent();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasPendingDrafts, resultScope, jobId, pollJobSilent, pollAllSilent]);

  // ─── Job meta polling (terminal-transition detector) ───
  //
  // Doubles as the "new completion detector": when this poll sees a job
  // newly enter a terminal state we kick off a silent drafts refetch. Without
  // this, finishing an extraction while the 자료 관리 page is already open
  // leaves the card grid stuck on the old snapshot.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch("/api/extraction/jobs?limit=200", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          jobs?: Array<{
            id: string;
            mode: string;
            status: string;
            displayName?: string | null;
            originalFileName?: string | null;
            createdAt: string;
            firstPageImageUrl?: string | null;
            resultCount?: number;
            draftResultCount?: number;
            savedResultCount?: number;
          }>;
        };
        if (cancelled) return;
        const m = new Map<string, JobMetaSnapshot>();
        for (const j of data.jobs ?? []) {
          // Mirror the manage page's draft fetch — PASSAGE_ONLY only.
          if (j.mode !== "PASSAGE_ONLY") continue;
          m.set(j.id, {
            thumbnailUrl: j.firstPageImageUrl ?? null,
            status: j.status,
            displayName: j.displayName ?? null,
            originalFileName: j.originalFileName ?? null,
            createdAt: j.createdAt,
            resultCount: j.resultCount ?? 0,
            draftResultCount: j.draftResultCount ?? 0,
            savedResultCount: j.savedResultCount ?? 0,
          });
        }
        // Detect a fresh terminal transition vs the previous poll's
        // snapshot. Skip the first run (prev === null) to avoid duplicating
        // the bootstrap `loadAllDrafts` call.
        const prev = getCachedJobMeta();
        let shouldRefetchDrafts = false;
        if (prev) {
          for (const [id, meta] of m) {
            if (!TERMINAL_JOB_STATUSES.includes(meta.status)) continue;
            const prevMeta = prev.get(id);
            if (
              !prevMeta ||
              !TERMINAL_JOB_STATUSES.includes(prevMeta.status)
            ) {
              shouldRefetchDrafts = true;
              break;
            }
          }
        }
        setCachedJobMeta(m);
        setJobMetaByJobId(m);
        if (shouldRefetchDrafts) void pollAllSilent();
      } catch {
        // Best-effort enrichment; cards still render without thumbnails.
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [pollAllSilent]);

  // ─── Detail open/close ───
  const openDraftDetail = useCallback(
    async (id: string) => {
      const seq = detailRequestSeq.current + 1;
      detailRequestSeq.current = seq;
      const optimisticDraft = drafts.find((draft) => draft.id === id) ?? null;
      setSelectedDraftId(id);
      setSelectedDraftDetail(optimisticDraft);
      setDetailLoadingId(id);
      setError(null);
      try {
        const res = await fetch("/api/extraction/m1-passages/" + id, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("자료 상세를 불러오지 못했습니다.");
        const data = (await res.json()) as { draft: M1PassageDraftWithJob };
        if (detailRequestSeq.current !== seq) return;
        setSelectedDraftDetail(data.draft);
        setDrafts((current) =>
          current.map((draft) =>
            draft.id === data.draft.id ? { ...draft, ...data.draft } : draft,
          ),
        );
        patchCachedDraft(data.draft.id, data.draft);
      } catch (err) {
        if (detailRequestSeq.current !== seq) return;
        if (!optimisticDraft) {
          setSelectedDraftId(null);
          setSelectedDraftDetail(null);
        }
        toast.error(
          err instanceof Error
            ? err.message
            : "자료 상세를 불러오지 못했습니다.",
        );
      } finally {
        if (detailRequestSeq.current === seq) {
          setDetailLoadingId(null);
        }
      }
    },
    [drafts],
  );

  const closeDraftDetail = useCallback(() => {
    detailRequestSeq.current += 1;
    setSelectedDraftId(null);
    setSelectedDraftDetail(null);
    setDetailLoadingId(null);
  }, []);

  return {
    // state
    drafts,
    setDrafts,
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftDetail,
    setSelectedDraftDetail,
    detailLoadingId,
    loadingDetails,
    resultScope,
    setResultScope,
    jobId,
    setJobId,
    error,
    setError,
    jobMetaByJobId,
    bootstrapped,
    // actions
    loadJobDetails,
    loadJobsDetails,
    loadAllDrafts,
    pollAllSilent,
    openDraftDetail,
    closeDraftDetail,
    hasPendingDrafts,
  };
}
