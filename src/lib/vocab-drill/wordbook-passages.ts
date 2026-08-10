// ============================================================================
// 단어장 생성 스튜디오 — 기출 범위(지문) 질의 계층 (server-only)
//
// 「2027 6월 모평 20번 지문에 나온 단어」·「2026~2027 수능·모평 전 범위 단어」를
// 답하는 층. 정본 테이블은 vocab_drill_passage_words — (지문 × 뜻) 유일쌍
// 185,567행이고, 지문 메타(연도·시행처·회차·학년·문항번호·유형)가 역정규화돼
// 있어 조인 없이 전 축 필터가 선다.
//
// ★ examples 를 쓰지 않는 이유: 그쪽은 학생 카드용이라 뜻당 5개 상한에 걸려
//   지문 어휘의 52.5% 만 남는다(지문당 21.5 vs 40.9). 상세는
//   prisma/sql/vocab-drill-passage-words.sql 머리말.
//
// ★ 선택지(연도·시행처·회차…)는 **이 테이블에서 GROUP BY 로 뽑는다.**
//   지문 정본 JSON(5.3MB)을 스튜디오 서버 번들에 끌고 들어오지 않기 위해서고,
//   그 덕에 "고르면 0개" 인 선택지가 원천적으로 안 생긴다(카운트가 실측이다).
// ============================================================================
import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasVocabPassageScope, type VocabPassageScope } from "./payload";

// ── 계약 ─────────────────────────────────────────────────────────────────────

/** 화면 라벨. DB 에는 정본 표기가 들어 있어 질의 시 변환한다. */
export type PassageBoard = "수능" | "모평" | "학평";

// 스펙(VocabPassageScope.boards)이 string[] 이라 임의 문자열이 들어올 수 있다 —
// hasOwnProperty 로 거르고 인덱싱하므로 Record<string, …> 로 받는다.
const BOARD_DB_VALUE: Record<string, string> = {
  수능: "대학수학능력시험",
  모평: "수능모의평가",
  학평: "학력평가",
};
const BOARD_LABEL: Record<string, PassageBoard> = {
  대학수학능력시험: "수능",
  수능모의평가: "모평",
  학력평가: "학평",
};
export const PASSAGE_BOARDS: PassageBoard[] = ["수능", "모평", "학평"];

/**
 * 기출 범위 — 전 축 AND 결합. 빈 축은 "제한 없음"이다.
 *
 * ⚠️ `grades` 는 **그 시험이 치러진 학년**(고1 학평 / 고3 수능)이다.
 *    WordbookFilter.grades(= sense.gradeTop, "이 단어가 주로 나오는 학년")와
 *    완전히 다른 축이니 절대 섞지 마라. 둘 다 켜면 교집합이다.
 */
export type WordbookPassageScope = VocabPassageScope;

export const PASSAGE_YEAR_MIN = 2003;
export const PASSAGE_YEAR_MAX = 2027;
/** 실측 문항번호 범위(장문 45-46, 옛 55번 포함). */
export const PASSAGE_Q_MIN = 18;
export const PASSAGE_Q_MAX = 55;
/** 축별 배열 상한 — 액션 새니타이즈와 짝을 이룬다(무상한 IN 방지). */
export const PASSAGE_IDS_MAX = 500;

/** 판정 정본은 payload.ts — 덱 스펙(서버·클라 공용)과 같은 함수를 써야 한다. */
export const hasPassageScope = hasVocabPassageScope;

// ── WHERE 조립 ───────────────────────────────────────────────────────────────

/**
 * vocab_drill_passage_words 에 거는 조건들. 별칭 없이 컬럼만 쓰므로 서브쿼리·
 * CTE 어디에 넣어도 된다(호출부가 FROM 을 정한다).
 */
