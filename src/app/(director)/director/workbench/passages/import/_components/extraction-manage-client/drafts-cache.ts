import type { M1PassageDraftWithJob } from "./types";

export interface JobMetaSnapshot {
  thumbnailUrl: string | null;
  status: string;
  displayName: string | null;
  originalFileName: string | null;
  createdAt: string;
  resultCount: number;
  draftResultCount: number;
  savedResultCount: number;
}

interface M1DraftListResponse {
  drafts: M1PassageDraftWithJob[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

const ALL_DRAFT_PAGE_SIZE = 300;

/**
 * Module-level cache so the manage page can repaint instantly on nav
 * (e.g. coming back from a draft detail / extraction page) while the
 * background fetch refreshes the snapshot. Cleared on full reload.
 */
let cachedDrafts: M1PassageDraftWithJob[] | null = null;
let cachedJobMeta: Map<string, JobMetaSnapshot> | null = null;

export function getCachedDrafts(): M1PassageDraftWithJob[] | null {
  return cachedDrafts;
}

export function setCachedDrafts(value: M1PassageDraftWithJob[] | null): void {
  cachedDrafts = value;
}

export function patchCachedDraft(
  id: string,
  patch: Partial<M1PassageDraftWithJob>,
): void {
  if (!cachedDrafts) return;
  cachedDrafts = cachedDrafts.map((draft) =>
    draft.id === id ? { ...draft, ...patch } : draft,
  );
}

export function getCachedJobMeta(): Map<string, JobMetaSnapshot> | null {
  return cachedJobMeta;
}

export function setCachedJobMeta(value: Map<string, JobMetaSnapshot>): void {
  cachedJobMeta = value;
}

export async function fetchAllDraftPages(): Promise<M1PassageDraftWithJob[]> {
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

export function formatShortTimestamp(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
