// ============================================================================
// 단어장 생성 스튜디오 — 표제어 도시에(심층 분석) + 의미 이동 발굴 (server-only)
//
// 도시에: 표제어 1개의 전 자산 — 25개년 시계열·시행처·유형·학년 분포, 뜻별
// 연도 분포(예문 파생), 예문(출처 포함), 함정, 혼동어(해소 조인), 연어.
//
// 의미 이동: 코퍼스 전체에서 "지배 뜻"이 축(초기→후기 | 고1→고3)에 따라 바뀐
// 표제어 발굴. 예문 97k 를 (senseId×축) 으로 접는 raw SQL 1방 + JS 접기 —
// 번들 버전 키로 모듈 캐시(코퍼스는 재적재 전까지 불변).
//
// ★ 뜻별 연도/학년 분포는 **수집된 예문 표본** 기준이다(뜻당 예문 상한이 있어
//   전수 아님). lemma 단위 byYear(year_stats)는 전수 — 두 수치는 척도가 다르다.
//   화면에는 표본 기준임을 각주로 반드시 밝힌다.
// ============================================================================
import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── 출처 파생 ────────────────────────────────────────────────────────────────

export type ExampleBoard = "수능" | "모평" | "학평" | null;

/**
 * passageId 명명 규약 → 시행처.
 *   ebsi_go{n}_{yyyymmdd}-q{n}  → 학평(학력평가)
 *   {yyyy}_SN_{...}             → 수능
 *   {yyyy}_06_{...} | _09_ | _YB_ → 모평
 *     (YB 는 코퍼스 정본 passages.json 이 board='수능모의평가'로 계상한다 —
 *      null 로 두면 같은 화면의 모평 카운트와 예문 태그 합계가 어긋난다)
 *   그 외 → null(비표기)
 */
export function boardFromPassageId(passageId: string): ExampleBoard {
  if (passageId.startsWith("ebsi_")) return "학평";
  const seg = passageId.split("_")[1];
  if (seg === "SN") return "수능";
  if (seg === "06" || seg === "09" || seg === "YB") return "모평";
  return null;
}

// ── 도시에 ───────────────────────────────────────────────────────────────────

/** 의미 이동 축의 연대 경계 — 2003~2015 초기 / 2016~2027 후기 */
export const ERA_SPLIT_YEAR = 2016;

export interface DossierExample {
  en: string;
  ko: string;
  surface: string;
  year: number | null;
  grade: string | null;
  typeGroup: string | null;
  board: ExampleBoard;
}

export interface DossierSense {
  id: string;
  senseKo: string;
  senseEn: string;
  senseKoCandidates: { ko: string; n: number }[];
  tier: string;
  difficulty: number;
  senseOrder: number;
  occurrences: number;
  exampleCount: number;
  trapCount: number;
  trapRate: number;
  /** 예문 표본 기준 — 초기/후기 출현 수 */
  era: { early: number; late: number };
  /** 예문 표본 기준 — 학년별 출현 수 */
  byGrade: { g1: number; g2: number; g3: number };
  /** 예문 표본 기준 — 연도별 출현 수(있는 해만) */
  byYear: Record<string, number>;
  examples: DossierExample[];
  traps: { kind: string; note: string }[];
}

export interface DossierConfusable {
  lemmaId: string;
  lemma: string;
  pos: string;
  per10k: number | null;
  senseKo: string | null;
}

export interface WordbookLemmaDossier {
  lemma: {
    id: string;
    lemma: string;
    pos: string;
    isPhrase: boolean;
    senseCount: number;
    surfaces: string[];
    collocations: string[];
    per10k: number | null;
    per10kGo1: number | null;
    per10kGo2: number | null;
    per10kGo3: number | null;
    gradeTop: string | null;
    trendLabel: string | null;
    trendRatio: number | null;
    yearsPresent: number | null;
    longestGap: number | null;
    totalOccurrences: number | null;
    passageCount: number | null;
  };
  /** 전수(코퍼스) 기준 — lemma_year_stats */
  yearStats: {
    byYear: Record<string, number>;
    byGrade: Record<string, number>;
    byType: Record<string, number>;
    byBoard: Record<string, number>;
    yearMin: number | null;
    yearMax: number | null;
  } | null;
  senses: DossierSense[];
  confusables: DossierConfusable[];
}