export function passageScopeConds(s: WordbookPassageScope): Prisma.Sql {
  const c: Prisma.Sql[] = [];

  // 개별 지문 지정은 다른 축을 무의미하게 만든다 — 명시 목록이 이긴다.
  if (s.passageIds?.length) {
    c.push(
      Prisma.sql`"passageId" IN (${Prisma.join(s.passageIds.slice(0, PASSAGE_IDS_MAX))})`,
    );
    return Prisma.join(c, " AND ");
  }

  if (typeof s.yearFrom === "number" && Number.isFinite(s.yearFrom)) {
    c.push(Prisma.sql`"year" >= ${Math.trunc(s.yearFrom)}`);
  }
  if (typeof s.yearTo === "number" && Number.isFinite(s.yearTo)) {
    c.push(Prisma.sql`"year" <= ${Math.trunc(s.yearTo)}`);
  }
  if (s.boards?.length) {
    const vals = s.boards
      .filter((b) => Object.prototype.hasOwnProperty.call(BOARD_DB_VALUE, b))
      .map((b) => BOARD_DB_VALUE[b]);
    if (vals.length) c.push(Prisma.sql`"board" IN (${Prisma.join(vals)})`);
  }
  if (s.exams?.length) c.push(Prisma.sql`"exam" IN (${Prisma.join(s.exams)})`);
  if (s.grades?.length) c.push(Prisma.sql`"grade" IN (${Prisma.join(s.grades)})`);
  // 장문 겹침 판정 — 대표값 하나로 자르면 41-42 지문이 "…41번까지"에서 통째로 빠진다.
  if (typeof s.qFrom === "number" && Number.isFinite(s.qFrom)) {
    c.push(Prisma.sql`"qTo" >= ${Math.trunc(s.qFrom)}`);
  }
  if (typeof s.qTo === "number" && Number.isFinite(s.qTo)) {
    c.push(Prisma.sql`"qFrom" <= ${Math.trunc(s.qTo)}`);
  }
  if (s.typeGroups?.length) {
    c.push(Prisma.sql`"typeGroup" IN (${Prisma.join(s.typeGroups)})`);
  }
  if (s.examIds?.length) {
    c.push(Prisma.sql`"examId" IN (${Prisma.join(s.examIds.slice(0, PASSAGE_IDS_MAX))})`);
  }
  return c.length ? Prisma.join(c, " AND ") : Prisma.sql`TRUE`;
}

/**
 * 범위 안 뜻별 출현 지문 수 — 목록 질의가 이걸 **조인**해서 쓴다.
 * EXISTS 가 아니라 집계로 가는 이유: 필터와 "이 범위에서 몇 개 지문에 나왔나"를
 * 한 번의 스캔으로 같이 얻는다(EXISTS + 행별 스칼라 서브쿼리는 두 번 판다).
 */
export function passageScopeHitsSql(s: WordbookPassageScope): Prisma.Sql {
  return Prisma.sql`(
    SELECT "senseId", COUNT(*)::int AS n
      FROM vocab_drill_passage_words
     WHERE ${passageScopeConds(s)}
     GROUP BY "senseId"
  )`;
}

// ── 범위 요약 (레일 하단 실시간 표시) ────────────────────────────────────────

export interface PassageScopeSummary {
  /** 범위에 든 지문 수 */
  passages: number;
  /** 범위에서 나온 뜻 수(= 목록 최대 행수) */
  senses: number;
  /** 범위에서 나온 표제어 수 */
  lemmas: number;
  /** 범위에 든 시험지 수 */
  papers: number;
  yearMin: number | null;
  yearMax: number | null;
}

