import { useEffect, useMemo, useState } from "react";

import { buildDuplicateIndex } from "@/lib/duplicate-detection";

import { formatShortTimestamp, type JobMetaSnapshot } from "../drafts-cache";
import type { GridCols } from "../components/draft-grid";
import type {
  SortOrder,
  StatusFilter,
} from "../components/manage-header";
import type { M1PassageDraftWithJob } from "../types";
import {
  compareDraftAnalysisPriority,
  isDraftAnalysisComplete,
} from "../utils/analysis-status";
import { getDraftDisplayTitle } from "../utils/title";

interface UseDraftDisplayParams {
  drafts: M1PassageDraftWithJob[];
  draftsInActiveFolder: M1PassageDraftWithJob[];
  activeFolder: string | null;
  jobMetaByJobId: Map<string, JobMetaSnapshot>;
  prioritizeAnalysisNeeded?: boolean;
}

const SORT_ORDER_STORAGE_KEY = "smoat:extraction-manage:draft-sort-order";
const SORT_ORDERS: readonly SortOrder[] = [
  "newest",
  "oldest",
  "page_asc",
  "name_asc",
  "name_desc",
];

function readStoredSortOrder(): SortOrder {
  if (typeof window === "undefined") return "newest";
  try {
    const stored = window.localStorage.getItem(SORT_ORDER_STORAGE_KEY);
    return SORT_ORDERS.includes(stored as SortOrder)
      ? (stored as SortOrder)
      : "newest";
  } catch {
    return "newest";
  }
}

/**
 * Owns the filter / sort / search / job-filter / grid-cols UI state and the
 * derived data the grid renders. Pure transformations on top of the data
 * hook's drafts list — no fetching or mutation here.
 */