// 예문은 뜻당 12개까지 — 4개는 "나온 지문 113개" 같은 통계와 나란히 서면
// 데이터가 빈약해 보인다(유저 실사용 피드백 2026-08-04). 표시는 접기로 조절.
const EXAMPLES_PER_SENSE = 12;
const TRAPS_PER_SENSE = 4;

function toNumRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

function toStrArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, cap);
}

function toKoCandidates(v: unknown): { ko: string; n: number }[] {
  if (!Array.isArray(v)) return [];
  const out: { ko: string; n: number }[] = [];
  for (const item of v) {
    if (item && typeof item === "object") {
      const { ko, n } = item as { ko?: unknown; n?: unknown };
      if (typeof ko === "string" && typeof n === "number") out.push({ ko, n });
    }
  }
  return out.slice(0, 6);
}

export async function getWordbookLemmaDossierData(
  lemmaId: string,
): Promise<WordbookLemmaDossier | null> {
  const id = lemmaId.trim().slice(0, 32);
  if (!id) return null;

  const [lemma, yearStat, senses] = await Promise.all([
    prisma.vocabDrillLemma.findFirst({ where: { id, retiredAt: null } }),
    prisma.vocabDrillLemmaYearStat.findUnique({ where: { lemmaId: id } }),
    prisma.vocabDrillSense.findMany({
      where: { lemmaId: id, retiredAt: null },
      orderBy: { senseOrder: "asc" },
      take: 20,
    }),
  ]);
  if (!lemma) return null;

  const senseIds = senses.map((s) => s.id);
  // 예문·함정은 평면 take 가 아니라 **뜻별 윈도우**로 자른다 — 평면 take 는
  // senseId(해시) 정렬 뒷순번 뜻의 몫을 통째로 삼킨다(적대검수 실측: make 함정
  // 96행 > 80 에서 7개 뜻의 노트가 전량 소실). 학년 분포는 표시용 예문이 아니라
  // 전 표본 groupBy 로 접는다(윈도우 캡이 표본 통계를 왜곡하지 않게).
  const [examples, traps, senseYearRows, senseGradeRows] = await Promise.all([
    senseIds.length
      ? prisma.$queryRaw<
          {
            senseId: string;
            passageId: string;
            surface: string;
            en: string;
            ko: string;
            year: number | null;
            grade: string | null;
            typeGroup: string | null;
          }[]
        >(Prisma.sql`
          SELECT "senseId", "passageId", surface, en, ko, year, grade, "typeGroup"
          FROM (
            SELECT "senseId", "passageId", surface, en, ko, year, grade, "typeGroup", ord,
                   ROW_NUMBER() OVER (PARTITION BY "senseId" ORDER BY ord ASC, id ASC) AS rn
            FROM vocab_drill_examples
            WHERE "senseId" IN (${Prisma.join(senseIds)}) AND "retiredAt" IS NULL
          ) t
          WHERE rn <= ${EXAMPLES_PER_SENSE}
          ORDER BY "senseId" ASC, ord ASC
        `)
      : [],
    senseIds.length
      ? prisma.$queryRaw<{ senseId: string; kind: string; note: string }[]>(
          Prisma.sql`
          SELECT "senseId", kind, note
          FROM (
            SELECT "senseId", kind, note, ord,
                   ROW_NUMBER() OVER (PARTITION BY "senseId" ORDER BY ord ASC, id ASC) AS rn
            FROM vocab_drill_traps
            WHERE "senseId" IN (${Prisma.join(senseIds)}) AND "retiredAt" IS NULL
          ) t
          WHERE rn <= ${TRAPS_PER_SENSE}
          ORDER BY "senseId" ASC, ord ASC
        `,
        )
      : [],
    senseIds.length
      ? prisma.vocabDrillExample.groupBy({
          by: ["senseId", "year"],
          where: { senseId: { in: senseIds }, retiredAt: null },
          _count: { _all: true },
          orderBy: [{ senseId: "asc" }, { year: "asc" }],
          take: 600,
        })
      : [],
    senseIds.length
      ? prisma.vocabDrillExample.groupBy({
          by: ["senseId", "grade"],
          where: { senseId: { in: senseIds }, retiredAt: null },
          _count: { _all: true },
          orderBy: [{ senseId: "asc" }, { grade: "asc" }],
          take: 100, // 뜻 20 × 학년 3 = 60 이 이론 최대
        })
      : [],
  ]);

  const examplesBySense = new Map<string, DossierExample[]>();
  for (const e of examples) {
    // 윈도우 쿼리(rn ≤ EXAMPLES_PER_SENSE)가 이미 뜻별 몫을 보장한다.
    const list = examplesBySense.get(e.senseId) ?? [];
    list.push({
      en: e.en,
      ko: e.ko,
      surface: e.surface,
      year: e.year,
      grade: e.grade,
      typeGroup: e.typeGroup,
      board: boardFromPassageId(e.passageId),
    });
    examplesBySense.set(e.senseId, list);
  }
  const trapsBySense = new Map<string, { kind: string; note: string }[]>();
  for (const t of traps) {
    const list = trapsBySense.get(t.senseId) ?? [];
    list.push({ kind: t.kind, note: t.note });
    trapsBySense.set(t.senseId, list);
  }
  const yearBySense = new Map<string, Record<string, number>>();
  const eraBySense = new Map<string, { early: number; late: number }>();
  const gradeBySense = new Map<string, { g1: number; g2: number; g3: number }>();
  for (const row of senseYearRows) {
    if (row.year === null) continue;
    const rec = yearBySense.get(row.senseId) ?? {};
    rec[String(row.year)] = row._count._all;
    yearBySense.set(row.senseId, rec);
    const era = eraBySense.get(row.senseId) ?? { early: 0, late: 0 };
    if (row.year < ERA_SPLIT_YEAR) era.early += row._count._all;
    else era.late += row._count._all;
    eraBySense.set(row.senseId, era);
  }
  // 학년 분포 — 표시용 예문(뜻당 4개 캡)이 아니라 전 표본 groupBy 로 접는다.
  for (const row of senseGradeRows) {
    const g = gradeBySense.get(row.senseId) ?? { g1: 0, g2: 0, g3: 0 };
    if (row.grade === "고1") g.g1 += row._count._all;
    else if (row.grade === "고2") g.g2 += row._count._all;
    else if (row.grade === "고3") g.g3 += row._count._all;
    gradeBySense.set(row.senseId, g);
  }

  // 혼동어 해소 — 문자열 → 실제 표제어 행(대표 뜻 동반). 품사 불문 전 매칭.
  const confusableNames = toStrArray(lemma.confusable, 10);
  let confusables: DossierConfusable[] = [];
  if (confusableNames.length) {
    const rows = await prisma.vocabDrillLemma.findMany({
      where: { lemma: { in: confusableNames }, retiredAt: null },
      select: { id: true, lemma: true, pos: true, per10k: true },
      orderBy: { per10k: { sort: "desc", nulls: "last" } },
      take: 12,
    });
    const repSenses = rows.length
      ? await prisma.vocabDrillSense.findMany({
          where: {
            lemmaId: { in: rows.map((r) => r.id) },
            senseOrder: 0,
            retiredAt: null,
          },
          select: { lemmaId: true, senseKo: true },
          take: 12,
        })
      : [];
    const senseKoBy = new Map(repSenses.map((s) => [s.lemmaId, s.senseKo]));
    confusables = rows.map((r) => ({
      lemmaId: r.id,
      lemma: r.lemma,
      pos: r.pos,
      per10k: r.per10k,
      senseKo: senseKoBy.get(r.id) ?? null,
    }));
  }

  return {
    lemma: {
      id: lemma.id,
      lemma: lemma.lemma,
      pos: lemma.pos,
      isPhrase: lemma.isPhrase,
      senseCount: lemma.senseCount,
      surfaces: toStrArray(lemma.surfaces, 8),
      collocations: toStrArray(lemma.collocations, 10),
      per10k: lemma.per10k,
      per10kGo1: lemma.per10kGo1,
      per10kGo2: lemma.per10kGo2,
      per10kGo3: lemma.per10kGo3,
      gradeTop: lemma.gradeTop,
      trendLabel: lemma.trendLabel,
      trendRatio: lemma.trendRatio,
      yearsPresent: lemma.yearsPresent,
      longestGap: lemma.longestGap,
      totalOccurrences: lemma.totalOccurrences,
      passageCount: lemma.passageCount,
    },
    yearStats: yearStat
      ? {
          byYear: toNumRecord(yearStat.byYear),
          byGrade: toNumRecord(yearStat.byGrade),
          byType: toNumRecord(yearStat.byType),
          byBoard: toNumRecord(yearStat.byBoard),
          yearMin: yearStat.yearMin,
          yearMax: yearStat.yearMax,
        }
      : null,
    senses: senses.map((s) => ({
      id: s.id,
      senseKo: s.senseKo,
      senseEn: s.senseEn,
      senseKoCandidates: toKoCandidates(s.senseKoCandidates),
      tier: s.tier,
      difficulty: s.difficulty,
      senseOrder: s.senseOrder,
      occurrences: s.occurrences,
      exampleCount: s.exampleCount,
      trapCount: s.trapCount,
      trapRate: s.trapRate,
      era: eraBySense.get(s.id) ?? { early: 0, late: 0 },
      byGrade: gradeBySense.get(s.id) ?? { g1: 0, g2: 0, g3: 0 },
      byYear: yearBySense.get(s.id) ?? {},
      examples: examplesBySense.get(s.id) ?? [],
      traps: trapsBySense.get(s.id) ?? [],
    })),
    confusables,
  };
}