export async function getPassageScopeSummaryData(
  s: WordbookPassageScope,
): Promise<PassageScopeSummary> {
  const rows = await prisma.$queryRaw<
    {
      passages: number; senses: number; lemmas: number; papers: number;
      ymin: number | null; ymax: number | null;
    }[]
  >(Prisma.sql`
    SELECT COUNT(DISTINCT "passageId")::int AS passages,
           COUNT(DISTINCT "senseId")::int   AS senses,
           COUNT(DISTINCT "lemmaId")::int   AS lemmas,
           COUNT(DISTINCT "examId")::int    AS papers,
           MIN("year")::int                 AS ymin,
           MAX("year")::int                 AS ymax
      FROM vocab_drill_passage_words
     WHERE ${passageScopeConds(s)}
  `);
  const r = rows[0];
  return {
    passages: r?.passages ?? 0,
    senses: r?.senses ?? 0,
    lemmas: r?.lemmas ?? 0,
    papers: r?.papers ?? 0,
    yearMin: r?.ymin ?? null,
    yearMax: r?.ymax ?? null,
  };
}

// ── 선택지(facet) ────────────────────────────────────────────────────────────

export interface PassageFacetOption {
  key: string;
  label: string;
  /** 이 선택지를 켰을 때 범위에 드는 지문 수 */
  passages: number;
}

export interface PassageFacets {
  years: PassageFacetOption[];
  boards: PassageFacetOption[];
  exams: PassageFacetOption[];
  grades: PassageFacetOption[];
  typeGroups: PassageFacetOption[];
}

/** 회차 정준 순서 — 학년도 진행 순(3월→…→수능). 사전순은 "10월<3월"이 된다. */
const EXAM_ORDER = [
  "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월",
  "수능", "예비",
];

/**
 * 축별 선택지 + 지문 수. 표준 faceted-search 규약대로 **자기 축은 제외한**
 * 나머지 조건으로 계산한다 — 「수능」을 켠 순간 모평·학평이 목록에서 사라져
 * 되돌릴 수 없게 되는 함정을 피한다.
 */
export async function getPassageFacetsData(
  s: WordbookPassageScope,
): Promise<PassageFacets> {
  // ⚠️ 연도는 **두 키(yearFrom·yearTo)가 한 축**이다. 하나만 빼면 상한을 좁힌
  //    순간 그 위 연도가 목록에서 사라져 다시 넓힐 수단이 없어진다(되돌릴 수
  //    없는 필터 — faceted-search 에서 가장 흔한 함정).
  const dim = async (
    col: string,
    omit: (keyof WordbookPassageScope)[],
  ): Promise<{ key: string; passages: number }[]> => {
    const narrowed = { ...s };
    for (const k of omit) narrowed[k] = undefined;
    const rows = await prisma.$queryRaw<{ k: string | null; n: number }[]>(Prisma.sql`
      SELECT ${Prisma.raw(`"${col}"`)}::text AS k,
             COUNT(DISTINCT "passageId")::int AS n
        FROM vocab_drill_passage_words
       WHERE ${passageScopeConds(narrowed)}
       GROUP BY 1
    `);
    return rows
      .filter((r) => r.k !== null && r.n > 0)
      .map((r) => ({ key: String(r.k), passages: r.n }));
  };

  const [years, boards, exams, grades, typeGroups] = await Promise.all([
    dim("year", ["yearFrom", "yearTo"]),
    dim("board", ["boards"]),
    dim("exam", ["exams"]),
    dim("grade", ["grades"]),
    dim("typeGroup", ["typeGroups"]),
  ]);

  return {
    // 연도는 최신이 위 — 디렉터는 최근 기출부터 본다.
    years: years
      .sort((a, b) => Number(b.key) - Number(a.key))
      .map((r) => ({ ...r, label: `${r.key}` })),
    boards: PASSAGE_BOARDS.map((b) => {
      const hit = boards.find((r) => BOARD_LABEL[r.key] === b);
      return { key: b, label: b, passages: hit?.passages ?? 0 };
    }).filter((o) => o.passages > 0),
    exams: exams
      .sort((a, b) => EXAM_ORDER.indexOf(a.key) - EXAM_ORDER.indexOf(b.key))
      .map((r) => ({ ...r, label: r.key })),
    grades: grades
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => ({ ...r, label: r.key })),
    typeGroups: typeGroups
      .sort((a, b) => b.passages - a.passages)
      .map((r) => ({ ...r, label: r.key })),
  };
}

