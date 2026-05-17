"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";
import {
  addDraftsToCollection,
  createM1DraftCollection,
  deleteM1DraftCollection,
  removeDraftsFromCollection,
  updateM1DraftCollection,
} from "@/actions/workbench";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "@/hooks/use-selection";

import { useQueueDrawer } from "../queue-drawer-context";

import { DraftDetailModal } from "./components/draft-detail-modal";
import { DraftFolderSection } from "./components/draft-folder-section";
import { DraftGrid, type GridCols } from "./components/draft-grid";
import { DraftSelectionToolbar } from "./components/draft-selection-toolbar";
import { ManageFiltersBar } from "./components/manage-filters-bar";
import type { SortOrder, StatusFilter } from "./components/manage-header";
import type {
  JobDetailResponse,
  M1DraftJobSummary,
  M1PassageDraftWithJob,
} from "./types";
import { buildExamPageNumberMap } from "./utils/exam-page-number";

interface ExtractionManageClientProps {
  academyId: string;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
}

function formatShortTimestamp(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Module-level cache so the manage page can repaint instantly on nav
 * (e.g. coming back from a draft detail / extraction page) while the
 * background fetch refreshes the snapshot. Cleared on full reload.
 */
let cachedDrafts: M1PassageDraftWithJob[] | null = null;
const ALL_DRAFT_PAGE_SIZE = 300;

interface M1DraftListResponse {
  drafts: M1PassageDraftWithJob[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

async function fetchAllDraftPages(): Promise<M1PassageDraftWithJob[]> {
  const allDrafts: M1PassageDraftWithJob[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({
      limit: String(ALL_DRAFT_PAGE_SIZE),
      view: "list",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/extraction/m1-passages?${params}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("자료 목록을 불러오지 못했습니다.");

    const data = (await res.json()) as M1DraftListResponse;
    allDrafts.push(...data.drafts);
    cursor = data.nextCursor ?? null;
  } while (cursor);

  return allDrafts;
}

interface JobMetaSnapshot {
  thumbnailUrl: string | null;
  status: string;
  displayName: string | null;
  originalFileName: string | null;
  createdAt: string;
  resultCount: number;
  draftResultCount: number;
  savedResultCount: number;
}

let cachedJobMeta: Map<string, JobMetaSnapshot> | null = null;

export function ExtractionManageClient({
  academyId,
  initialCollections,
  initialCollectionMembership,
}: ExtractionManageClientProps) {
  void academyId;

  // ─── Data state ───
  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>(
    () => cachedDrafts ?? [],
  );
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedDraftDetail, setSelectedDraftDetail] =
    useState<M1PassageDraftWithJob | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(
    () => cachedDrafts === null,
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rerestoringId, setRerestoringId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [resultScope, setResultScope] = useState<"all" | "job">("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);
  const detailRequestSeq = useRef(0);

  const queueDrawer = useQueueDrawer();

  // ─── UI state ───
  const [searchValue, setSearchValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [gridCols, setGridCols] = useState<GridCols>(3);
  const [jobFilter, setJobFilter] = useState<Set<string>>(() => new Set());
  const [jobMetaByJobId, setJobMetaByJobId] = useState<
    Map<string, JobMetaSnapshot>
  >(() => cachedJobMeta ?? new Map());

  // ─── Folder manager ───
  const folders = useFolderManager({
    initialCollections,
    initialMembership: initialCollectionMembership,
    actions: {
      createCollection: createM1DraftCollection,
      updateCollection: updateM1DraftCollection,
      deleteCollection: deleteM1DraftCollection,
      addToCollection: addDraftsToCollection,
      removeFromCollection: removeDraftsFromCollection,
    },
    itemLabel: "자료",
  });

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
        err instanceof Error ? err.message : "?묒뾽 ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??",
      );
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadAllDrafts = useCallback(async () => {
    // If we already have a cached snapshot, repaint instantly and fetch in
    // the background so the user sees the list right away on nav. The
    // initial first-load (no cache) still shows the skeleton.
    if (cachedDrafts === null) setLoadingDetails(true);
    setError(null);
    try {
      const nextDrafts = await fetchAllDraftPages();
      cachedDrafts = nextDrafts;
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

  // ─── Bootstrap ───
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const nextJobId =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("jobId");
    void (async () => {
      await loadAllDrafts();
      if (nextJobId) {
        const next = new Set([nextJobId]);
        setJobFilter(next);
        await loadJobDetails(nextJobId);
      }
    })();
  }, [loadAllDrafts, loadJobDetails]);

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
      cachedDrafts = nextDrafts;
      setDrafts(nextDrafts);
    } catch {
      /* polling errors are non-fatal */
    }
  }, []);

  const hasPendingDrafts = useMemo(
    () => drafts.some((draft) => draft.restorationStatus === "PENDING"),
    [drafts],
  );

  useEffect(() => {
    if (!hasPendingDrafts) return;
    const POLL_INTERVAL_MS = 4000;
    const id = window.setInterval(() => {
      if (resultScope === "job" && jobId) void pollJobSilent(jobId);
      else void pollAllSilent();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasPendingDrafts, resultScope, jobId, pollJobSilent, pollAllSilent]);

  // Job thumbnails + status — used by the job filter cards to render
  // task-card-style previews with status spinners. Reuses the existing
  // /api/extraction/jobs payload (firstPageImageUrl, status).
  //
  // Doubles as the "new completion detector": when this poll sees a job
  // newly enter a terminal state (COMPLETED/PARTIAL/FAILED) we kick off a
  // silent drafts refetch. Without this, finishing an extraction while the
  // 자료 관리 page is already open leaves the card grid stuck on the old
  // snapshot — `loadAllDrafts` only runs at bootstrap, and the PENDING
  // poll loop quits the moment all PENDING drafts resolve.
  const TERMINAL_JOB_STATUSES = ["COMPLETED", "PARTIAL", "FAILED"];
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
        const prev = cachedJobMeta;
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
        cachedJobMeta = m;
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
  }, []);

  // ─── Navigation actions ───
  const showAllResults = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setJobFilter(new Set());
    void loadAllDrafts();
  }, [loadAllDrafts]);

  const refreshResults = useCallback(() => {
    queueDrawer.triggerRefresh();
    if (jobFilter.size === 1) {
      const [nextJobId] = Array.from(jobFilter);
      void loadJobDetails(nextJobId);
    } else if (jobFilter.size > 1) void loadJobsDetails(jobFilter);
    else void loadAllDrafts();
  }, [jobFilter, loadAllDrafts, loadJobDetails, loadJobsDetails, queueDrawer]);

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
        if (cachedDrafts) {
          cachedDrafts = cachedDrafts.map((draft) =>
            draft.id === data.draft.id ? { ...draft, ...data.draft } : draft,
          );
        }
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

  // ─── CRUD ───
  const renameJob = useCallback(
    async (targetJobId: string, nextName: string | null) => {
      // Capture rollback snapshot first
      let previousDisplayName: string | null = null;
      let previousOriginalName: string | null = null;
      setDrafts((current) => {
        const probe = current.find((d) => d.job?.id === targetJobId);
        if (probe?.job) {
          previousDisplayName = probe.job.displayName ?? null;
          previousOriginalName = probe.job.originalFileName ?? null;
        }
        // Optimistic update on every draft from this job
        return current.map((d) =>
          d.job?.id === targetJobId
            ? { ...d, job: { ...d.job, displayName: nextName } }
            : d,
        );
      });

      if (nextName === previousDisplayName) return;

      try {
        const res = await fetch("/api/extraction/jobs/" + targetJobId, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: nextName }),
        });
        if (!res.ok) throw new Error("작업 이름을 저장하지 못했습니다.");
        const data = (await res.json()) as {
          job: {
            id: string;
            displayName: string | null;
            originalFileName: string | null;
          };
        };
        // Sync from server response (covers max-length truncation etc.)
        setDrafts((current) =>
          current.map((d) =>
            d.job?.id === data.job.id
              ? {
                  ...d,
                  job: {
                    ...d.job,
                    displayName: data.job.displayName,
                    originalFileName: data.job.originalFileName,
                  },
                }
              : d,
          ),
        );
        toast.success("작업 이름이 저장되었습니다.");
        queueDrawer.triggerRefresh();
      } catch (err) {
        // Rollback to previous values
        setDrafts((current) =>
          current.map((d) =>
            d.job?.id === targetJobId
              ? {
                  ...d,
                  job: {
                    ...d.job,
                    displayName: previousDisplayName,
                    originalFileName: previousOriginalName,
                  },
                }
              : d,
          ),
        );
        toast.error(
          err instanceof Error
            ? err.message
            : "작업 이름을 저장하지 못했습니다.",
        );
      }
    },
    [queueDrawer],
  );

  const renameSourceMaterial = useCallback(
    async (sourceMaterialId: string, customLabel: string) => {
      const trimmed = customLabel.trim();
      const next = trimmed.length > 0 ? trimmed : null;

      let previousLabel: string | null = null;
      setDrafts((current) => {
        const probe = current.find(
          (d) => d.sourceMaterial?.id === sourceMaterialId,
        );
        if (probe?.sourceMaterial) {
          previousLabel = probe.sourceMaterial.customLabel ?? null;
        }
        return current.map((d) =>
          d.sourceMaterial?.id === sourceMaterialId
            ? {
                ...d,
                sourceMaterial: { ...d.sourceMaterial, customLabel: next },
              }
            : d,
        );
      });

      if (next === previousLabel) return;

      try {
        const res = await fetch(
          "/api/extraction/source-materials/" + sourceMaterialId,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customLabel: next }),
          },
        );
        if (!res.ok) throw new Error("시험지 이름을 저장하지 못했습니다.");
        const data = (await res.json()) as {
          sourceMaterial: { id: string; customLabel: string | null };
        };
        setDrafts((current) =>
          current.map((d) =>
            d.sourceMaterial?.id === data.sourceMaterial.id
              ? {
                  ...d,
                  sourceMaterial: {
                    id: data.sourceMaterial.id,
                    customLabel: data.sourceMaterial.customLabel,
                  },
                }
              : d,
          ),
        );
        toast.success("시험지 이름이 저장되었습니다.");
      } catch (err) {
        setDrafts((current) =>
          current.map((d) =>
            d.sourceMaterial?.id === sourceMaterialId
              ? {
                  ...d,
                  sourceMaterial: {
                    ...d.sourceMaterial,
                    customLabel: previousLabel,
                  },
                }
              : d,
          ),
        );
        toast.error(
          err instanceof Error
            ? err.message
            : "시험지 이름을 저장하지 못했습니다.",
        );
      }
    },
    [],
  );

  const updateDraftText = useCallback((id: string, teacherText: string) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, teacherText } : draft,
      ),
    );
    setSelectedDraftDetail((current) =>
      current?.id === id ? { ...current, teacherText } : current,
    );
  }, []);

  const updateDraftTitle = useCallback(
    async (id: string, newTitle: string | null) => {
      let previousTitle: string | null | undefined;
      let teacherText: string | undefined;
      setDrafts((current) => {
        const target = current.find((d) => d.id === id);
        if (!target) return current;
        previousTitle = target.title ?? null;
        teacherText = target.teacherText;
        if ((target.title ?? null) === newTitle) return current;
        return current.map((d) =>
          d.id === id ? { ...d, title: newTitle } : d,
        );
      });
      if (teacherText === undefined) return;
      if (previousTitle === newTitle) return;

      try {
        const res = await fetch("/api/extraction/m1-passages/" + id, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle, teacherText }),
        });
        if (!res.ok) throw new Error("제목 저장에 실패했습니다.");
        const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
        setDrafts((current) =>
          current.map((d) =>
            d.id === data.draft.id ? { ...d, ...data.draft } : d,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === data.draft.id
            ? { ...current, ...data.draft }
            : current,
        );
      } catch (err) {
        // Rollback
        setDrafts((current) =>
          current.map((d) =>
            d.id === id ? { ...d, title: previousTitle ?? null } : d,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === id
            ? { ...current, title: previousTitle ?? null }
            : current,
        );
        toast.error(
          err instanceof Error ? err.message : "제목 저장에 실패했습니다.",
        );
      }
    },
    [],
  );

  const saveDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setSavingId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title ?? null,
          teacherText: draft.teacherText,
        }),
      });
      if (!res.ok) throw new Error("수정 내용을 저장하지 못했습니다.");
      const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
      setDrafts((current) =>
        current.map((item) =>
          item.id === data.draft.id ? { ...item, ...data.draft } : item,
        ),
      );
      setSelectedDraftDetail((current) =>
        current?.id === data.draft.id ? { ...current, ...data.draft } : current,
      );
      toast.success("저장되었습니다.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "수정 내용을 저장하지 못했습니다.",
      );
    } finally {
      setSavingId(null);
    }
  }, []);

  const rerestoreDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setRerestoringId(draft.id);
    setError(null);
    try {
      const res = await fetch(
        "/api/extraction/m1-passages/" + draft.id + "/rerestore",
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "AI 복원을 다시 실행하지 못했습니다.");
      }
      const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
      setDrafts((current) =>
        current.map((item) =>
          item.id === data.draft.id ? { ...item, ...data.draft } : item,
        ),
      );
      setSelectedDraftDetail((current) =>
        current?.id === data.draft.id ? { ...current, ...data.draft } : current,
      );
      queueDrawer.triggerRefresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "AI 복원을 다시 실행하지 못했습니다.",
      );
    } finally {
      setRerestoringId(null);
    }
  }, []);

  const promoteDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setPromotingId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/promote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftIds: [draft.id] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "지문으로 등록하지 못했습니다.");
      }
      const data = (await res.json()) as {
        summary: { promoted: number; skipped: number; failed: number };
        outcomes: Array<{
          draftId: string;
          status: string;
          reason?: string;
          passageId?: string;
        }>;
      };
      const outcome = data.outcomes.find((o) => o.draftId === draft.id);
      if (outcome?.status === "promoted") {
        // Keep the draft visible in 자료 관리; flip it to COMMITTED so the
        // card shows a "지문 등록 완료" badge and the promote button disables.
        // Server fetch returns COMMITTED rows too.
        setDrafts((current) =>
          current.map((d) =>
            d.id === draft.id
              ? {
                  ...d,
                  reviewStatus: "COMMITTED",
                  savedPassageId: outcome.passageId ?? d.savedPassageId,
                  confirmedAt: d.confirmedAt ?? new Date().toISOString(),
                }
              : d,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === draft.id
            ? {
                ...current,
                reviewStatus: "COMMITTED",
                savedPassageId: outcome.passageId ?? current.savedPassageId,
                confirmedAt: current.confirmedAt ?? new Date().toISOString(),
              }
            : current,
        );
        queueDrawer.triggerRefresh();
        toast.success("지문 관리로 등록되었습니다.");
      } else {
        const label =
          outcome?.reason === "already_promoted"
            ? "이미 등록된 자료입니다."
            : outcome?.reason === "no_source_material"
              ? "출처가 연결되지 않아 등록할 수 없습니다."
              : outcome?.reason === "empty_content"
                ? "본문이 비어 있어 등록할 수 없습니다."
                : "등록에 실패했습니다.";
        toast.error(label);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
    } finally {
      setPromotingId(null);
    }
  }, []);

  const deleteDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm("이 추출 지문을 삭제할까요?");
    if (!ok) return;

    setDeletingDraftId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("지문을 삭제하지 못했습니다.");
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      closeDraftDetail();
      queueDrawer.triggerRefresh();
      toast.success("삭제되었습니다.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "지문을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingDraftId(null);
    }
  }, []);

  // ─── Folder filtering + search/filter/sort ───
  const draftsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return drafts;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return drafts.filter((d) => ids.has(d.id));
  }, [drafts, folders.activeFolder, folders.membership]);

  const displayedDrafts = useMemo(() => {
    let result = draftsInActiveFolder;

    if (folders.activeFolder === null && jobFilter.size > 0) {
      result = result.filter((d) => {
        const jobId = d.job?.id;
        return Boolean(jobId && jobFilter.has(jobId));
      });
    }

    if (appliedSearch.trim()) {
      const q = appliedSearch.toLowerCase();
      result = result.filter((d) => {
        const title = (d.title ?? "").toLowerCase();
        const raw = d.rawText.toLowerCase();
        const fileName = d.job?.originalFileName?.toLowerCase() ?? "";
        return title.includes(q) || raw.includes(q) || fileName.includes(q);
      });
    }

    if (statusFilter !== "ALL") {
      result = result.filter((d) => d.restorationStatus === statusFilter);
    }

    const sorted = [...result];
    if (sortOrder === "newest") {
      sorted.sort((a, b) => {
        const aDate = new Date(a.createdAt as unknown as string).getTime();
        const bDate = new Date(b.createdAt as unknown as string).getTime();
        return bDate - aDate;
      });
    } else if (sortOrder === "oldest") {
      sorted.sort((a, b) => {
        const aDate = new Date(a.createdAt as unknown as string).getTime();
        const bDate = new Date(b.createdAt as unknown as string).getTime();
        return aDate - bDate;
      });
    } else if (sortOrder === "page_asc") {
      sorted.sort((a, b) => {
        const aPage = a.sourcePageIndex[0] ?? 0;
        const bPage = b.sourcePageIndex[0] ?? 0;
        return aPage - bPage;
      });
    }
    return sorted;
  }, [
    draftsInActiveFolder,
    folders.activeFolder,
    jobFilter,
    appliedSearch,
    statusFilter,
    sortOrder,
  ]);

  const availableJobs = useMemo(() => {
    // Count drafts per job from the currently-visible drafts. Jobs without
    // any drafts (PENDING / PROCESSING) still appear in the chip row so
    // teachers can see them running — count is 0 in that case.
    const countByJob = new Map<string, number>();
    const draftIdsByJob = new Map<string, string[]>();
    for (const d of draftsInActiveFolder) {
      const jobId = d.job?.id;
      if (!jobId) continue;
      countByJob.set(jobId, (countByJob.get(jobId) ?? 0) + 1);
      const ids = draftIdsByJob.get(jobId) ?? [];
      ids.push(d.id);
      draftIdsByJob.set(jobId, ids);
    }

    // Authoritative job list comes from the /api/extraction/jobs response
    // (jobMetaByJobId). This includes in-flight jobs that have no drafts
    // yet, which the previous drafts-only aggregation was hiding.
    const entries = Array.from(jobMetaByJobId.entries()).map(
      ([jobId, meta]) => {
        const createdAtMs = new Date(meta.createdAt).getTime();
        const label =
          (meta.displayName?.trim() && meta.displayName) ||
          meta.originalFileName ||
          "이름 없는 작업";
        const localCount = countByJob.get(jobId);
        return {
          jobId,
          label,
          count: localCount ?? meta.resultCount,
          draftIds: draftIdsByJob.get(jobId) ?? [],
          createdAt: Number.isFinite(createdAtMs) ? createdAtMs : null,
          thumbnailUrl: meta.thumbnailUrl,
          status: meta.status,
        };
      },
    );

    entries.sort((a, b) => {
      if (a.createdAt === null && b.createdAt === null) return 0;
      if (a.createdAt === null) return 1;
      if (b.createdAt === null) return -1;
      return b.createdAt - a.createdAt;
    });

    return entries.map((j) => ({
      jobId: j.jobId,
      label: j.label,
      subLabel:
        j.createdAt !== null ? formatShortTimestamp(j.createdAt) : undefined,
      count: j.count,
      draftIds: j.draftIds,
      createdAt: j.createdAt,
      thumbnailUrl: j.thumbnailUrl,
      status: j.status,
    }));
  }, [draftsInActiveFolder, jobMetaByJobId]);

  const serverVisibleDraftTotal = useMemo(
    () =>
      Array.from(jobMetaByJobId.values()).reduce(
        (sum, meta) => sum + meta.resultCount,
        0,
      ),
    [jobMetaByJobId],
  );

  // Per-job absolute "시험지 N" numbering. Computed from the full `drafts`
  // state (not the filtered/sorted view) so the number assigned to a given
  // SourceMaterial never changes regardless of which filter/sort is active.
  // First occurrence of each `sourceMaterialId` within a job (in the API's
  // passageOrder) gets index 1, second gets 2, etc.
  const groupIndexBySourceMaterialId = useMemo(() => {
    const map = new Map<string, number>();
    const orderByJob = new Map<string, string[]>();
    for (const d of drafts) {
      const smId = d.sourceMaterialId;
      const jobId = d.job?.id;
      if (!smId || !jobId) continue;
      let arr = orderByJob.get(jobId);
      if (!arr) {
        arr = [];
        orderByJob.set(jobId, arr);
      }
      if (!arr.includes(smId)) arr.push(smId);
    }
    for (const arr of orderByJob.values()) {
      arr.forEach((smId, i) => map.set(smId, i + 1));
    }
    return map;
  }, [drafts]);

  const selectedDraft =
    selectedDraftDetail ??
    drafts.find((draft) => draft.id === selectedDraftId) ??
    null;

  // ─── Selection ───
  const getDisplayedIds = useCallback(
    () => displayedDrafts.map((d) => d.id),
    [displayedDrafts],
  );
  const {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
  } = useSelection(getDisplayedIds);

  const toggleGroupCheck = useCallback(
    (ids: string[], select: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (select) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [setSelectedIds],
  );

  const handleRemoveFromFolderClick = useCallback(async () => {
    const ok = await folders.handleRemoveFromFolder(selectedIds);
    if (ok) clearSelection();
  }, [folders, selectedIds, clearSelection]);

  const [bulkActionRunning, setBulkActionRunning] = useState<
    "delete" | "rerestore" | "promote" | null
  >(null);

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0 || bulkActionRunning) return;
    const ids = [...selectedIds];
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `선택한 ${ids.length}개 자료를 삭제할까요? 되돌릴 수 없습니다.`,
          );
    if (!ok) return;

    setBulkActionRunning("delete");
    setError(null);
    const idSet = new Set(ids);

    try {
      const res = await fetch("/api/extraction/m1-passages/delete-many", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftIds: ids }),
      });
      if (!res.ok) {
        throw new Error("삭제 요청이 실패했습니다.");
      }
      const data = (await res.json()) as {
        requested: number;
        deleted: number;
      };

      // Only remove drafts that were actually deleted from the server.
      // If `deleted < requested`, some weren't owned by this academy or
      // already gone — they stay in local state until the next refresh.
      if (data.deleted >= data.requested) {
        setDrafts((current) => current.filter((d) => !idSet.has(d.id)));
      } else {
        // Partial delete — safest to drop the whole selection from local
        // state, but flag the discrepancy.
        setDrafts((current) => current.filter((d) => !idSet.has(d.id)));
      }
      clearSelection();
      queueDrawer.triggerRefresh();

      if (data.deleted === data.requested) {
        toast.success(`${data.deleted}개 자료를 삭제했습니다.`);
      } else if (data.deleted === 0) {
        toast.error("삭제에 실패했습니다.");
      } else {
        toast.warning(
          `${data.deleted}개 삭제됨, ${data.requested - data.deleted}개 누락`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "삭제 요청에 실패했습니다.",
      );
    } finally {
      setBulkActionRunning(null);
    }
  }, [selectedIds, bulkActionRunning, clearSelection]);

  const bulkRerestore = useCallback(async () => {
    if (selectedIds.size === 0 || bulkActionRunning) return;
    const ids = [...selectedIds];
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `선택한 ${ids.length}개 자료의 AI 복원을 다시 실행할까요? 크레딧이 차감됩니다.`,
          );
    if (!ok) return;

    setBulkActionRunning("rerestore");
    setError(null);

    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const res = await fetch(
          "/api/extraction/m1-passages/" + id + "/rerestore",
          { method: "POST", credentials: "include" },
        );
        if (!res.ok) throw new Error(`rerestore failed for ${id}`);
        return (await res.json()) as { draft: M1PassageDraftSnapshot };
      }),
    );

    let success = 0;
    let failed = 0;
    const updates: M1PassageDraftSnapshot[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        success += 1;
        updates.push(r.value.draft);
      } else {
        failed += 1;
      }
    }

    if (updates.length > 0) {
      const updateMap = new Map(updates.map((d) => [d.id, d]));
      setDrafts((current) =>
        current.map((item) => {
          const u = updateMap.get(item.id);
          return u ? { ...item, ...u } : item;
        }),
      );
    }

    clearSelection();
    queueDrawer.triggerRefresh();
    setBulkActionRunning(null);

    if (failed === 0) {
      toast.success(`${success}개 자료의 AI 복원을 다시 실행했습니다.`);
    } else if (success === 0) {
      toast.error(`복원 재실행에 모두 실패했습니다.`);
    } else {
      toast.warning(`${success}개 성공, ${failed}개 실패`);
    }
  }, [selectedIds, bulkActionRunning, clearSelection]);

  const bulkPromote = useCallback(async () => {
    if (selectedIds.size === 0 || bulkActionRunning) return;
    const ids = [...selectedIds];
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(`선택한 ${ids.length}개 자료를 지문으로 등록할까요?`);
    if (!ok) return;

    setBulkActionRunning("promote");
    setError(null);

    try {
      const res = await fetch("/api/extraction/m1-passages/promote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftIds: ids }),
      });
      if (!res.ok) throw new Error("등록 요청이 실패했습니다.");
      const data = (await res.json()) as {
        summary: { promoted: number; skipped: number; failed: number };
        outcomes: Array<{
          draftId: string;
          status: string;
          passageId?: string;
        }>;
      };
      const promotedPassageByDraft = new Map<string, string | undefined>();
      for (const o of data.outcomes) {
        if (o.status === "promoted")
          promotedPassageByDraft.set(o.draftId, o.passageId);
      }
      if (promotedPassageByDraft.size > 0) {
        const nowIso = new Date().toISOString();
        setDrafts((current) =>
          current.map((d) => {
            if (!promotedPassageByDraft.has(d.id)) return d;
            const passageId = promotedPassageByDraft.get(d.id);
            return {
              ...d,
              reviewStatus: "COMMITTED",
              savedPassageId: passageId ?? d.savedPassageId,
              confirmedAt: d.confirmedAt ?? nowIso,
            };
          }),
        );
      }
      clearSelection();
      queueDrawer.triggerRefresh();

      const { promoted, skipped, failed } = data.summary;
      if (failed === 0 && skipped === 0) {
        toast.success(`${promoted}개 자료를 지문으로 등록했습니다.`);
      } else if (promoted === 0) {
        toast.error(
          "등록된 자료가 없습니다. (이미 등록되었거나 출처/본문이 없는 자료)",
        );
      } else {
        toast.warning(`${promoted}개 등록, ${skipped + failed}개 건너뜀/실패`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "등록 요청에 실패했습니다.",
      );
    } finally {
      setBulkActionRunning(null);
    }
  }, [selectedIds, bulkActionRunning, clearSelection]);

  const handleAddToFolder = useCallback(
    async (collectionId: string) => {
      const ok = await folders.handleAddToFolder(collectionId, selectedIds);
      if (ok) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  const handleMoveToFolder = useCallback(
    async (collectionId: string) => {
      const ok = await folders.handleDragToFolder(
        [...selectedIds],
        collectionId,
        false,
        selectedIds,
      );
      if (ok) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  const handleDragToFolder = useCallback(
    async (itemId: string | string[], folderId: string, copy: boolean) => {
      await folders.handleDragToFolder(itemId, folderId, copy, selectedIds);
    },
    [folders, selectedIds],
  );

  const handleDragToRoot = useCallback(
    async (itemId: string | string[], copy: boolean) => {
      if (copy) {
        toast.info("전체 자료에는 이미 포함되어 있습니다.");
        return;
      }
      const draggedIds = Array.isArray(itemId) ? itemId : [itemId];
      const shouldUseSelection = draggedIds.some((id) => selectedIds.has(id));
      const idsToMove = shouldUseSelection
        ? [...selectedIds]
        : Array.from(new Set(draggedIds));
      if (idsToMove.length === 0) return;
      const ok = await folders.handleRemoveFromFolder(new Set(idsToMove));
      if (ok) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  // ─── Search submission ───
  const navigateToFolderView = useCallback(
    (folderId: string | null) => {
      folders.navigateToFolder(folderId);
      setJobFilter(new Set());
      setResultScope("all");
      setJobId(null);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
      clearSelection();
    },
    [folders, clearSelection],
  );

  const handleSearchSubmit = useCallback(() => {
    setAppliedSearch(searchValue);
  }, [searchValue]);

  const resetFilters = useCallback(() => {
    setSearchValue("");
    setAppliedSearch("");
    setStatusFilter("ALL");
    setSortOrder("newest");
    setJobFilter(new Set());
  }, []);

  // ─── Selection toolbar extra actions ───
  const isRerestoring = bulkActionRunning === "rerestore";
  const isDeleting = bulkActionRunning === "delete";
  const isPromoting = bulkActionRunning === "promote";
  const anyBulkRunning = bulkActionRunning !== null;

  const noSelection = selectedIds.size === 0;
  const selectionExtraActions = (
    <>
      <MoveOrCopyFolderPicker
        collections={folders.collections}
        activeFolder={folders.activeFolder}
        selectedCount={selectedIds.size}
        onCopy={handleAddToFolder}
        onMove={handleMoveToFolder}
        disabled={anyBulkRunning || noSelection}
      />

      <button
        type="button"
        onClick={bulkRerestore}
        disabled={anyBulkRunning || noSelection}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRerestoring ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        AI 복원 다시
      </button>

      <button
        type="button"
        onClick={bulkPromote}
        disabled={anyBulkRunning || noSelection}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPromoting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        지문 등록
      </button>

      <button
        type="button"
        onClick={bulkDelete}
        disabled={anyBulkRunning || noSelection}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDeleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        삭제
      </button>
    </>
  );

  const filtersToolbar = (
    <ManageFiltersBar
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={handleSearchSubmit}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      sortOrder={sortOrder}
      onSortOrderChange={setSortOrder}
      queueOpen={queueDrawer.open}
      onToggleQueue={queueDrawer.toggle}
      onRefresh={refreshResults}
    />
  );

  const hasActiveSearchOrFilter =
    appliedSearch.trim().length > 0 ||
    statusFilter !== "ALL" ||
    (folders.activeFolder === null && jobFilter.size > 0);
  const isAllSelected =
    selectedIds.size > 0 && selectedIds.size === displayedDrafts.length;

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] min-w-0 flex-col bg-[#F4F6F9]">
      <div className="mx-auto flex h-full w-full min-w-0 max-w-[1680px] flex-col">
        {error ? (
          <div className="mx-6 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 sm:mx-8">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-6 pt-3 pb-2 sm:px-8">
            <DraftFolderSection
              childFolders={folders.childFolders}
              activeFolder={folders.activeFolder}
              dragItemIdKey="draftId"
              itemCountLabel="자료"
              showNewFolder={folders.showNewFolder}
              newFolderName={folders.newFolderName}
              onNewFolderNameChange={folders.setNewFolderName}
              onShowNewFolder={folders.setShowNewFolder}
              onCreateFolder={folders.handleCreateFolder}
              onNavigateToFolder={(id) => {
                navigateToFolderView(id);
              }}
              onRenameFolder={folders.handleRenameFolder}
              onDeleteFolder={folders.handleDeleteFolder}
              onDragToFolder={handleDragToFolder}
              onDragToRoot={handleDragToRoot}
              breadcrumbPath={folders.breadcrumbPath}
              onNavigateToRoot={() => {
                navigateToFolderView(null);
              }}
              toolbar={filtersToolbar}
              selectionBar={
                <DraftSelectionToolbar
                  embedded
                  selectedCount={selectedIds.size}
                  totalCount={displayedDrafts.length}
                  isAllSelected={isAllSelected}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  activeFolder={folders.activeFolder}
                  onRemoveFromFolder={handleRemoveFromFolderClick}
                  extraActions={selectionExtraActions}
                />
              }
              pageHeader={{
                icon: <Database className="h-3.5 w-3.5" aria-hidden="true" />,
                title: "자료 관리",
                totalCount:
                  resultScope === "all" && folders.activeFolder === null
                    ? serverVisibleDraftTotal || drafts.length
                    : draftsInActiveFolder.length,
                itemLabel: "자료",
                description:
                  "추출한 지문을 폴더로 정리하고 복원문을 검수합니다.",
              }}
              resultScope={resultScope}
              onBackToAllResults={showAllResults}
            />
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-5 sm:px-8 sm:pb-6">
            <DraftGrid
              drafts={displayedDrafts}
              loading={loadingDetails && drafts.length === 0}
              hasAnyDraft={drafts.length > 0}
              inFolder={folders.activeFolder !== null}
              hasActiveSearchOrFilter={hasActiveSearchOrFilter}
              selectedDraftId={selectedDraftId}
              checkedIds={selectedIds}
              gridCols={gridCols}
              onGridColsChange={setGridCols}
              onSelectDraft={openDraftDetail}
              onToggleCheck={toggleSelect}
              onToggleGroupCheck={toggleGroupCheck}
              onResetFilters={resetFilters}
              jobs={availableJobs}
              selectedJobIds={jobFilter}
              totalDraftCount={
                folders.activeFolder === null
                  ? serverVisibleDraftTotal || draftsInActiveFolder.length
                  : draftsInActiveFolder.length
              }
              onSelectJob={(nextJobId) => {
                void (async () => {
                  if (nextJobId === null) {
                    setJobFilter(new Set());
                    await loadAllDrafts();
                    return;
                  }

                  const next = new Set(jobFilter);
                  if (next.has(nextJobId)) next.delete(nextJobId);
                  else next.add(nextJobId);

                  setJobFilter(next);
                  if (typeof window !== "undefined") {
                    const nextUrl =
                      next.size === 1
                        ? "?jobId=" + Array.from(next)[0]
                        : window.location.pathname;
                    window.history.replaceState(null, "", nextUrl);
                  }
                  if (next.size === 0) await loadAllDrafts();
                  else if (next.size === 1) {
                    const [targetJobId] = Array.from(next);
                    await loadJobDetails(targetJobId);
                  } else await loadJobsDetails(next);
                })();
              }}
              onRenameJob={renameJob}
              onRenameSourceMaterial={renameSourceMaterial}
              groupIndexBySourceMaterialId={groupIndexBySourceMaterialId}
            />
          </div>
        </div>

        {detailLoadingId && !selectedDraft ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-xl">
              <Loader2 className="size-4 animate-spin text-blue-600" />
              자료 상세를 불러오는 중
            </div>
          </div>
        ) : null}

        {selectedDraft ? (
          <DraftDetailModal
            draft={selectedDraft}
            savingId={savingId}
            rerestoringId={rerestoringId}
            deletingDraftId={deletingDraftId}
            promotingId={promotingId}
            onClose={closeDraftDetail}
            onDelete={deleteDraft}
            onRerestore={rerestoreDraft}
            onSave={saveDraft}
            onPromote={promoteDraft}
            onTextChange={updateDraftText}
            onTitleChange={updateDraftTitle}
          />
        ) : null}
      </div>
    </div>
  );
}