// ── 의미 이동 발굴 ───────────────────────────────────────────────────────────

export type ShiftAxis = "era" | "grade";

export interface WordbookShiftRow {
  lemmaId: string;
  lemma: string;
  pos: string;
  per10k: number | null;
  /** A축(초기 | 고1) 지배 뜻 */
  aSenseId: string;
  aSenseKo: string;
  aShare: number; // 0~1
  aTotal: number;
  /** B축(후기 | 고3) 지배 뜻 */
  bSenseId: string;
  bSenseKo: string;
  bShare: number;
  bTotal: number;
  /** B축 지배 뜻의 티어·난이도 — 바스켓 담기(현재 지배 뜻 기준)에 쓴다 */
  bTier: string;
  bDifficulty: number;
}

/** 축별 최소 표본 — 이 미만이면 "지배 뜻"을 말할 수 없다 */
const SHIFT_MIN_SAMPLES = 4;
/**
 * 지배 뜻 최소 점유율 — 실측(2026-08-04): take 처럼 뜻이 10개+인 표제어는
 * 최다 뜻 점유율이 14% 같은 약한 지배가 되고, 그 교대는 이동이 아니라 잡음이다.
 */
const SHIFT_MIN_SHARE = 0.2;
const SHIFT_ROWS_MAX = 120;

