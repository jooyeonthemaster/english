import "server-only";

// 국어 기출 지문 코퍼스 — 서버 전용 로더.
// 정적 JSON(src/data/exam-passages-korean/*.json)을 모듈 스코프에 한 번 적재해 캐시.
// 이 모듈을 import 하는 서버 코드(라우트·액션)만 번들에 JSON 을 포함한다.
// 클라이언트는 /api/korean/exam-passages 로 fetch.

import passagesJson from "@/data/exam-passages-korean/passages.json";
import facetsJson from "@/data/exam-passages-korean/facets.json";
import problemsJson from "@/data/exam-passages-korean/problems.json";
import type {
  KoFacets,
  KoPassage,
  KoProblemDetail,
  KoQuery,
  KoListResponse,
} from "./types";
import { KO_MAX_IDS, KO_PAGE_SIZE } from "./types";

const ALL = (passagesJson as unknown as KoPassage[]).filter(
  (p) => typeof p.passageText === "string" && p.passageText.trim().length > 0,
);
const FACETS = facetsJson as unknown as KoFacets;
const PROBLEMS = problemsJson as unknown as Record<string, KoProblemDetail>;

const BY_ID = new Map<string, KoPassage>(ALL.map((p) => [p.id, p]));

// 검색 blob(소문자) — 본문 + 제목 + 분석(주제·제재·키워드·개념). 한 번만 계산해 캐시.
const SEARCH_BLOB = new Map<string, string>(
  ALL.map((p) => {
    const a = p.analysis;
    const parts: string[] = [
      p.passageText,
      p.title,
      p.galae,
      p.subGenre ?? "",
      p.jaejae ?? "",
      String(p.year),
      p.siheng,
    ];
    if (a) {
      parts.push(a["핵심주제"] ?? "", a["요약"] ?? "", a["배경지식영역"] ?? "");
      parts.push(...(a["핵심키워드"] ?? []));
      parts.push(...(a["고유명사_인물_이론"] ?? []));
      for (const c of a["핵심개념"] ?? []) parts.push(c["용어"] ?? "");
    }
    return [p.id, parts.join(" ").toLowerCase()];
  }),
);

// id → 지문의 핵심키워드 집합(키워드 필터용).
const KW_SET = new Map<string, Set<string>>(
  ALL.map((p) => [p.id, new Set(p.analysis?.["핵심키워드"] ?? [])]),
);

export function getKoFacets(): KoFacets {
  return FACETS;
}

export function getKoProblemDetail(id: string): KoProblemDetail | null {
  return PROBLEMS[id] ?? null;
}

function matches(p: KoPassage, query: KoQuery, q: string): boolean {
  if (q && !(SEARCH_BLOB.get(p.id) ?? "").includes(q)) return false;
  if (query.boards?.length && !query.boards.includes(p.board)) return false;
  if (query.grades?.length && !query.grades.includes(p.grade)) return false;
  if (query.years?.length && !query.years.includes(p.year)) return false;
  if (query.sihengs?.length && !query.sihengs.includes(p.siheng)) return false;
  if (query.galaes?.length && !query.galaes.includes(p.galae)) return false;
  if (
    query.subGenres?.length &&
    !(p.subGenre && query.subGenres.includes(p.subGenre))
  )
    return false;
  if (
    query.difficulties?.length &&
    !(p.difficulty && query.difficulties.includes(p.difficulty))
  )
    return false;
  if (query.keywords?.length) {
    const kws = KW_SET.get(p.id);
    if (!kws || !query.keywords.every((k) => kws.has(k))) return false;
  }
  return true;
}

/**
 * 동적 facet — 각 차원을 "그 차원 제외 나머지 필터"로 좁혀 count>0만 노출.
 * 정렬은 전역 FACETS 의 정준 순서 유지.
 */
function computeFacets(query: KoQuery, q: string): KoFacets {
  const subsetExcept = (omit: keyof KoQuery): KoPassage[] => {
    const sub: KoQuery = { ...query, [omit]: undefined };
    return ALL.filter((p) => matches(p, sub, q));
  };
  const tally = <K extends string | number>(
    recs: KoPassage[],
    keyFn: (p: KoPassage) => K | null | undefined,
  ): Record<K, number> => {
    const m = {} as Record<K, number>;
    for (const p of recs) {
      const k = keyFn(p);
      if (k == null) continue;
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  };

  const boardCounts = tally(subsetExcept("boards"), (p) => p.board);
  const gradeCounts = tally(subsetExcept("grades"), (p) => p.grade);
  const yearCounts = tally(subsetExcept("years"), (p) => p.year);
  const sihengCounts = tally(subsetExcept("sihengs"), (p) => p.siheng);
  const galaeCounts = tally(subsetExcept("galaes"), (p) => p.galae);
  const subGenreCounts = tally(subsetExcept("subGenres"), (p) => p.subGenre);
  const diffCounts = tally(subsetExcept("difficulties"), (p) => p.difficulty);
  const sourceCounts = tally(ALL.filter((p) => matches(p, query, q)), (p) => p.sourceKind);

  const present = <T extends string | number>(
    ordered: T[],
    counts: Record<string | number, number>,
  ): T[] => ordered.filter((v) => (counts[v] ?? 0) > 0);

  return {
    total: FACETS.total,
    boards: present(FACETS.boards, boardCounts),
    grades: present(FACETS.grades, gradeCounts),
    years: (Object.keys(yearCounts) as unknown as number[])
      .map(Number)
      .sort((a, b) => b - a),
    sihengs: present(FACETS.sihengs, sihengCounts),
    sourceKinds: present(FACETS.sourceKinds, sourceCounts),
    galaes: present(FACETS.galaes, galaeCounts),
    subGenres: present(FACETS.subGenres, subGenreCounts),
    difficulties: present(FACETS.difficulties, diffCounts),
    counts: {
      board: boardCounts,
      grade: gradeCounts,
      year: { ...(yearCounts as Record<string, number>) },
      siheng: sihengCounts,
      sourceKind: sourceCounts,
      galae: galaeCounts,
      subGenre: subGenreCounts,
      difficulty: diffCounts,
    },
    topKeywords: FACETS.topKeywords,
  };
}

export function getKoPassagesByIds(ids: string[]): KoPassage[] {
  const out: KoPassage[] = [];
  const seen = new Set<string>();
  for (const raw of ids.slice(0, KO_MAX_IDS)) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const found = BY_ID.get(id);
    if (found) out.push(found);
  }
  return out;
}

/** 코퍼스 질의 — 필터 + 페이지네이션. ids 가 주어지면 그 레코드만. */
export function queryKoPassages(query: KoQuery): KoListResponse {
  if (query.ids && query.ids.length > 0) {
    const items = getKoPassagesByIds(query.ids);
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
      totalPages: 1,
      facets: FACETS,
    };
  }
  const q = (query.q ?? "").trim().toLowerCase();
  const filtered = ALL.filter((p) => matches(p, query, q));
  const pageSize = Math.min(Math.max(1, query.pageSize ?? KO_PAGE_SIZE), 100);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), totalPages);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    facets: computeFacets(query, q),
  };
}
