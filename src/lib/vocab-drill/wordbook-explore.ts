// ============================================================================
// 단어장 생성 스튜디오 — 탐색 질의 계층 (server-only)
//
// 디렉터 「단어장 생성」(/director/workbench/wordbook)의 데이터 정본.
// 탐색 단위는 **sense**다 — 덱(저장된 질의)의 단위가 sense 이고, senses 테이블이
// 서빙용으로 표제어 필드를 역정규화해 들고 있어(init.sql 3-2) 조인 없이 전 축
// 필터가 선다. "대표 뜻만"(기본값)은 senseOrder=0 한정 — 표제어당 1행이 된다.
//
// 시행처(수능/모평/학평) 카운트는 lemma_year_stats.byBoard JSONB 에만 있으므로
// 탐색 질의는 항상 raw SQL + LEFT JOIN 으로 간다(단일 코드 경로 — 시행처 렌즈가
// 켜질 때만 조인하는 이원화를 두지 않는다. 35k×27k 해시 조인은 수 ms).
// ============================================================================
import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { VOCAB_STOPWORDS } from "./constants";

// ── 계약 타입 ────────────────────────────────────────────────────────────────

export type WordbookBoard = "수능" | "모평" | "학평";

/** byBoard JSONB 의 실제 키(적재기 산출 그대로) — 화면 라벨과 분리해 둔다. */
const BOARD_JSON_KEY: Record<WordbookBoard, string> = {
  수능: "대학수학능력시험",
  모평: "수능모의평가",
  학평: "학력평가",
};

export interface WordbookFilter {
  /** 표제어 접두 검색 — 소문자 정규화, [a-z0-9' -] 외 문자는 버린다 */
  q?: string;
  posList?: string[];
  tiers?: string[];
  difficulties?: number[];
  /** gradeTop(주 출현 학년) 매칭 — 고1 | 고2 | 고3 */
  grades?: string[];
  trendLabels?: string[];
  excludePhrase?: boolean;
  /** true = 모든 뜻 행 노출. 기본(false)은 대표 뜻(senseOrder=0)만 */
  allSenses?: boolean;
  /** 함정률 하한(0~1) — 함정 렌즈. trapCount>0 동반 강제 */
  minTrapRate?: number;
  /** 시행처 렌즈 — 해당 시행처 출현 1회 이상 + 그 카운트 정렬 기본 */
  board?: WordbookBoard;
  /**
   * 기능어 배제(기본 렌즈용) — 학생 드릴 큐와 동일 목록(VOCAB_STOPWORDS).
   * 실측(2026-08-04): 품사·난이도 필터만으론 to(~에 대한)·of(~중에서) 류가
   * difficulty 2+ 로 태깅돼 빈출 상단을 다 차지한다.
   */
  excludeStopwords?: boolean;
}

export type WordbookSort =
  | "per10k"
  | "occurrences"
  | "trapRate"
  | "difficulty"
  | "lemma"
  | "sn" // 수능 출현 수
  | "mp" // 모평 출현 수
  | "hp"; // 학평 출현 수

export interface WordbookSenseRow {
  senseId: string;
  lemmaId: string;
  lemma: string;
  pos: string;
  isPhrase: boolean;
  senseKo: string;
  senseOrder: number;
  /** 이 표제어의 활성 뜻 수(다의어 표지) */
  lemmaSenseCount: number;
  tier: string;
  difficulty: number;
  occurrences: number;
  exampleCount: number;
  trapCount: number;
  trapRate: number;
  per10k: number | null;
  gradeTop: string | null;
  trendLabel: string | null;
  trendRatio: number | null;
  /** 시행처별 표제어 출현 수 — year_stats.byBoard */
  sn: number;
  mp: number;
  hp: number;
}

export interface WordbookPage {
  rows: WordbookSenseRow[];
  total: number;
}

// ── 필터 → WHERE 절 ──────────────────────────────────────────────────────────