let shiftCache: {
  key: string;
  era: WordbookShiftRow[];
  grade: WordbookShiftRow[];
} | null = null;

interface ShiftAggRow {
  lemmaId: string;
  senseId: string;
  senseKo: string;
  lemma: string;
  pos: string;
  per10k: number | null;
  tier: string;
  difficulty: number;
  a: number;
  b: number;
}

function foldShift(rows: ShiftAggRow[]): WordbookShiftRow[] {
  const byLemma = new Map<string, ShiftAggRow[]>();
  for (const r of rows) {
    const list = byLemma.get(r.lemmaId) ?? [];
    list.push(r);
    byLemma.set(r.lemmaId, list);
  }
  const out: WordbookShiftRow[] = [];
  for (const [lemmaId, list] of byLemma) {
    if (list.length < 2) continue; // 단의어는 이동이 성립하지 않는다
    const aTotal = list.reduce((s, r) => s + r.a, 0);
    const bTotal = list.reduce((s, r) => s + r.b, 0);
    if (aTotal < SHIFT_MIN_SAMPLES || bTotal < SHIFT_MIN_SAMPLES) continue;
    const aTop = [...list].sort((x, y) => y.a - x.a)[0];
    const bTop = [...list].sort((x, y) => y.b - x.b)[0];
    if (aTop.senseId === bTop.senseId) continue; // 지배 뜻 불변 — 이동 아님
    if (aTop.a === 0 || bTop.b === 0) continue;
    if (aTop.a / aTotal < SHIFT_MIN_SHARE || bTop.b / bTotal < SHIFT_MIN_SHARE)
      continue; // 약한 지배의 교대는 잡음
    if (aTop.senseKo === bTop.senseKo) continue; // 표기까지 같으면 이동으로 보이지 않는다
    out.push({
      lemmaId,
      lemma: aTop.lemma,
      pos: aTop.pos,
      per10k: aTop.per10k === null ? null : Number(aTop.per10k),
      aSenseId: aTop.senseId,
      aSenseKo: aTop.senseKo,
      aShare: aTop.a / aTotal,
      aTotal,
      bSenseId: bTop.senseId,
      bSenseKo: bTop.senseKo,
      bShare: bTop.b / bTotal,
      bTotal,
      bTier: bTop.tier,
      bDifficulty: bTop.difficulty,
    });
  }
  // 표본이 두터운 순 — 양축 최소 표본의 곱이 클수록 관찰이 단단하다.
  out.sort(
    (x, y) =>
      Math.min(y.aTotal, y.bTotal) - Math.min(x.aTotal, x.bTotal) ||
      (y.per10k ?? 0) - (x.per10k ?? 0),
  );
  return out.slice(0, SHIFT_ROWS_MAX);
}

