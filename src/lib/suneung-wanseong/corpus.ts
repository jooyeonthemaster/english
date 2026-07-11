import "server-only";

// 2027 수능완성 독서 지문 코퍼스 — 서버 전용 로더.
// 정적 JSON(src/data/suneung-wanseong/*.json)을 모듈 스코프에 한 번 적재해 캐시한다.
// 연계 기출 지문의 표시용 스냅샷은 국어 기출 코퍼스(korean-exam-passages)에서 조인한다.
// 클라이언트는 /api/korean/suneung-wanseong 으로 fetch.

import passagesJson from "@/data/suneung-wanseong/passages.json";
import problemsJson from "@/data/suneung-wanseong/problems.json";
import linksJson from "@/data/suneung-wanseong/links.json";
import facetsJson from "@/data/suneung-wanseong/facets.json";
import { getKoPassagesByIds } from "@/lib/korean-exam-passages/corpus";
import type { KoPassage } from "@/lib/korean-exam-passages/types";
import type {
  SwDetail,
  SwFacets,
  SwLink,
  SwLinkedExam,
  SwListResponse,
  SwPassage,
  SwProblem,
  SwQuery,
  SwRelationType,
} from "./types";

const ALL = passagesJson as unknown as SwPassage[];
const PROBLEMS = problemsJson as unknown as Record<string, SwProblem[]>;
const LINKS = linksJson as unknown as Record<string, SwLink[]>;
const FACETS = facetsJson as unknown as SwFacets;

const BY_ID = new Map<string, SwPassage>(ALL.map((p) => [p.id, p]));

// 검색 blob — 본문 + 제목 + 분석 축 + 연계 근거.
const SEARCH_BLOB = new Map<string, string>(
  ALL.map((p) => {
    const a = p.analysis;
    const parts: string[] = [
      p.passageText,
      p.title,
      p.roundLabel,
      p.subGenre ?? "",
      p.jaejae ?? "",
      a["핵심주제"] ?? "",
      a["요약"] ?? "",
      a["배경지식영역"] ?? "",
      a["출제의도"] ?? "",
      ...(a["핵심키워드"] ?? []),
      ...(a["고유명사_인물_이론"] ?? []),
      ...(a["핵심개념"] ?? []).map((c) => c["용어"]),
      ...(LINKS[p.id] ?? []).map((l) => l.rationale),
    ];
    return [p.id, parts.join(" ").toLowerCase()];
  }),
);

const KW_SET = new Map<string, Set<string>>(
  ALL.map((p) => [p.id, new Set(p.analysis["핵심키워드"] ?? [])]),
);

const REL_SET = new Map<string, Set<SwRelationType>>(
  ALL.map((p) => [
    p.id,
    new Set((LINKS[p.id] ?? []).flatMap((l) => l.relationTypes)),
  ]),
);

export function getSwFacets(): SwFacets {
  return FACETS;
}

function matches(p: SwPassage, query: SwQuery, q: string): boolean {
  if (q && !(SEARCH_BLOB.get(p.id) ?? "").includes(q)) return false;
  if (query.rounds?.length && !query.rounds.includes(p.roundNo)) return false;
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
  if (query.relationTypes?.length) {
    const rels = REL_SET.get(p.id);
    if (!rels || !query.relationTypes.some((r) => rels.has(r))) return false;
  }
  return true;
}

