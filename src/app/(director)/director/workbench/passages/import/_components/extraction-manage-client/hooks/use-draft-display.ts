import { useMemo, useState } from "react";

import { formatShortTimestamp, type JobMetaSnapshot } from "../drafts-cache";
import type { GridCols } from "../components/draft-grid";
import type {
  SortOrder,
  StatusFilter,
} from "../components/manage-header";
import type { M1PassageDraftWithJob } from "../types";

interface UseDraftDisplayParams {
  drafts: M1PassageDraftWithJob[];
  draftsInActiveFolder: M1PassageDraftWithJob[];
  activeFolder: string | null;
  jobMetaByJobId: Map<string, JobMetaSnapshot>;
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
}: UseDraftDisplayParams) {
  const [searchValue, setSearchValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [gridCols, setGridCols] = useState<GridCols>(3);
  const [jobFilter, setJobFilter] = useState<Set<string>>(() => new Set());

  const displayedDrafts = useMemo(() => {
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
    activeFolder,
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

  const hasActiveSearchOrFilter =
    appliedSearch.trim().length > 0 ||
    statusFilter !== "ALL" ||
    (activeFolder === null && jobFilter.size > 0);

  const resetFilters = () => {
    setSearchValue("");
    setAppliedSearch("");
    setStatusFilter("ALL");
    setSortOrder("newest");
    setJobFilter(new Set());
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
    // derived
    displayedDrafts,
    availableJobs,
    serverVisibleDraftTotal,
    groupIndexBySourceMaterialId,
    hasActiveSearchOrFilter,
    // actions
    resetFilters,
  };
}