export async function listWordbookShiftData(
  axis: ShiftAxis,
): Promise<WordbookShiftRow[]> {
  const bundle = await prisma.vocabDrillBundle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { loadedAt: "desc" },
    select: { version: true },
  });
  const key = bundle?.version ?? "none";
  if (shiftCache && shiftCache.key === key) return shiftCache[axis];

  const [eraRows, gradeRows] = await Promise.all([
    prisma.$queryRaw<ShiftAggRow[]>(Prisma.sql`
      SELECT s."lemmaId" AS "lemmaId", e."senseId" AS "senseId",
             s."senseKo" AS "senseKo", s.lemma, s.pos, s."per10k" AS "per10k",
             s.tier, s.difficulty,
             COUNT(*) FILTER (WHERE e.year < ${ERA_SPLIT_YEAR})::int  AS a,
             COUNT(*) FILTER (WHERE e.year >= ${ERA_SPLIT_YEAR})::int AS b
      FROM vocab_drill_examples e
      JOIN vocab_drill_senses s ON s.id = e."senseId"
      WHERE e."retiredAt" IS NULL AND s."retiredAt" IS NULL
        AND e.year IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    `),
    prisma.$queryRaw<ShiftAggRow[]>(Prisma.sql`
      SELECT s."lemmaId" AS "lemmaId", e."senseId" AS "senseId",
             s."senseKo" AS "senseKo", s.lemma, s.pos, s."per10k" AS "per10k",
             s.tier, s.difficulty,
             COUNT(*) FILTER (WHERE e.grade = '고1')::int AS a,
             COUNT(*) FILTER (WHERE e.grade = '고3')::int AS b
      FROM vocab_drill_examples e
      JOIN vocab_drill_senses s ON s.id = e."senseId"
      WHERE e."retiredAt" IS NULL AND s."retiredAt" IS NULL
        AND e.grade IN ('고1', '고3')
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    `),
  ]);

  shiftCache = { key, era: foldShift(eraRows), grade: foldShift(gradeRows) };
  return shiftCache[axis];
}
