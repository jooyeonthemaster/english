import "server-only";

// 기출 지문 코퍼스 — 서버 전용 로더.
// 정적 JSON(src/data/exam-passages/*.json)을 모듈 스코프에 한 번 적재해 캐시한다.
// 이 모듈을 import 하는 서버 코드(라우트·액션)만 1.9MB JSON 을 번들에 포함하므로
// 클라이언트 컴포넌트는 절대 이 파일을 import 하지 말 것(브라우저는 /api/exam-passages 사용).

import passagesJson from "@/data/exam-passages/passages.json";
import facetsJson from "@/data/exam-passages/facets.json";
import type {
  ExamPassage,
  ExamPassageFacets,
  ExamPassageListResponse,
  ExamPassageQuery,
} from "./types";
import { EXAM_MAX_IDS, EXAM_PAGE_SIZE } from "./types";
import { formatExamTitle } from "./format";

// 본문이 비어있는 레코드는 방어적으로 제외(빌드 단계에서 이미 드롭하지만, 코퍼스
// 재생성 시 함정이 재발해도 빈 카드 노출·선택·import 크래시가 없도록 2차 가드).
const ALL = (passagesJson as unknown as ExamPassage[]).filter(
  (p) => typeof p.text === "string" && p.text.trim().length > 0,
);
const FACETS = facetsJson as unknown as ExamPassageFacets;

// id → 레코드, 빠른 일괄 조회용.
const BY_ID = new Map<string, ExamPassage>(ALL.map((p) => [p.id, p]));

// 검색 blob(소문자) — 본문 + 제목 + 메타. 한 번만 계산해 캐시.
const SEARCH_BLOB = new Map<string, string>(
  ALL.map((p) => [
    p.id,
    [
      p.text,
      formatExamTitle(p),
      p.type,
      p.exam,
      p.board,
      String(p.year),
    ]
      .join(" ")
      .toLowerCase(),
  ]),
);

/** 전체 facet(정적 카운트). */
export function getExamFacets(): ExamPassageFacets {
  return FACETS;
}

/**
 * 동적 facet — 각 차원의 선택지/카운트를 "그 차원을 제외한 나머지 필터"로 좁혀 계산.
 * 예: 학년=고1 선택 시 회차 옵션은 고1에 실제 존재하는 회차(3·6·9·11월 등)만 노출되고
 * 수능·7월·예비처럼 고1에 없는 회차는 사라진다(표준 faceted-search).
 * 선택지는 count>0 인 것만, 정렬은 전역 FACETS 의 정준 순서를 유지.
 */
function computeFacets(query: ExamPassageQuery, q: string): ExamPassageFacets {
  const subsetExcept = (omit: keyof ExamPassageQuery): ExamPassage[] => {
    const sub: ExamPassageQuery = { ...query, [omit]: undefined };
    return ALL.filter((p) => matches(p, sub, q));
  };
  const tally = <K extends string | number>(
    recs: ExamPassage[],
    keyFn: (p: ExamPassage) => K,
  ): Record<K, number> => {
    const m = {} as Record<K, number>;
    for (const p of recs) {
      const k = keyFn(p);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  };

  const gradeCounts = tally(subsetExcept("grades"), (p) => p.grade ?? "고3");
  const examCounts = tally(subsetExcept("exams"), (p) => p.exam);
  const typeCounts = tally(subsetExcept("typeGroups"), (p) => p.typeGroup);
  const reconCounts = tally(
    subsetExcept("reconKinds"),
    (p) => p.reconstructionKind,
  );
  const yearCounts = tally(subsetExcept("years"), (p) => p.year);
  const boardCounts = tally(subsetExcept("boards"), (p) => p.board);
  const eraCounts = tally(ALL.filter((p) => matches(p, query, q)), (p) => p.era);

  const present = <T extends string | number>(
    ordered: T[],
    counts: Record<string | number, number>,
  ): T[] => ordered.filter((v) => (counts[v] ?? 0) > 0);

  return {
    total: FACETS.total,
    grades: present(FACETS.grades, gradeCounts),
    exams: present(FACETS.exams, examCounts),
    typeGroups: present(FACETS.typeGroups, typeCounts),
    reconKinds: present(FACETS.reconKinds, reconCounts),
    years: (Object.keys(yearCounts) as unknown as number[])
      .map(Number)
      .sort((a, b) => b - a),
    boards: present(FACETS.boards, boardCounts),
    eras: present(FACETS.eras, eraCounts),
    counts: {
      grade: gradeCounts,
      exam: examCounts,
      typeGroup: typeCounts,
      reconstructionKind: reconCounts,
      era: eraCounts,
      board: boardCounts,
    },
  };
}

/** id 목록으로 레코드를 그 순서대로 반환(선택분 일괄 조회). 없는 id는 건너뜀. */
export function getExamPassagesByIds(ids: string[]): ExamPassage[] {
  const out: ExamPassage[] = [];
  const seen = new Set<string>();
  for (const raw of ids.slice(0, EXAM_MAX_IDS)) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const found = BY_ID.get(id);
    if (found) out.push(found);
  }
  return out;
}

function matches(p: ExamPassage, query: ExamPassageQuery, q: string): boolean {
  if (q && !(SEARCH_BLOB.get(p.id) ?? "").includes(q)) return false;
  if (query.years && query.years.length > 0 && !query.years.includes(p.year))
    return false;
  if (query.exams && query.exams.length > 0 && !query.exams.includes(p.exam))
    return false;
  if (
    query.grades &&
    query.grades.length > 0 &&
    !query.grades.includes(p.grade ?? "고3")
  )
    return false;
  if (query.boards && query.boards.length > 0 && !query.boards.includes(p.board))
    return false;
  if (
    query.typeGroups &&
    query.typeGroups.length > 0 &&
    !query.typeGroups.includes(p.typeGroup)
  )
    return false;
  if (
    query.reconKinds &&
    query.reconKinds.length > 0 &&
    !query.reconKinds.includes(p.reconstructionKind)
  )
    return false;
  return true;
}

/**
 * 코퍼스 질의 — 필터 + 페이지네이션. `ids` 가 주어지면 그 레코드만(페이지네이션 무시).
 * 정렬은 이미 데이터가 연도desc→회차→문항 순으로 정렬돼 있으므로 그대로 유지.
 */
export function queryExamPassages(
  query: ExamPassageQuery,
): ExamPassageListResponse {
  if (query.ids && query.ids.length > 0) {
    const items = getExamPassagesByIds(query.ids);
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

  const pageSize = Math.min(
    Math.max(1, query.pageSize ?? EXAM_PAGE_SIZE),
    100,
  );
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
