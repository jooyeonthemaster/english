import "server-only";

// 기출 문항 은행 — 서버 전용 로더·질의.
// 정적 JSON(src/data/exam-passages/questions.json)을 모듈 스코프에 한 번 적재해 캐시한다.
// 클라이언트 컴포넌트는 절대 이 파일을 import 하지 말 것(브라우저는 /api/exam-passages/questions 사용).
// 지문 코퍼스 로더(./corpus.ts)와 같은 설계 — facet 은 「나머지 필터로 좁힌 수」(faceted-search 표준).

import questionsJson from "@/data/exam-passages/questions.json";
import facetsJson from "@/data/exam-passages/questions-facets.json";
import { getAllExamBankSets, getExamBankSet } from "./question-bank-sets";
import { groupExamBankRows } from "./question-bank-grouping";
import { examBankNumberKey } from "./question-bank-number-filter";
import {
  EXAM_BANK_IMPORT_MAX,
  EXAM_BANK_PAGE_SIZE,
  EXAM_BANK_SELECT_ALL_MAX,
  type ExamBankFacets,
  type ExamBankItem,
  type ExamBankListResponse,
  type ExamBankQuery,
  type ExamBankRow,
} from "./question-bank-types";

// 방어적 필터 — 직렬화 완성본이 아닌 항목(본문 없음·선지 결손·null 선지)은 서버 부팅에서 걸러 500 을 막는다(26-09-07 실측: null 선지 1건이 라우트 전체를 죽였다).
const ALL = (questionsJson as unknown as ExamBankItem[]).filter(
  (q) =>
    typeof q.questionText === "string" &&
    q.questionText.trim().length > 0 &&
    Array.isArray(q.options) &&
    q.options.length >= 5 &&
    q.options.every((o) => o && typeof o.text === "string"),
);
const FACETS_BASE = facetsJson as unknown as Omit<ExamBankFacets, "qNums" | "counts"> & { counts: Omit<ExamBankFacets["counts"], "qNum"> };
const SETS = new Map(getAllExamBankSets().map((set) => [set.key, set]));
const groupedRows = (items: readonly ExamBankItem[]) => groupExamBankRows(items, SETS, toExamBankRow);
const ALL_ROWS = groupedRows(ALL);
// 번호 옵션과 건수도 목록과 같은 단위로 집계한다(장문 3문항 = 범위 옵션 1건).
const QNUMS_ALL = [...new Set(ALL_ROWS.map(examBankNumberKey))].sort((a, b) =>
  parseInt(String(a), 10) - parseInt(String(b), 10) || String(a).localeCompare(String(b), "en", { numeric: true }),
);
const QNUM_COUNTS_ALL = ALL_ROWS.reduce<Record<string, number>>((counts, row) => {
  const key = String(examBankNumberKey(row));
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
const FACETS: ExamBankFacets = { ...FACETS_BASE, total: groupedRows(ALL).length, qNums: QNUMS_ALL, counts: { ...FACETS_BASE.counts, qNum: QNUM_COUNTS_ALL } };
const BY_ID = new Map<string, ExamBankItem>(ALL.map((q) => [q.id, q]));

/** 은행 전 항목(정본 정렬 그대로) — 렌더 전수 검증 하네스·통계용. 목록 UI 는 queryExamBank 를 쓴다. */
export function getAllExamBankItems(): readonly ExamBankItem[] {
  return ALL;
}

// 검색 blob(소문자) — 본문 전체·발문·선지·제목·메타. 모듈 스코프 1회 계산 캐시(요청당 비용 아님).
// preview(140자)만 넣으면 스펙 §11.3-1 「본문 부분일치」가 지문 첫 두 문장 밖에서는 거짓이 된다
// (검수 minor) → questionText 전체를 넣는다. preview(발문 제거·말줄임 가공본)는 questionText 와 자구가
// 다를 수 있어 그대로 남긴다(3,076건 중 3,060건이 접두 불일치 — 26-09-08 실측).
const SEARCH_BLOB = new Map<string, string>(
  ALL.map((q) => [
    q.id,
    [q.questionText, q.preview, q.setKey ? SETS.get(q.setKey)?.displayedPassage : "", q.direction, q.options.map((o) => o.text).join(" "), q.passageTitle, q.typeGroup, q.exam, String(q.year)]
      .join(" ")
      .toLowerCase(),
  ]),
);

export function getExamBankFacets(): ExamBankFacets {
  return FACETS;
}

function matches(q: ExamBankItem, query: ExamBankQuery, text: string): boolean {
  if (query.yearFrom !== undefined && q.year < query.yearFrom) return false;
  if (query.yearTo !== undefined && q.year > query.yearTo) return false;
  if (query.boards?.length && !query.boards.includes(q.board)) return false;
  if (query.exams?.length && !query.exams.includes(q.exam)) return false;
  if (query.grades?.length && !query.grades.includes(q.grade)) return false;
  if (query.typeGroups?.length && !query.typeGroups.includes(q.typeGroup) && !(q.setKey && query.typeGroups.includes("장문"))) return false;
  if (query.points?.length && !query.points.includes(q.points)) return false;
  if (query.qNums?.length && !query.qNums.includes(examBankNumberKey(q))) return false;
  if (text && !(SEARCH_BLOB.get(q.id) ?? "").includes(text)) return false;
  return true;
}

function computeFacets(query: ExamBankQuery, text: string): ExamBankFacets {
  const subsetExcept = (omit: keyof ExamBankQuery | Array<keyof ExamBankQuery>): ExamBankItem[] => {
    const sub: ExamBankQuery = { ...query };
    for (const k of Array.isArray(omit) ? omit : [omit]) (sub as Record<string, unknown>)[k] = undefined;
    return ALL.filter((q) => matches(q, sub, text));
  };
  const tally = <K extends string | number>(recs: ExamBankItem[], keyFn: (q: ExamBankItem) => K): Record<string, number> => {
    const m: Record<string, number> = {};
    const seen = new Set<string>();
    for (const q of recs) {
      const k = String(keyFn(q));
      const identity = `${q.setKey ?? q.id}:${k}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  };
  const present = <T extends string | number>(ordered: readonly T[], counts: Record<string, number>): T[] =>
    ordered.filter((v) => (counts[String(v)] ?? 0) > 0);
  const yearCounts = tally(subsetExcept(["yearFrom", "yearTo"]), (q) => q.year);
  const examCounts = tally(subsetExcept("exams"), (q) => q.exam);
  const gradeCounts = tally(subsetExcept("grades"), (q) => q.grade);
  const boardCounts = tally(subsetExcept("boards"), (q) => q.board);
  const typeCounts = tally(subsetExcept("typeGroups"), (q) => q.typeGroup);
  typeCounts["장문"] = new Set(subsetExcept("typeGroups").filter((q) => q.setKey).map((q) => q.setKey)).size;
  const qNumCounts = tally(subsetExcept("qNums"), examBankNumberKey);
  return {
    total: FACETS.total,
    years: present(FACETS.years, yearCounts),
    exams: present(FACETS.exams, examCounts),
    grades: present(FACETS.grades, gradeCounts),
    boards: present(FACETS.boards, boardCounts),
    typeGroups: present(FACETS.typeGroups, typeCounts),
    qNums: present(QNUMS_ALL, qNumCounts),
    counts: { year: yearCounts, exam: examCounts, grade: gradeCounts, board: boardCounts, typeGroup: typeCounts, qNum: qNumCounts },
  };
}

export function toExamBankRow(q: ExamBankItem): ExamBankRow {
  return {
    id: q.id,
    passageId: q.passageId,
    examId: q.examId,
    year: q.year,
    exam: q.exam,
    board: q.board,
    grade: q.grade,
    qNum: q.qNum,
    typeGroup: q.typeGroup,
    subType: q.subType,
    points: q.points,
    passageTitle: q.passageTitle,
    preview: q.preview,
    setKey: q.setKey,
    setLabel: q.setLabel,
    setQNums: q.setQNums,
  };
}

/** id 목록으로 은행 항목을 그 순서대로(없는 id 는 건너뜀, 상한 EXAM_BANK_IMPORT_MAX). */
export function getExamBankItemsByIds(ids: readonly string[]): ExamBankItem[] {
  const out: ExamBankItem[] = [];
  const seen = new Set<string>();
  for (const raw of ids.slice(0, EXAM_BANK_IMPORT_MAX)) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const memberIds = getExamBankSet(id)?.memberIds ?? [id];
    for (const memberId of memberIds) {
      const hit = BY_ID.get(memberId);
      if (hit && !out.some((item) => item.id === memberId)) out.push(hit);
    }
  }
  return out;
}

export function getExamBankItem(id: string): ExamBankItem | null {
  return BY_ID.get(id) ?? BY_ID.get(getExamBankSet(id)?.memberIds[0] ?? "") ?? null;
}

function setsForRows(rows: ExamBankRow[]) {
  return Object.fromEntries(rows.flatMap((row) => {
    const set = row.setKey ? SETS.get(row.setKey) : undefined;
    return set ? [[set.key, set]] : [];
  }));
}

/**
 * 회차순(sort:"exam") 비교자 — examId 오름차순 → qNum 오름차순. 같은 examId 에 같은 qNum 이
 * 두 번 올 수는 없지만(은행 id 유일) 안정성을 위해 id 로 마지막 타이브레이크.
 */
function compareByExam(a: ExamBankItem, b: ExamBankItem): number {
  if (a.examId !== b.examId) return a.examId < b.examId ? -1 : 1;
  if (a.qNum !== b.qNum) return a.qNum - b.qNum;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 목록 질의 — 기본 정렬은 은행 정준 순(연도 내림차순 → 회차 → 학년 → 문항번호, 조립 시 확정).
 * sort:"exam" 이면 회차·번호순 **정렬 복사본**을 만든다 — ALL 은 모듈 스코프 캐시라 제자리 정렬은
 * 다음 요청의 기본 순서를 망가뜨린다.
 */
export function queryExamBank(query: ExamBankQuery, opts: { full?: boolean } = {}): ExamBankListResponse {
  const text = (query.q ?? "").trim().toLowerCase();
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? EXAM_BANK_PAGE_SIZE));
  if (query.ids?.length) {
    const full = getExamBankItemsByIds(query.ids);
    const items = groupedRows(full);
    const expanded = getExamBankItemsByIds(items.map((row) => row.id));
    // full=1(프리페치): 페이지의 40건 전체 항목(≈2.6KB/건)을 한 번에 실어 체크 시 단건 GET 을 없앤다(§11.13.1)
    return { items, sets: setsForRows(items), total: items.length, page: 1, pageSize: items.length, totalPages: 1, facets: FACETS, allIds: items.map((i) => i.id), allIdsTruncated: false, ...(opts.full ? { fullItems: expanded } : {}) };
  }
  const matched = ALL.filter((q) => matches(q, query, text));
  const filtered = groupedRows(query.sort === "exam" ? [...matched].sort(compareByExam) : matched);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, query.page ?? 1));
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  return {
    items,
    sets: setsForRows(items),
    total,
    page,
    pageSize,
    totalPages,
    facets: computeFacets(query, text),
    allIds: filtered.slice(0, EXAM_BANK_SELECT_ALL_MAX).map((q) => q.id),
    allIdsTruncated: total > EXAM_BANK_SELECT_ALL_MAX,
  };
}
