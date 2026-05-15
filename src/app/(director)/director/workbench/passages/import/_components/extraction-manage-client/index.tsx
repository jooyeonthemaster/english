"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderPlus,
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
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "@/hooks/use-selection";

import { useQueueDrawer } from "../queue-drawer-context";

import { DraftDetailModal } from "./components/draft-detail-modal";
import { DraftFolderSection } from "./components/draft-folder-section";
import { DraftGrid, type GridCols } from "./components/draft-grid";
import { DraftSelectionToolbar } from "./components/draft-selection-toolbar";
import {
  ManageHeader,
  type SortOrder,
  type StatusFilter,
} from "./components/manage-header";
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

export function ExtractionManageClient({
  academyId,
  initialCollections,
  initialCollectionMembership,
}: ExtractionManageClientProps) {
  void academyId;

  // ─── Data state ───
  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rerestoringId, setRerestoringId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [resultScope, setResultScope] = useState<"all" | "job">("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const queueDrawer = useQueueDrawer();

  // ─── UI state ───
  const [searchValue, setSearchValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [gridCols, setGridCols] = useState<GridCols>(3);
  const [jobFilter, setJobFilter] = useState<string | null>(null);
  const [addToFolderOpen, setAddToFolderOpen] = useState(false);
  const addToFolderRef = useRef<HTMLDivElement>(null);

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
      setError(err instanceof Error ? err.message : "작업 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadAllDrafts = useCallback(async () => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("자료 목록을 불러오지 못했습니다.");

      const data = (await res.json()) as { drafts: M1PassageDraftWithJob[] };
      setDrafts(data.drafts);
      setSelectedDraftId(null);
      setResultScope("all");
      setJobId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "자료 목록을 불러오지 못했습니다.");
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
        setJobFilter(nextJobId);
        setJobId(nextJobId);
      }
    })();
  }, [loadAllDrafts]);

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
      setDrafts(data.m1PassageDrafts.map((draft) => ({ ...draft, job: jobSummary })));
    } catch {
      /* polling errors are non-fatal */
    }
  }, []);

  const pollAllSilent = useCallback(async () => {
    try {
      const res = await fetch("/api/extraction/m1-passages?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { drafts: M1PassageDraftWithJob[] };
      setDrafts(data.drafts);
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

  // ─── Navigation actions ───
  const showAllResults = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setJobFilter(null);
    void loadAllDrafts();
  }, [loadAllDrafts]);

  const refreshResults = useCallback(() => {
    queueDrawer.triggerRefresh();
    // jobFilter (if any) stays applied to the freshly loaded drafts.
    void loadAllDrafts();
  }, [loadAllDrafts]);

  const openJob = useCallback(
    async (nextJobId: string) => {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "?jobId=" + nextJobId);
      }
      // Reload all drafts so the job filter cards row stays visible with
      // every job represented. Then apply the chosen jobId as a filter.
      // Order matters: loadAllDrafts resets jobId/scope internally, so we
      // set the filter AFTER the await.
      await loadAllDrafts();
      setJobFilter(nextJobId);
      setJobId(nextJobId);
    },
    [loadAllDrafts],
  );

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
          job: { id: string; displayName: string | null; originalFileName: string | null };
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
          err instanceof Error ? err.message : "작업 이름을 저장하지 못했습니다.",
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
      current.map((draft) => (draft.id === id ? { ...draft, teacherText } : draft)),
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
        return current.map((d) => (d.id === id ? { ...d, title: newTitle } : d));
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
      } catch (err) {
        // Rollback
        setDrafts((current) =>
          current.map((d) =>
            d.id === id ? { ...d, title: previousTitle ?? null } : d,
          ),
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
      toast.success("저장되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 내용을 저장하지 못했습니다.");
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
      queueDrawer.triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 복원을 다시 실행하지 못했습니다.");
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
        outcomes: Array<{ draftId: string; status: string; reason?: string }>;
      };
      const outcome = data.outcomes.find((o) => o.draftId === draft.id);
      if (outcome?.status === "promoted") {
        // Remove from local list — committed drafts are filtered out of the
        // server response on next fetch as well.
        setDrafts((current) => current.filter((d) => d.id !== draft.id));
        setSelectedDraftId(null);
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

  const deleteDraft = useCallback(
    async (draft: M1PassageDraftSnapshot) => {
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
        setSelectedDraftId(null);
        queueDrawer.triggerRefresh();
        toast.success("삭제되었습니다.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "지문을 삭제하지 못했습니다.");
      } finally {
        setDeletingDraftId(null);
      }
    },
    [],
  );

  // ─── Folder filtering + search/filter/sort ───
  const draftsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return drafts;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return drafts.filter((d) => ids.has(d.id));
  }, [drafts, folders.activeFolder, folders.membership]);

  const displayedDrafts = useMemo(() => {
    let result = draftsInActiveFolder;

    if (jobFilter) {
      result = result.filter((d) => d.job?.id === jobFilter);
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
  }, [draftsInActiveFolder, jobFilter, appliedSearch, statusFilter, sortOrder]);

  const availableJobs = useMemo(() => {
    type JobAccumulator = {
      jobId: string;
      name: string;
      count: number;
      createdAt: number | null;
    };
    const map = new Map<string, JobAccumulator>();
    for (const d of draftsInActiveFolder) {
      const jobId = d.job?.id;
      if (!jobId) continue;
      const name =
        (d.job?.displayName?.trim() && d.job.displayName) ||
        d.job?.originalFileName ||
        "이름 없는 작업";
      const createdAtRaw = d.job?.createdAt;
      const createdAt =
        createdAtRaw instanceof Date
          ? createdAtRaw.getTime()
          : typeof createdAtRaw === "string"
            ? new Date(createdAtRaw).getTime()
            : null;
      const existing = map.get(jobId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(jobId, { jobId, name, count: 1, createdAt });
      }
    }
    const all = Array.from(map.values()).sort((a, b) => {
      // Most recent first
      if (a.createdAt === null && b.createdAt === null) return 0;
      if (a.createdAt === null) return 1;
      if (b.createdAt === null) return -1;
      return b.createdAt - a.createdAt;
    });

    return all.map((j) => ({
      jobId: j.jobId,
      label: j.name,
      subLabel: j.createdAt !== null ? formatShortTimestamp(j.createdAt) : undefined,
      count: j.count,
    }));
  }, [draftsInActiveFolder]);

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

  const selectedDraft = useMemo(
    () =>
      drafts.find((d) => d.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  // ─── Selection ───
  const getDisplayedIds = useCallback(
    () => displayedDrafts.map((d) => d.id),
    [displayedDrafts],
  );
  const { selectedIds, setSelectedIds, toggleSelect, selectAll, clearSelection } =
    useSelection(getDisplayedIds);

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

  const [bulkActionRunning, setBulkActionRunning] = useState<"delete" | "rerestore" | "promote" | null>(null);

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0 || bulkActionRunning) return;
    const ids = [...selectedIds];
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(`선택한 ${ids.length}개 자료를 삭제할까요? 되돌릴 수 없습니다.`);
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
      toast.error(err instanceof Error ? err.message : "삭제 요청에 실패했습니다.");
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
        outcomes: Array<{ draftId: string; status: string }>;
      };
      const promotedIds = new Set(
        data.outcomes.filter((o) => o.status === "promoted").map((o) => o.draftId),
      );
      if (promotedIds.size > 0) {
        setDrafts((current) => current.filter((d) => !promotedIds.has(d.id)));
      }
      clearSelection();
      queueDrawer.triggerRefresh();

      const { promoted, skipped, failed } = data.summary;
      if (failed === 0 && skipped === 0) {
        toast.success(`${promoted}개 자료를 지문으로 등록했습니다.`);
      } else if (promoted === 0) {
        toast.error("등록된 자료가 없습니다. (이미 등록되었거나 출처/본문이 없는 자료)");
      } else {
        toast.warning(
          `${promoted}개 등록, ${skipped + failed}개 건너뜀/실패`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 요청에 실패했습니다.");
    } finally {
      setBulkActionRunning(null);
    }
  }, [selectedIds, bulkActionRunning, clearSelection]);

  const handleAddToFolder = useCallback(
    async (collectionId: string) => {
      const ok = await folders.handleAddToFolder(collectionId, selectedIds);
      if (ok) {
        clearSelection();
        setAddToFolderOpen(false);
      }
    },
    [folders, selectedIds, clearSelection],
  );

  const handleDragToFolder = useCallback(
    async (itemId: string, folderId: string, copy: boolean) => {
      await folders.handleDragToFolder(itemId, folderId, copy, selectedIds);
    },
    [folders, selectedIds],
  );

  // ─── Close "Add to folder" dropdown on outside click ───
  useEffect(() => {
    if (!addToFolderOpen) return;
    function handleClick(e: MouseEvent) {
      if (addToFolderRef.current && !addToFolderRef.current.contains(e.target as Node)) {
        setAddToFolderOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addToFolderOpen]);

  // ─── Search submission ───
  const handleSearchSubmit = useCallback(() => {
    setAppliedSearch(searchValue);
  }, [searchValue]);

  const resetFilters = useCallback(() => {
    setSearchValue("");
    setAppliedSearch("");
    setStatusFilter("ALL");
    setSortOrder("newest");
    setJobFilter(null);
  }, []);

  // ─── Selection toolbar extra actions ───
  const isRerestoring = bulkActionRunning === "rerestore";
  const isDeleting = bulkActionRunning === "delete";
  const isPromoting = bulkActionRunning === "promote";
  const anyBulkRunning = bulkActionRunning !== null;

  const selectionExtraActions = (
    <>
      <div ref={addToFolderRef} className="relative">
        <button
          type="button"
          onClick={() => setAddToFolderOpen((v) => !v)}
          disabled={anyBulkRunning}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FolderPlus className="size-3.5" />
          폴더에 추가
        </button>
        {addToFolderOpen ? (
          <div className="absolute left-0 top-full z-20 mt-1 w-60 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
            {folders.collections.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">
                먼저 폴더를 만들어주세요.
              </div>
            ) : (
              folders.collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleAddToFolder(c.id)}
                  className="block w-full cursor-pointer truncate rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={bulkRerestore}
        disabled={anyBulkRunning}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRerestoring ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden="true" />
        )}
        AI 복원 다시
      </button>

      <button
        type="button"
        onClick={bulkPromote}
        disabled={anyBulkRunning}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPromoting ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
        )}
        지문 등록
      </button>

      <button
        type="button"
        onClick={bulkDelete}
        disabled={anyBulkRunning}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDeleting ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-3.5" aria-hidden="true" />
        )}
        삭제
      </button>
    </>
  );

  const hasActiveSearchOrFilter =
    appliedSearch.trim().length > 0 ||
    statusFilter !== "ALL" ||
    jobFilter !== null;
  const isAllSelected =
    selectedIds.size > 0 && selectedIds.size === displayedDrafts.length;

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] flex-col bg-[#F4F6F9]">
      <div className="mx-auto flex h-full w-full max-w-[1680px] flex-col">
      <ManageHeader
        totalCount={drafts.length}
        selectedJobId={jobId}
        resultScope={resultScope}
        activeFolder={folders.activeFolder}
        breadcrumbPath={folders.breadcrumbPath}
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
        onBackToAllResults={showAllResults}
        onNavigateUp={() => {
          folders.navigateUp();
          clearSelection();
        }}
        onNavigateToFolder={(id) => {
          folders.navigateToFolder(id);
          clearSelection();
        }}
      />

      {error ? (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 px-6 pt-3 pb-2.5 sm:px-8">
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
              folders.navigateToFolder(id);
              clearSelection();
            }}
            onRenameFolder={folders.handleRenameFolder}
            onDeleteFolder={folders.handleDeleteFolder}
            onDragToFolder={handleDragToFolder}
            breadcrumbPath={folders.breadcrumbPath}
            onNavigateToRoot={() => {
              folders.setActiveFolder(null);
              clearSelection();
            }}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-6 pb-5 sm:px-8 sm:pb-6">
          <DraftGrid
            drafts={displayedDrafts}
            loading={loadingDetails && drafts.length === 0}
            hasAnyDraft={drafts.length > 0}
            inFolder={folders.activeFolder !== null}
            hasActiveSearchOrFilter={hasActiveSearchOrFilter}
            selectedDraftId={selectedDraft?.id ?? null}
            checkedIds={selectedIds}
            gridCols={gridCols}
            onGridColsChange={setGridCols}
            onSelectDraft={setSelectedDraftId}
            onToggleCheck={toggleSelect}
            onToggleGroupCheck={toggleGroupCheck}
            onResetFilters={resetFilters}
            jobs={availableJobs}
            selectedJobId={jobFilter}
            totalDraftCount={draftsInActiveFolder.length}
            onSelectJob={setJobFilter}
            onRenameJob={renameJob}
            onRenameSourceMaterial={renameSourceMaterial}
            groupIndexBySourceMaterialId={groupIndexBySourceMaterialId}
            selectionBar={
              <DraftSelectionToolbar
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
          />
        </div>
      </div>

      {selectedDraft ? (
        <DraftDetailModal
          draft={selectedDraft}
          savingId={savingId}
          rerestoringId={rerestoringId}
          deletingDraftId={deletingDraftId}
          promotingId={promotingId}
          onClose={() => setSelectedDraftId(null)}
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