export function useDraftDisplay({
  drafts,
  draftsInActiveFolder,
  activeFolder,
  jobMetaByJobId,
  prioritizeAnalysisNeeded = false,
}: UseDraftDisplayParams) {
  const [searchValue, setSearchValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortOrder, setSortOrder] =
    useState<SortOrder>(readStoredSortOrder);
  const [gridCols, setGridCols] = useState<GridCols>("grid3");
  const [jobFilter, setJobFilter] = useState<Set<string>>(() => new Set());
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [pageMode, setPageMode] = useState<"list" | "duplicates">("list");

  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_ORDER_STORAGE_KEY, sortOrder);
    } catch {
      /* ignore */
    }
  }, [sortOrder]);

  const filteredDrafts = useMemo(() => {
    let result = draftsInActiveFolder;

    if (activeFolder === null && jobFilter.size > 0) {
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

    return result;
  }, [
    draftsInActiveFolder,
    activeFolder,
    jobFilter,
    appliedSearch,
    statusFilter,
  ]);

  const dupInfo = useMemo(
    () =>
      buildDuplicateIndex(
        filteredDrafts,
        (d) =>
          d.teacherText?.trim() ||
          d.restoredText?.trim() ||
          d.rawText?.trim() ||
          "",
        (d) => d.id,
      ),
    [filteredDrafts],
  );

  const displayedDrafts = useMemo(() => {
    const sorted = [...filteredDrafts];
    sorted.sort((a, b) => {
      if (prioritizeAnalysisNeeded) {
        const analysisDiff = compareDraftAnalysisPriority(a, b);
        if (analysisDiff !== 0) return analysisDiff;
      }

      if (sortOrder === "newest") {
        const aDate = new Date(a.createdAt as unknown as string).getTime();
        const bDate = new Date(b.createdAt as unknown as string).getTime();
        return bDate - aDate;
      }

      if (sortOrder === "oldest") {
        const aDate = new Date(a.createdAt as unknown as string).getTime();
        const bDate = new Date(b.createdAt as unknown as string).getTime();
        return aDate - bDate;
      }

      if (sortOrder === "page_asc") {
        const aPage = a.sourcePageIndex[0] ?? 0;
        const bPage = b.sourcePageIndex[0] ?? 0;
        return aPage - bPage;
      }

      if (sortOrder === "name_asc") {
        return getDraftDisplayTitle(a).localeCompare(
          getDraftDisplayTitle(b),
          "ko",
        );
      }

      if (sortOrder === "name_desc") {
        return getDraftDisplayTitle(b).localeCompare(
          getDraftDisplayTitle(a),
          "ko",
        );
      }

      return 0;
    });

    if (pageMode === "duplicates") {
      return sorted.filter((d) => dupInfo.keyById.has(d.id));
    }

    if (hideDuplicates && dupInfo.keyById.size > 0) {
      const seen = new Set<string>();
      return sorted.filter((d) => {
        const key = dupInfo.keyById.get(d.id);
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return sorted;
  }, [
    filteredDrafts,
    sortOrder,
    prioritizeAnalysisNeeded,
    hideDuplicates,
    pageMode,
    dupInfo,
  ]);

  const availableJobs = useMemo(() => {
    // The job-card row sits above the folder section and stays visible
    // regardless of which folder is open, so counts must come from the full
    // drafts list rather than the folder-scoped slice. Otherwise the card
    // count would drop to 0 the moment a user navigated into a folder.
    const countByJob = new Map<string, number>();
    const analyzedCountByJob = new Map<string, number>();
    const draftIdsByJob = new Map<string, string[]>();
    // Per-job searchable haystack: every draft's title + restored/raw body so
    // the toolbar search can match on the actual 자료 내용, not just the job name.
    const draftSearchByJob = new Map<string, string[]>();
    for (const d of drafts) {
      const jobId = d.job?.id;
      if (!jobId) continue;
      countByJob.set(jobId, (countByJob.get(jobId) ?? 0) + 1);
      if (isDraftAnalysisComplete(d)) {
        analyzedCountByJob.set(jobId, (analyzedCountByJob.get(jobId) ?? 0) + 1);
      }
      const ids = draftIdsByJob.get(jobId) ?? [];
      ids.push(d.id);
      draftIdsByJob.set(jobId, ids);

      const body =
        d.teacherText?.trim() ||
        d.restoredText?.trim() ||
        d.rawText?.trim() ||
        "";
      const parts = draftSearchByJob.get(jobId) ?? [];
      parts.push(d.title ?? "", body);
      draftSearchByJob.set(jobId, parts);
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
        const searchText = [
          label,
          meta.originalFileName ?? "",
          meta.displayName ?? "",
          ...(draftSearchByJob.get(jobId) ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return {
          jobId,
          label,
          count: localCount ?? meta.resultCount,
          analyzedCount: analyzedCountByJob.get(jobId) ?? 0,
          searchText,
          draftIds: draftIdsByJob.get(jobId) ?? [],
          createdAt: Number.isFinite(createdAtMs) ? createdAtMs : null,
          thumbnailUrl: meta.thumbnailUrl,
          status: meta.status,
          totalPages: meta.totalPages,
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
      analyzedCount: j.analyzedCount,
      searchText: j.searchText,
      draftIds: j.draftIds,
      createdAt: j.createdAt,
      thumbnailUrl: j.thumbnailUrl,
      status: j.status,
      totalPages: j.totalPages,
    }));
  }, [drafts, jobMetaByJobId]);

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

  const hasActiveSearchOrFilter =
    appliedSearch.trim().length > 0 ||
    statusFilter !== "ALL" ||
    hideDuplicates ||
    pageMode === "duplicates" ||
    (activeFolder === null && jobFilter.size > 0);

  const resetFilters = () => {
    setSearchValue("");
    setAppliedSearch("");
    setStatusFilter("ALL");
    setSortOrder("newest");
    setJobFilter(new Set());
    setHideDuplicates(false);
    setPageMode("list");
  };

  return {
    // state
    searchValue,
    setSearchValue,
    appliedSearch,
    setAppliedSearch,
    statusFilter,
    setStatusFilter,
    sortOrder,
    setSortOrder,
    gridCols,
    setGridCols,
    jobFilter,
    setJobFilter,
    hideDuplicates,
    setHideDuplicates,
    pageMode,
    setPageMode,
    // derived
    displayedDrafts,
    availableJobs,
    serverVisibleDraftTotal,
    groupIndexBySourceMaterialId,
    hasActiveSearchOrFilter,
    dupInfo,
    duplicateScopeCount: filteredDrafts.length,
    // actions
    resetFilters,
  };
}