const SORT_SQL: Record<WordbookSort, Prisma.Sql> = {
  per10k: Prisma.sql`s."per10k" DESC NULLS LAST, s.occurrences DESC, s.lemma ASC`,
  occurrences: Prisma.sql`s.occurrences DESC, s.lemma ASC`,
  trapRate: Prisma.sql`s."trapRate" DESC, s.occurrences DESC, s.lemma ASC`,
  difficulty: Prisma.sql`s.difficulty DESC, s."per10k" DESC NULLS LAST, s.lemma ASC`,
  lemma: Prisma.sql`s.lemma ASC, s."senseOrder" ASC`,
  sn: Prisma.sql`sn DESC, s."per10k" DESC NULLS LAST, s.lemma ASC`,
  mp: Prisma.sql`mp DESC, s."per10k" DESC NULLS LAST, s.lemma ASC`,
  hp: Prisma.sql`hp DESC, s."per10k" DESC NULLS LAST, s.lemma ASC`,
};

function sanitizeQ(q: string): string {
  // 표제어는 소문자 [a-z0-9' -] 로만 적재된다 — LIKE 메타문자(%_\)는 존재할 수
  // 없는 문자이므로 이스케이프 대신 제거가 정확하다.
  return q.toLowerCase().replace(/[^a-z0-9' -]/g, "").slice(0, 40);
}

function buildWhere(f: WordbookFilter): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`s."retiredAt" IS NULL`];
  if (!f.allSenses) conds.push(Prisma.sql`s."senseOrder" = 0`);
  const q = f.q ? sanitizeQ(f.q) : "";
  if (q) conds.push(Prisma.sql`s.lemma LIKE ${q + "%"}`);
  if (f.posList?.length)
    conds.push(Prisma.sql`s.pos IN (${Prisma.join(f.posList)})`);
  if (f.tiers?.length)
    conds.push(Prisma.sql`s.tier IN (${Prisma.join(f.tiers)})`);
  if (f.difficulties?.length)
    conds.push(Prisma.sql`s.difficulty IN (${Prisma.join(f.difficulties)})`);
  if (f.grades?.length)
    conds.push(Prisma.sql`s."gradeTop" IN (${Prisma.join(f.grades)})`);
  if (f.trendLabels?.length)
    conds.push(Prisma.sql`s."trendLabel" IN (${Prisma.join(f.trendLabels)})`);
  if (f.excludePhrase) conds.push(Prisma.sql`s."isPhrase" = false`);
  if (typeof f.minTrapRate === "number" && f.minTrapRate > 0) {
    conds.push(
      Prisma.sql`s."trapRate" >= ${f.minTrapRate} AND s."trapCount" > 0`,
    );
  }
  // hasOwnProperty — "constructor" 류 프로토타입 키가 undefined 보간(질의 오류)으로
  // 새는 것을 막는다(?? 폴백은 truthy 상속 값에 무력하다).
  if (f.board && Object.prototype.hasOwnProperty.call(BOARD_JSON_KEY, f.board)) {
    conds.push(
      Prisma.sql`COALESCE((y."byBoard"->>${BOARD_JSON_KEY[f.board]})::int, 0) > 0`,
    );
  }
  if (f.excludeStopwords) {
    conds.push(
      Prisma.sql`s.lemma NOT IN (${Prisma.join([...VOCAB_STOPWORDS])})`,
    );
  }
  return Prisma.join(conds, " AND ");
}

// ── 탐색 페이지 질의 ─────────────────────────────────────────────────────────

export const WORDBOOK_PAGE_SIZE = 80;
const PAGE_SIZE_MAX = 200;
const OFFSET_MAX = 20_000;

interface RawSenseRow {
  senseId: string;
  lemmaId: string;
  lemma: string;
  pos: string;
  isPhrase: boolean;
  senseKo: string;
  senseOrder: number;
  lemmaSenseCount: number | null;
  tier: string;
  difficulty: number;
  occurrences: number;
  exampleCount: number;
  trapCount: number;
  trapRate: number;
  per10k: number | null;
  gradeTop: string | null;
  trendLabel: string | null;
  trendRatio: number | null;
  sn: number;
  mp: number;
  hp: number;
}