// ── 시험지(회차) 목록 — "이 시험지 통째로" 선택용 ────────────────────────────

export interface PassagePaper {
  examId: string;
  year: number;
  exam: string;
  board: PassageBoard;
  grade: string | null;
  /** "2027학년도 6월 모평 (고3)" */
  title: string;
  /** 이 시험지에서 단어가 붙은 지문 수 */
  passages: number;
  /** 이 시험지에서 나온 뜻 수 */
  senses: number;
  qFrom: number;
  qTo: number;
}

const PAPERS_MAX = 400;

/**
 * 현재 범위에 드는 시험지 목록. 회차 하나를 통째로 고르는 진입점이자,
 * "지금 범위가 시험지 몇 장인지" 를 눈으로 확인하는 창이기도 하다.
 */
export async function listPassagePapersData(
  s: WordbookPassageScope,
): Promise<PassagePaper[]> {
  const rows = await prisma.$queryRaw<
    {
      examId: string; year: number; exam: string; board: string;
      grade: string | null; passages: number; senses: number;
      qFrom: number; qTo: number;
    }[]
  >(Prisma.sql`
    SELECT "examId", MIN("year")::int AS "year", MIN("exam") AS "exam",
           MIN("board") AS "board", MIN("grade") AS "grade",
           COUNT(DISTINCT "passageId")::int AS passages,
           COUNT(DISTINCT "senseId")::int   AS senses,
           MIN("qFrom")::int AS "qFrom", MAX("qTo")::int AS "qTo"
      FROM vocab_drill_passage_words
     WHERE ${passageScopeConds(s)}
     GROUP BY "examId"
     ORDER BY "year" DESC, MIN("exam") ASC
     LIMIT ${PAPERS_MAX}
  `);
  return rows.map((r) => {
    const board = BOARD_LABEL[r.board] ?? "학평";
    const examKo = r.exam === "수능" || r.exam === "예비" ? r.exam : `${r.exam} ${board}`;
    return {
      examId: r.examId,
      year: r.year,
      exam: r.exam,
      board,
      grade: r.grade,
      title: `${r.year}학년도 ${examKo}${r.grade ? ` · ${r.grade}` : ""}`,
      passages: r.passages,
      senses: r.senses,
      qFrom: r.qFrom,
      qTo: r.qTo,
    };
  });
}

// ── 단일 지문의 단어 (지문 카드 펼치기) ──────────────────────────────────────

export interface PassageWordRow {
  senseId: string;
  lemmaId: string;
  lemma: string;
  pos: string;
  senseKo: string;
  senseOrder: number;
  surface: string;
  sentenceIndex: number;
  tier: string;
  difficulty: number;
  per10k: number | null;
}

export async function listPassageWordsData(
  passageId: string,
): Promise<PassageWordRow[]> {
  if (typeof passageId !== "string" || !passageId) return [];
  const rows = await prisma.$queryRaw<PassageWordRow[]>(Prisma.sql`
    SELECT pw."senseId", pw."lemmaId", s.lemma, s.pos, s."senseKo",
           s."senseOrder" AS "senseOrder", pw.surface,
           pw."sentenceIndex" AS "sentenceIndex",
           s.tier, s.difficulty, s."per10k" AS "per10k"
      FROM vocab_drill_passage_words pw
      JOIN vocab_drill_senses s ON s.id = pw."senseId" AND s."retiredAt" IS NULL
     WHERE pw."passageId" = ${passageId}
     ORDER BY pw."sentenceIndex" ASC, s."per10k" DESC NULLS LAST
  `);
  return rows.map((r) => ({
    ...r,
    per10k: r.per10k === null ? null : Number(r.per10k),
  }));
}
