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

  return { items, total, page, pageSize, totalPages, facets: FACETS };
}
