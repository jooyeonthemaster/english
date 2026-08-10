"use server";

// ============================================================================
// 단어 훈련 — 원장/강사용 서버 액션: 조회 (디렉터 「단어 훈련」 탭 + 학생 허브)
//
// 어법 선례(grammar-drill-admin/students.ts)를 그대로 따른다:
//   - 모든 액션은 requireStaffAuth 후 staff.academyId 로 테넌트 교차검증한다.
//   - VocabDrill* 학습 테이블은 relation-free — 학생 정보는 명시 조인(2단 질의).
//   - 학생×sense 는 수만 행 — 전량 로드 금지, 모든 질의에 take/LIMIT 명시.
// 콘텐츠 테이블(lemmas/senses/year_stats)은 전 학원 공용 읽기 전용이라
// academyId 스코프가 없다 — 학습 테이블(attempts/mastery/stats)만 스코프한다.
//
// 집계 규약 2가지(적대검수 2026-08-04):
//   (1) 원장(attempts) 집계는 **최근 90일** 시간창 + take 상한 안에서만 한다.
//       화면 문구에도 "최근 90일"을 병기해야 한다 — 기준 없는 숫자는 지표가 아니다.
//   (2) "취약"의 정의는 학생 큐와 하나여야 한다 — masteryScore < WEAK_SCORE(engine
//       정본 import) && attempts >= 2. 디렉터만 attempts>0 이던 3원화를 없앤다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { WEAK_SCORE } from "@/lib/vocab-drill/engine";

/**
 * 취약 판정 — 학생 큐(queue.ts weak/mixed 분기)와 **완전히 동일한 술어**를 쓴다:
 *   masteryScore < WEAK_SCORE  &&  attempts >= WEAK_MIN_ATTEMPTS
 * 임계값(WEAK_SCORE)은 engine.ts 가 정본이라 여기서 재선언하지 않는다 —
 * 디렉터만 attempts>0 이라 "취약"의 뜻이 표면마다 갈라졌었다(적대검수 2026-08-04).
 * 1회 오답은 아직 취약이 아니라 미학습이다.
 */
const WEAK_MIN_ATTEMPTS = 2;

/**
 * 디렉터 집계 시간창 — 학원 전체 attempts 원장은 계속 자라므로, 시간창이 없으면
 * 「단어 훈련」 탭을 열 때마다 전량 스캔이 된다. 이 창으로 집계한 지표는
 * 화면 문구에도 **"최근 90일"** 을 반드시 병기한다(디렉터 지표 기준 명시 규약).
 */
const LAB_WINDOW_DAYS = 90;

function labWindowStart(): Date {
  return new Date(Date.now() - LAB_WINDOW_DAYS * 86_400_000);
}

/** 집계 상한 — 학생 1,000명 × (정답/오답 2행) 이 groupBy 결과의 이론 최대치 */
const MAX_STUDENTS = 1000;

/** Json 컬럼 → {키: 수} 방어 파스(byYear/per10kByYear 등) */
function toNumRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

/** Json 컬럼 → string[] 방어 파스(collocations/confusable) */
function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

// ── 학생 목록 (집계) ─────────────────────────────────────────────────────────

/**
 * ★ 시도 기반 지표(attempts/correct/accuracy/lastStudiedAt)는 **최근 90일 창** 집계다.
 * 화면에는 반드시 "최근 90일"을 병기한다. 누적 지표(sensesSeen/sensesMastered/
 * weakCount)는 상태 테이블(stat/mastery) 기반이라 시간창이 없다.
 */
export interface VocabLabStudentRow {
  studentId: string;
  name: string;
  grade: number;
  /** 최근 90일 시도 수 */
  attempts: number;
  /** 최근 90일 정답 수 */
  correct: number;
  /** 최근 90일 정답률 0~100 반올림 — 창 내 시도 0이면 null */
  accuracy: number | null;
  /** 누적 — vocab_drill_stats */
  sensesSeen: number;
  /** 누적 — vocab_drill_stats */
  sensesMastered: number;
  /** 누적 — 숙달도 WEAK_SCORE 미만 & 시도 2회 이상 sense 수(학생 큐와 동일 술어) */
  weakCount: number;
  /** 최근 90일 내 마지막 학습 시각 — 창 안에 기록이 없으면 null */
  lastStudiedAt: string | null;
}