/** 동적 facet — 각 차원을 "그 차원 제외 나머지 필터"로 좁혀 count>0 만 노출. */
function computeFacets(query: SwQuery, q: string): SwFacets {
  const subsetExcept = (omit: keyof SwQuery): SwPassage[] => {
    const sub: SwQuery = { ...query, [omit]: undefined };
    return ALL.filter((p) => matches(p, sub, q));
  };
  const tally = <K extends string | number>(
    recs: SwPassage[],
    keyFn: (p: SwPassage) => K | null | undefined,
  ): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const p of recs) {
      const k = keyFn(p);
      if (k == null) continue;
      m[String(k)] = (m[String(k)] ?? 0) + 1;
    }
    return m;
  };

  const roundCounts = tally(subsetExcept("rounds"), (p) => p.roundNo);
  const subGenreCounts = tally(subsetExcept("subGenres"), (p) => p.subGenre);
  const diffCounts = tally(subsetExcept("difficulties"), (p) => p.difficulty);

  const relCounts: Record<string, number> = {};
  for (const p of subsetExcept("relationTypes")) {
    for (const r of REL_SET.get(p.id) ?? []) relCounts[r] = (relCounts[r] ?? 0) + 1;
  }

  const present = <T extends string | number>(
    ordered: T[],
    counts: Record<string, number>,
  ): T[] => ordered.filter((v) => (counts[String(v)] ?? 0) > 0);

  return {
    total: FACETS.total,
    // total/totalLinks와 동일하게 전체 코퍼스 통계다. 현재 검색 건수는 응답의 total이 담당한다.
    totalTexts: FACETS.totalTexts,
    totalLinks: FACETS.totalLinks,
    rounds: present(FACETS.rounds, roundCounts),
    subGenres: present(FACETS.subGenres, subGenreCounts),
    difficulties: present(FACETS.difficulties, diffCounts),
    relationTypes: present(FACETS.relationTypes, relCounts),
    counts: {
      round: roundCounts,
      subGenre: subGenreCounts,
      difficulty: diffCounts,
      relationType: relCounts,
    },
    topKeywords: FACETS.topKeywords,
  };
}

export function querySwPassages(query: SwQuery): SwListResponse {
  const q = (query.q ?? "").trim().toLowerCase();
  const items = ALL.filter((p) => matches(p, query, q)).sort(
    (a, b) => a.roundNo - b.roundNo || a.qFrom - b.qFrom,
  );
  return { items, total: items.length, facets: computeFacets(query, q) };
}

/** 연계 링크에 기출 지문 스냅샷을 조인한다(강→중→약, 점수 내림차순). */
export function getSwLinkedExams(id: string): SwLinkedExam[] {
  const links = LINKS[id] ?? [];
  if (links.length === 0) return [];
  const exams = new Map<string, KoPassage>(
    getKoPassagesByIds(links.map((l) => l.examPassageId)).map((p) => [p.id, p]),
  );
  const rank: Record<string, number> = { 강: 0, 중: 1, 약: 2 };
  return links
    .flatMap<SwLinkedExam>((l) => {
      const e = exams.get(l.examPassageId);
      if (!e) return [];
      return [
        {
          ...l,
          exam: {
            id: e.id,
            title: e.title,
            board: e.board,
            grade: e.grade,
            year: e.year,
            siheng: e.siheng,
            subGenre: e.subGenre,
            jaejae: e.jaejae,
            difficulty: e.difficulty,
            qFrom: e.qFrom,
            qTo: e.qTo,
            wordCount: e.wordCount,
            nProblems: e.nProblems,
            핵심주제: e.analysis?.["핵심주제"] ?? "",
            요약: e.analysis?.["요약"] ?? "",
            핵심키워드: e.analysis?.["핵심키워드"] ?? [],
          },
        },
      ];
    })
    .sort(
      (a, b) =>
        rank[a.strength] - rank[b.strength] || b.retrievalScore - a.retrievalScore,
    );
}

export function getSwDetail(id: string): SwDetail | null {
  const passage = BY_ID.get(id);
  if (!passage) return null;
  return {
    passage,
    problems: PROBLEMS[id] ?? [],
    links: getSwLinkedExams(id),
  };
}

/** 연계 기출 지문 원문(모달용) — 기출 코퍼스에서 한 건. */
export function getSwExamFull(examId: string): KoPassage | null {
  return getKoPassagesByIds([examId])[0] ?? null;
}
