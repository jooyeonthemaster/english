import type { M1PassageDraftWithJob } from "./types";

export interface JobMetaSnapshot {
  thumbnailUrl: string | null;
  status: string;
  displayName: string | null;
  originalFileName: string | null;
  createdAt: string;
  /** Expected passage count, fixed at job creation (= number of crop regions).
   *  Lets us show "추출 중 N개" for an in-flight job before its drafts exist. */
  totalPages: number;
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
 * 과목 스코프 캐시 키 — 국어/영어 라우트가 같은 모듈 캐시를 공유하면서도 서로의
 * 스냅샷을 절대 보여주지 않도록 슬롯을 분리한다. 미전달(undefined)=영어(기존)로,
 * 영어 라우트의 캐시 동작은 한 줄도 달라지지 않는다(무회귀).
 */
type SubjectScopeKey = "ENGLISH" | "KOREAN";
function scopeKey(subject?: "KOREAN"): SubjectScopeKey {
  return subject === "KOREAN" ? "KOREAN" : "ENGLISH";
}

/**
 * Module-level cache so the manage page can repaint instantly on nav
 * (e.g. coming back from a draft detail / extraction page) while the
 * background fetch refreshes the snapshot. Cleared on full reload.
 *
 * 과목별로 분리 저장한다 — 영어 라우트가 영어 스냅샷을, 국어 라우트가 국어
 * 스냅샷을 각각 캐시해 라우트 전환 순간에도 교차 노출이 없다.
 */
const cachedDraftsByScope: Record<SubjectScopeKey, M1PassageDraftWithJob[] | null> = {
  ENGLISH: null,
  KOREAN: null,
};
const cachedJobMetaByScope: Record<
  SubjectScopeKey,
  Map<string, JobMetaSnapshot> | null
> = {
  ENGLISH: null,
  KOREAN: null,
};

export function getCachedDrafts(
  subject?: "KOREAN",
): M1PassageDraftWithJob[] | null {
  return cachedDraftsByScope[scopeKey(subject)];
}

export function setCachedDrafts(
  value: M1PassageDraftWithJob[] | null,
  subject?: "KOREAN",
): void {
  cachedDraftsByScope[scopeKey(subject)] = value;
}

export function patchCachedDraft(
  id: string,
  patch: Partial<M1PassageDraftWithJob>,
  subject?: "KOREAN",
): void {
  const key = scopeKey(subject);
  const current = cachedDraftsByScope[key];
  if (!current) return;
  cachedDraftsByScope[key] = current.map((draft) =>
    draft.id === id ? { ...draft, ...patch } : draft,
  );
}

export function getCachedJobMeta(
  subject?: "KOREAN",
): Map<string, JobMetaSnapshot> | null {
  return cachedJobMetaByScope[scopeKey(subject)];
}

export function setCachedJobMeta(
  value: Map<string, JobMetaSnapshot>,
  subject?: "KOREAN",
): void {
  cachedJobMetaByScope[scopeKey(subject)] = value;
}

export async function fetchAllDraftPages(
  subject?: "KOREAN",
): Promise<M1PassageDraftWithJob[]> {
  const allDrafts: M1PassageDraftWithJob[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({
      limit: String(ALL_DRAFT_PAGE_SIZE),
      view: "list",
    });
    // 과목 스코프 — 국어 라우트만 subject=KOREAN 을 실어 국어 자료만 조회한다.
    // 미전달=영어 기본(서버가 국어 자료 제외). 서버 필터가 신뢰 경계.
    if (subject === "KOREAN") params.set("subject", "KOREAN");
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