export async function listWordbookSensesData(input: {
  filter: WordbookFilter;
  sort: WordbookSort;
  offset: number;
  limit?: number;
}): Promise<WordbookPage> {
  const where = buildWhere(input.filter ?? {});
  // hasOwnProperty — sort:"constructor" 가 Object 생성자(truthy)를 돌려줘 ?? 폴백을
  // 우회하는 프로토타입 함정 차단. NaN 은 Math.max/min 클램프를 그대로 통과하므로
  // offset/limit 도 유한수 검사 후에만 쓴다.
  const orderBy = Object.prototype.hasOwnProperty.call(SORT_SQL, input.sort)
    ? SORT_SQL[input.sort]
    : SORT_SQL.per10k;
  const rawLimit = Number(input.limit ?? WORDBOOK_PAGE_SIZE);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(PAGE_SIZE_MAX, Math.round(rawLimit)))
    : WORDBOOK_PAGE_SIZE;
  const rawOffset = Number(input.offset);
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(OFFSET_MAX, Math.round(rawOffset)))
    : 0;

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<RawSenseRow[]>(Prisma.sql`
      SELECT
        s.id            AS "senseId",
        s."lemmaId"     AS "lemmaId",
        s.lemma, s.pos,
        s."isPhrase"    AS "isPhrase",
        s."senseKo"     AS "senseKo",
        s."senseOrder"  AS "senseOrder",
        l."senseCount"  AS "lemmaSenseCount",
        s.tier, s.difficulty, s.occurrences,
        s."exampleCount" AS "exampleCount",
        s."trapCount"   AS "trapCount",
        s."trapRate"    AS "trapRate",
        s."per10k"      AS "per10k",
        s."gradeTop"    AS "gradeTop",
        s."trendLabel"  AS "trendLabel",
        l."trendRatio"  AS "trendRatio",
        COALESCE((y."byBoard"->>${BOARD_JSON_KEY.수능})::int, 0) AS sn,
        COALESCE((y."byBoard"->>${BOARD_JSON_KEY.모평})::int, 0) AS mp,
        COALESCE((y."byBoard"->>${BOARD_JSON_KEY.학평})::int, 0) AS hp
      FROM vocab_drill_senses s
      LEFT JOIN vocab_drill_lemmas l ON l.id = s."lemmaId"
      LEFT JOIN vocab_drill_lemma_year_stats y ON y."lemmaId" = s."lemmaId"
      WHERE ${where}
      ORDER BY ${orderBy}, s.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n
      FROM vocab_drill_senses s
      LEFT JOIN vocab_drill_lemma_year_stats y ON y."lemmaId" = s."lemmaId"
      WHERE ${where}
    `),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      lemmaSenseCount: r.lemmaSenseCount ?? 1,
      trapRate: Number(r.trapRate ?? 0),
      per10k: r.per10k === null ? null : Number(r.per10k),
      trendRatio: r.trendRatio === null ? null : Number(r.trendRatio),
    })),
    // OFFSET_MAX 침묵 클램프가 「더 보기」 무한 중복으로 새지 않게 total 도 함께
    // 자른다 — 클라 hasMore(rows.length < total)가 상한에서 자연 종료된다.
    total: Math.min(totalRows[0]?.n ?? 0, OFFSET_MAX + limit),
  };
}

// ── 코퍼스 개관 (분포 대시보드 — 상세 미선택 시 우측 페인) ───────────────────

export interface WordbookOverview {
  bundleVersion: string;
  docs: number;
  lemmaCount: number;
  senseCount: number;
  exampleCount: number;
  trapCount: number;
  yearMin: number;
  yearMax: number;
  /** 표제어 기준 분포 */
  posDist: { key: string; count: number }[];
  trendDist: { key: string; count: number }[];
  /** 뜻 기준 분포 */
  tierDist: { key: string; count: number }[];
  diffDist: { key: string; count: number }[];
  /** 연도별 기출 예문 수(코퍼스 리듬) */
  examplesByYear: { year: number; count: number }[];
  /** 시행처별 표제어 출현 총합 */
  boardTotals: { board: WordbookBoard; count: number }[];
}