export async function listVocabLabStudents(): Promise<VocabLabStudentRow[]> {
  const staff = await requireStaffAuth();

  const students = await prisma.student.findMany({
    where: { academyId: staff.academyId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
    take: MAX_STUDENTS,
  });
  if (students.length === 0) return [];
  const ids = students.map((s) => s.id);
  const since = labWindowStart();

  const [attemptAgg, lastAttempts, stats, weakAgg] = await Promise.all([
    prisma.vocabDrillAttempt.groupBy({
      by: ["studentId", "correct"],
      where: {
        academyId: staff.academyId,
        studentId: { in: ids },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      orderBy: { studentId: "asc" },
      take: MAX_STUDENTS * 2, // 학생당 정답/오답 2행이 최대
    }),
    prisma.vocabDrillAttempt.groupBy({
      by: ["studentId"],
      where: {
        academyId: staff.academyId,
        studentId: { in: ids },
        createdAt: { gte: since },
      },
      _max: { createdAt: true },
      orderBy: { studentId: "asc" },
      take: MAX_STUDENTS,
    }),
    prisma.vocabDrillStat.findMany({
      where: { academyId: staff.academyId, studentId: { in: ids } },
      select: { studentId: true, sensesSeen: true, sensesMastered: true },
      take: ids.length,
    }),
    prisma.vocabDrillMastery.groupBy({
      by: ["studentId"],
      where: {
        academyId: staff.academyId,
        studentId: { in: ids },
        attempts: { gte: WEAK_MIN_ATTEMPTS },
        masteryScore: { lt: WEAK_SCORE },
      },
      _count: { _all: true },
      orderBy: { studentId: "asc" },
      take: MAX_STUDENTS,
    }),
  ]);

  const correctBy = new Map<string, number>();
  const wrongBy = new Map<string, number>();
  for (const row of attemptAgg) {
    (row.correct ? correctBy : wrongBy).set(row.studentId, row._count._all);
  }
  const lastBy = new Map(
    lastAttempts.map((r) => [r.studentId, r._max.createdAt] as const),
  );
  const statBy = new Map(stats.map((s) => [s.studentId, s] as const));
  const weakBy = new Map(weakAgg.map((w) => [w.studentId, w._count._all] as const));

  return students.map((s) => {
    const correct = correctBy.get(s.id) ?? 0;
    const wrong = wrongBy.get(s.id) ?? 0;
    const total = correct + wrong;
    const stat = statBy.get(s.id);
    return {
      studentId: s.id,
      name: s.name,
      grade: s.grade,
      attempts: total,
      correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
      sensesSeen: stat?.sensesSeen ?? 0,
      sensesMastered: stat?.sensesMastered ?? 0,
      weakCount: weakBy.get(s.id) ?? 0,
      lastStudiedAt: lastBy.get(s.id)?.toISOString() ?? null,
    };
  });
}

// ── 학원 전체 취약 표제어 TOP 20 ─────────────────────────────────────────────

export interface AcademyWeakLemmaRow {
  lemmaId: string;
  lemma: string;
  pos: string;
  /** 취약 기록(학생×sense — 숙달도 WEAK_SCORE 미만 & 시도 2회 이상) 수 */
  weakCount: number;
  /** 취약 기록의 평균 숙달도(반올림) */
  avgScore: number;
  per10k: number | null;
}

export async function getAcademyWeakLemmas(): Promise<AcademyWeakLemmaRow[]> {
  const staff = await requireStaffAuth();

  const grouped = await prisma.vocabDrillMastery.groupBy({
    by: ["lemmaId"],
    where: {
      academyId: staff.academyId,
      attempts: { gte: WEAK_MIN_ATTEMPTS },
      masteryScore: { lt: WEAK_SCORE },
    },
    _count: { _all: true },
    _avg: { masteryScore: true },
    orderBy: { _count: { lemmaId: "desc" } },
    take: 20,
  });
  if (grouped.length === 0) return [];

  const lemmas = await prisma.vocabDrillLemma.findMany({
    where: { id: { in: grouped.map((g) => g.lemmaId) } },
    select: { id: true, lemma: true, pos: true, per10k: true },
    take: 20,
  });
  const lemmaBy = new Map(lemmas.map((l) => [l.id, l] as const));

  return grouped.flatMap((g) => {
    const lemma = lemmaBy.get(g.lemmaId);
    if (!lemma) return []; // 콘텐츠 재적재로 표제어가 사라진 잔존 행 — 표시 제외
    return [
      {
        lemmaId: g.lemmaId,
        lemma: lemma.lemma,
        pos: lemma.pos,
        weakCount: g._count._all,
        avgScore: Math.round(g._avg.masteryScore ?? 0),
        per10k: lemma.per10k,
      },
    ];
  });
}

// ── 학생 상세 요약 (허브 단어 탭) ────────────────────────────────────────────

export interface StudentVocabSummary {
  student: { id: string; name: string; grade: number };
  stat: {
    xp: number;
    sensesSeen: number;
    sensesMastered: number;
    decksCompleted: number;
    reviewsDone: number;
    bestCombo: number;
    streakDays: number;
  } | null;
  totals: { solved: number; correct: number };
  /** 복습 만기(dueAt ≤ now) sense 수 */
  dueCount: number;
  recentAttempts: {
    id: string;
    lemma: string;
    senseKo: string;
    itemType: string;
    correct: boolean;
    timeMs: number;
    hintUsed: number;
    source: string;
    createdAt: string;
  }[];
  weak: {
    senseId: string;
    lemma: string;
    pos: string;
    senseKo: string;
    score: number;
    attempts: number;
    lapses: number;
  }[];
}

export async function getStudentVocabSummary(
  studentId: string,
): Promise<StudentVocabSummary | null> {
  const staff = await requireStaffAuth();

  // soft-ref 교차검증 — studentId 가 내 학원 소속일 때만 응답한다(어법 선례).
  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: staff.academyId },
    select: { id: true, name: true, grade: true },
  });
  if (!student) return null;

  const [stat, attemptAgg, dueCount, attempts, weakRows] = await Promise.all([
    prisma.vocabDrillStat.findFirst({
      where: { studentId, academyId: staff.academyId },
    }),
    prisma.vocabDrillAttempt.groupBy({
      by: ["correct"],
      where: { academyId: staff.academyId, studentId },
      _count: { _all: true },
    }),
    prisma.vocabDrillMastery.count({
      where: {
        academyId: staff.academyId,
        studentId,
        dueAt: { lte: new Date() },
      },
    }),
    prisma.vocabDrillAttempt.findMany({
      where: { academyId: staff.academyId, studentId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        senseId: true,
        itemType: true,
        correct: true,
        timeMs: true,
        hintUsed: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.vocabDrillMastery.findMany({
      where: {
        academyId: staff.academyId,
        studentId,
        attempts: { gte: WEAK_MIN_ATTEMPTS },
        masteryScore: { lt: WEAK_SCORE },
      },
      orderBy: { masteryScore: "asc" },
      take: 10,
      select: {
        senseId: true,
        masteryScore: true,
        attempts: true,
        lapses: true,
      },
    }),
  ]);

  // sense 표기 조인 — 최근 시도 20 + 취약 10 의 senseId 합집합(상한 30)만.
  const senseIds = [
    ...new Set([
      ...attempts.map((a) => a.senseId),
      ...weakRows.map((w) => w.senseId),
    ]),
  ].slice(0, 60);
  const senses = senseIds.length
    ? await prisma.vocabDrillSense.findMany({
        where: { id: { in: senseIds } },
        select: { id: true, lemma: true, pos: true, senseKo: true },
        take: 60,
      })
    : [];
  const senseBy = new Map(senses.map((s) => [s.id, s] as const));

  const solvedCorrect =
    attemptAgg.find((r) => r.correct)?._count._all ?? 0;
  const solvedWrong = attemptAgg.find((r) => !r.correct)?._count._all ?? 0;

  return {
    student,
    stat: stat
      ? {
          xp: stat.xp,
          sensesSeen: stat.sensesSeen,
          sensesMastered: stat.sensesMastered,
          decksCompleted: stat.decksCompleted,
          reviewsDone: stat.reviewsDone,
          bestCombo: stat.bestCombo,
          streakDays: stat.streakDays,
        }
      : null,
    totals: { solved: solvedCorrect + solvedWrong, correct: solvedCorrect },
    dueCount,
    recentAttempts: attempts.map((a) => {
      const sense = senseBy.get(a.senseId);
      return {
        id: a.id,
        lemma: sense?.lemma ?? "—",
        senseKo: sense?.senseKo ?? "",
        itemType: a.itemType,
        correct: a.correct,
        timeMs: a.timeMs,
        hintUsed: a.hintUsed,
        source: a.source,
        createdAt: a.createdAt.toISOString(),
      };
    }),
    weak: weakRows.flatMap((w) => {
      const sense = senseBy.get(w.senseId);
      if (!sense) return []; // 재적재로 사라진 sense — 표시 제외
      return [
        {
          senseId: w.senseId,
          lemma: sense.lemma,
          pos: sense.pos,
          senseKo: sense.senseKo,
          score: Math.round(w.masteryScore),
          attempts: w.attempts,
          lapses: w.lapses,
        },
      ];
    }),
  };
}

// ── 표제어 검색 (접두) ───────────────────────────────────────────────────────

export interface VocabLemmaSearchRow {
  lemmaId: string;
  lemma: string;
  pos: string;
  isPhrase: boolean;
  /** 활성 sense 수 — lemma.senseCount 컬럼(적재기 유지) */
  senseCount: number;
  per10k: number | null;
  trendLabel: string | null;
  gradeTop: string | null;
}

export async function searchVocabLemmas(
  prefix: string,
): Promise<VocabLemmaSearchRow[]> {
  await requireStaffAuth();
  // 접두 인덱스(text_pattern_ops)가 받도록 소문자 정규화(표제어는 소문자 적재).
  const q = prefix.trim().toLowerCase().slice(0, 40);
  if (!q) return [];

  const rows = await prisma.vocabDrillLemma.findMany({
    where: { lemma: { startsWith: q }, retiredAt: null },
    orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { lemma: "asc" }],
    take: 20,
    select: {
      id: true,
      lemma: true,
      pos: true,
      isPhrase: true,
      senseCount: true,
      per10k: true,
      trendLabel: true,
      gradeTop: true,
    },
  });
  return rows.map((r) => ({
    lemmaId: r.id,
    lemma: r.lemma,
    pos: r.pos,
    isPhrase: r.isPhrase,
    senseCount: r.senseCount,
    per10k: r.per10k,
    trendLabel: r.trendLabel,
    gradeTop: r.gradeTop,
  }));
}

// ── 표제어 상세 (senses + 연도 시계열) ───────────────────────────────────────

export interface VocabLemmaDetail {
  lemma: {
    id: string;
    lemma: string;
    pos: string;
    isPhrase: boolean;
    senseCount: number;
    per10k: number | null;
    gradeTop: string | null;
    trendLabel: string | null;
    collocations: string[];
    confusable: string[];
  };
  senses: {
    id: string;
    senseKo: string;
    senseEn: string;
    tier: string;
    difficulty: number;
    exampleCount: number;
    trapCount: number;
  }[];
  /** vocab_drill_lemma_year_stats PK 조회 — 없으면 null(시계열 없음) */
  yearStats: {
    byYear: Record<string, number>;
    per10kByYear: Record<string, number>;
    yearMin: number | null;
    yearMax: number | null;
  } | null;
}

export async function getVocabLemmaDetail(
  lemmaId: string,
): Promise<VocabLemmaDetail | null> {
  await requireStaffAuth();

  const [lemma, senses, yearStat] = await Promise.all([
    prisma.vocabDrillLemma.findFirst({
      where: { id: lemmaId, retiredAt: null },
    }),
    prisma.vocabDrillSense.findMany({
      where: { lemmaId, retiredAt: null },
      orderBy: { senseOrder: "asc" },
      take: 20,
      select: {
        id: true,
        senseKo: true,
        senseEn: true,
        tier: true,
        difficulty: true,
        exampleCount: true,
        trapCount: true,
      },
    }),
    prisma.vocabDrillLemmaYearStat.findUnique({ where: { lemmaId } }),
  ]);
  if (!lemma) return null;

  return {
    lemma: {
      id: lemma.id,
      lemma: lemma.lemma,
      pos: lemma.pos,
      isPhrase: lemma.isPhrase,
      senseCount: lemma.senseCount,
      per10k: lemma.per10k,
      gradeTop: lemma.gradeTop,
      trendLabel: lemma.trendLabel,
      collocations: toStrArray(lemma.collocations).slice(0, 8),
      confusable: toStrArray(lemma.confusable).slice(0, 8),
    },
    senses,
    yearStats: yearStat
      ? {
          byYear: toNumRecord(yearStat.byYear),
          per10kByYear: toNumRecord(yearStat.per10kByYear),
          yearMin: yearStat.yearMin,
          yearMax: yearStat.yearMax,
        }
      : null,
  };
}

// ── 추세 라벨별 표제어 ───────────────────────────────────────────────────────

export interface TrendLemmaRow {
  lemmaId: string;
  lemma: string;
  pos: string;
  per10k: number | null;
  trendRatio: number | null;
  gradeTop: string | null;
}

export async function listTrendLemmas(label: string): Promise<TrendLemmaRow[]> {
  await requireStaffAuth();
  const trend = label.trim().slice(0, 20);
  if (!trend) return [];

  const rows = await prisma.vocabDrillLemma.findMany({
    where: { trendLabel: trend, retiredAt: null },
    orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { lemma: "asc" }],
    take: 50,
    select: {
      id: true,
      lemma: true,
      pos: true,
      per10k: true,
      trendRatio: true,
      gradeTop: true,
    },
  });
  return rows.map((r) => ({
    lemmaId: r.id,
    lemma: r.lemma,
    pos: r.pos,
    per10k: r.per10k,
    trendRatio: r.trendRatio,
    gradeTop: r.gradeTop,
  }));
}