let overviewCache: { key: string; at: number; data: WordbookOverview } | null =
  null;
const OVERVIEW_TTL_MS = 10 * 60 * 1000;

export async function getWordbookOverviewData(): Promise<WordbookOverview> {
  const bundle = await prisma.vocabDrillBundle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { loadedAt: "desc" },
    select: {
      version: true,
      docs: true,
      lemmaCount: true,
      senseCount: true,
      exampleCount: true,
      trapCount: true,
    },
  });
  const key = bundle?.version ?? "none";
  if (
    overviewCache &&
    overviewCache.key === key &&
    Date.now() - overviewCache.at < OVERVIEW_TTL_MS
  ) {
    return overviewCache.data;
  }

  const [posDist, trendDist, tierDist, diffDist, byYear, boards] =
    await Promise.all([
      prisma.vocabDrillLemma.groupBy({
        by: ["pos"],
        where: { retiredAt: null },
        _count: { _all: true },
        orderBy: { _count: { pos: "desc" } },
      }),
      prisma.vocabDrillLemma.groupBy({
        by: ["trendLabel"],
        where: { retiredAt: null, trendLabel: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { trendLabel: "desc" } },
      }),
      prisma.vocabDrillSense.groupBy({
        by: ["tier"],
        where: { retiredAt: null },
        _count: { _all: true },
        orderBy: { _count: { tier: "desc" } },
      }),
      prisma.vocabDrillSense.groupBy({
        by: ["difficulty"],
        where: { retiredAt: null },
        _count: { _all: true },
        orderBy: { difficulty: "asc" },
      }),
      prisma.vocabDrillExample.groupBy({
        by: ["year"],
        where: { retiredAt: null, year: { not: null } },
        _count: { _all: true },
        orderBy: { year: "asc" },
      }),
      // year_stats 에는 retiredAt 이 없어 재적재 후 은퇴 표제어 행이 잔존한다 —
      // 활성 표제어 조인으로 한정해야 같은 화면의 retiredAt 기준 분포와 모수가 맞다.
      prisma.$queryRaw<{ sn: number; mp: number; hp: number }[]>(Prisma.sql`
        SELECT
          COALESCE(SUM((y."byBoard"->>${BOARD_JSON_KEY.수능})::int), 0)::int AS sn,
          COALESCE(SUM((y."byBoard"->>${BOARD_JSON_KEY.모평})::int), 0)::int AS mp,
          COALESCE(SUM((y."byBoard"->>${BOARD_JSON_KEY.학평})::int), 0)::int AS hp
        FROM vocab_drill_lemma_year_stats y
        JOIN vocab_drill_lemmas l ON l.id = y."lemmaId" AND l."retiredAt" IS NULL
      `),
    ]);

  const years = byYear
    .map((r) => ({ year: r.year as number, count: r._count._all }))
    .filter((r) => Number.isFinite(r.year));
  const data: WordbookOverview = {
    bundleVersion: key,
    docs: bundle?.docs ?? 0,
    lemmaCount: bundle?.lemmaCount ?? 0,
    senseCount: bundle?.senseCount ?? 0,
    exampleCount: bundle?.exampleCount ?? 0,
    trapCount: bundle?.trapCount ?? 0,
    yearMin: years[0]?.year ?? 0,
    yearMax: years[years.length - 1]?.year ?? 0,
    posDist: posDist.map((r) => ({ key: r.pos, count: r._count._all })),
    trendDist: trendDist.map((r) => ({
      key: r.trendLabel ?? "—",
      count: r._count._all,
    })),
    tierDist: tierDist.map((r) => ({ key: r.tier, count: r._count._all })),
    diffDist: diffDist.map((r) => ({
      key: String(r.difficulty),
      count: r._count._all,
    })),
    examplesByYear: years,
    boardTotals: [
      { board: "학평", count: boards[0]?.hp ?? 0 },
      { board: "모평", count: boards[0]?.mp ?? 0 },
      { board: "수능", count: boards[0]?.sn ?? 0 },
    ],
  };
  overviewCache = { key, at: Date.now(), data };
  return data;
}
