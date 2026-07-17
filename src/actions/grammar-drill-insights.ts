"use server";

// ============================================================================
// 어법 드릴 — 학원 단위 인사이트 (/director/grammar-lab 취약 개념 랭킹)
//
// 학생별 집계(grammar-drill-admin)와 달리 개념 축으로 학원 전체를 본다.
// requireStaffAuth 후 staff.academyId 테넌트 교차검증. 드릴 엔진 무수정 —
// grammarDrillMastery 읽기 전용 집계다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import {
  CONCEPT_SKELETON_BY_ID,
  GRAMMAR_CONCEPT_SKELETONS,
} from "@/lib/grammar-drill/curriculum";

/** 신뢰 가능한 표본 하한 — 시도 3회 미만 학생의 숙달 점수는 집계에서 제외 */
const MIN_ATTEMPTS = 3;
/** 취약 판정선 — 숙달 60점 미만이면 보강 과제 프리셀렉트 대상 */
const WEAK_SCORE = 60;
/** 레슨 완료율 랭킹의 표본 하한 — 1명짜리 개념이 0%/100% 로 랭킹을 점거하지 않게 */
const MIN_LESSON_LEARNERS = 2;
/** 완료율 상·하위 노출 개수 */
const COMPLETION_RANK_SIZE = 5;
/** confidence 1 = "자신 없음" (스키마: 1 자신 없음 ~ 3 설명할 수 있음) */
const LOW_CONFIDENCE = 1;

export interface AcademyConceptRankingRow {
  conceptId: string;
  title: string;
  /** 평균 숙달 점수(0~100 반올림) — 시도 3회 이상 학생 기준 */
  avgMastery: number;
  /** 집계에 포함된 학습 학생 수 */
  studentCount: number;
  /** 숙달 60점 미만 재원(ACTIVE) 학생 — 보강 과제 defaultStudentIds */
  weakStudentIds: string[];
}

/** 학원 취약 개념 TOP 8 — 평균 숙달 낮은순 */
export async function getAcademyConceptRanking(): Promise<AcademyConceptRankingRow[]> {
  const staff = await requireStaffAuth();

  const grouped = await prisma.grammarDrillMastery.groupBy({
    by: ["conceptId"],
    where: { academyId: staff.academyId, attempts: { gte: MIN_ATTEMPTS } },
    _avg: { masteryScore: true },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];

  const top = [...grouped]
    .sort((a, b) => (a._avg.masteryScore ?? 0) - (b._avg.masteryScore ?? 0))
    .slice(0, 8);

  // 취약 학생 수집 — relation-free 이므로 ACTIVE 재원생만 남겨 프리셀렉트
  // (퇴원생 id 가 컴포저 선택에 섞이지 않게 한다)
  const weakRows = await prisma.grammarDrillMastery.findMany({
    where: {
      academyId: staff.academyId,
      conceptId: { in: top.map((t) => t.conceptId) },
      attempts: { gte: MIN_ATTEMPTS },
      masteryScore: { lt: WEAK_SCORE },
    },
    select: { conceptId: true, studentId: true },
  });
  const activeIds = new Set<string>();
  if (weakRows.length > 0) {
    const activeStudents = await prisma.student.findMany({
      where: {
        academyId: staff.academyId,
        status: "ACTIVE",
        id: { in: [...new Set(weakRows.map((w) => w.studentId))] },
      },
      select: { id: true },
    });
    for (const s of activeStudents) activeIds.add(s.id);
  }

  return top.map((t) => ({
    conceptId: t.conceptId,
    title: CONCEPT_SKELETON_BY_ID.get(t.conceptId)?.title ?? t.conceptId,
    avgMastery: Math.round(t._avg.masteryScore ?? 0),
    studentCount: t._count._all,
    weakStudentIds: weakRows
      .filter((w) => w.conceptId === t.conceptId && activeIds.has(w.studentId))
      .map((w) => w.studentId),
  }));
}

// ============================================================================
// 개념 학습(레슨) 인사이트 — 숙달 점수(정답률)로는 보이지 않는 신호.
//
// 드릴 숙달도는 "맞혔는가"만 말한다. 레슨 진행 기록(grammarDrillLessonProgress)은
// 학생이 스스로 남긴 (1) 이해도 자기평가 confidence, (2) 필기 note, (3) 완료 여부를
// 담고 있다 — 정답률이 높아도 "자신 없음"이 몰린 개념은 암기로 버틴 개념이다.
//
// getAcademyConceptRanking 과 분리된 **신규 액션**이다(기존 반환 타입 무변경).
// ============================================================================

/** 개념 1개의 학원 전체 레슨 지표 */
export interface ConceptLessonInsight {
  conceptId: string;
  unitId: string;
  title: string;
  /** 레슨을 연 학생 수(완료 무관) */
  learners: number;
  /** 레슨을 완료한 학생 수 */
  completed: number;
  /** 완료율 0~100 — completed / learners */
  completionRate: number;
  /** 이해도를 응답한 학생 수 */
  rated: number;
  /** 평균 이해도 1.0~3.0 (소수 1자리) — 응답 없으면 null */
  avgConfidence: number | null;
  /** "자신 없음"(1점)을 고른 학생 수 */
  lowConfidence: number;
  /** 응답자 중 "자신 없음" 비율 0~100 — 응답 없으면 null */
  lowConfidenceRate: number | null;
  /** 필기를 남긴 학생 수 */
  notesWritten: number;
}

/** 학생 1명의 레슨 요약 — 목록 "개념 학습" 열 */
export interface StudentLessonSummary {
  /** 완료한 개념 레슨 수 */
  completed: number;
  /** 열어본 개념 레슨 수(완료 포함) */
  started: number;
  /** "자신 없음"으로 표시한 개념 수 */
  lowConfidence: number;
  /** 필기를 남긴 개념 수 */
  notesWritten: number;
  /** 마지막 레슨 활동 시각(ISO) */
  lastLessonAt: string | null;
}

export interface AcademyLessonInsights {
  /** 커리큘럼 전체 개념 수(분모 정본) — 기초 28 + 판별 47 = 75 */
  totalConcepts: number;
  /** 레슨을 한 번이라도 연 학생 수 */
  learnerCount: number;
  /** 완료된 레슨 수(학생×개념) */
  completedLessons: number;
  /** 열린 레슨 수(학생×개념) */
  startedLessons: number;
  /** (a) 학원 평균 이해도 1.0~3.0 — 응답 없으면 null */
  avgConfidence: number | null;
  /** (a) 응답 중 "자신 없음" 비율 0~100 — 응답 없으면 null */
  lowConfidenceRate: number | null;
  /** (b) 필기 미작성률 0~100 — **완료 레슨** 기준(완료했는데 필기가 없다 = 신호). 완료 0이면 null */
  noteMissingRate: number | null;
  /** (b) 필기 미작성 완료 레슨 수 */
  noteMissingCount: number;
  /** 개념별 지표 — 레슨 기록이 있는 개념만, 완료율 낮은 순 */
  byConcept: ConceptLessonInsight[];
  /** (c) 완료율 하위 개념(표본 2명 이상) */
  bottomCompletion: ConceptLessonInsight[];
  /** (c) 완료율 상위 개념(표본 2명 이상) — bottom 과 중복되지 않는다 */
  topCompletion: ConceptLessonInsight[];
  /** 학생 id → 레슨 요약 */
  byStudent: Record<string, StudentLessonSummary>;
}

function emptyInsights(): AcademyLessonInsights {
  return {
    totalConcepts: GRAMMAR_CONCEPT_SKELETONS.length,
    learnerCount: 0,
    completedLessons: 0,
    startedLessons: 0,
    avgConfidence: null,
    lowConfidenceRate: null,
    noteMissingRate: null,
    noteMissingCount: 0,
    byConcept: [],
    bottomCompletion: [],
    topCompletion: [],
    byStudent: {},
  };
}

/** 개념별 누적기 — 집계 중간 상태 */
interface ConceptAcc {
  learners: number;
  completed: number;
  rated: number;
  confidenceSum: number;
  lowConfidence: number;
  notesWritten: number;
}

/**
 * 학원 전체 개념 학습(레슨) 인사이트.
 * (a) 개념별 평균 이해도 · "자신 없음" 비율 (b) 필기 미작성률 (c) 완료율 상·하위 개념.
 */
export async function getAcademyLessonInsights(): Promise<AcademyLessonInsights> {
  const staff = await requireStaffAuth();

  // note 는 @db.Text 다 — 본문을 끌어오지 않고 "필기가 있는 행"의 키만 따로 받는다.
  const [rows, notedRows] = await Promise.all([
    prisma.grammarDrillLessonProgress.findMany({
      where: { academyId: staff.academyId },
      select: {
        studentId: true,
        conceptId: true,
        unitId: true,
        confidence: true,
        completedAt: true,
        updatedAt: true,
      },
    }),
    prisma.grammarDrillLessonProgress.findMany({
      where: {
        academyId: staff.academyId,
        note: { not: null },
        NOT: { note: "" },
      },
      select: { studentId: true, conceptId: true },
    }),
  ]);

  if (rows.length === 0) return emptyInsights();

  const notedKeys = new Set(
    notedRows.map((n) => `${n.studentId} ${n.conceptId}`),
  );

  const byConceptAcc = new Map<string, ConceptAcc>();
  const unitOfConcept = new Map<string, string>();
  const byStudent: Record<string, StudentLessonSummary> = {};

  let completedLessons = 0;
  let rated = 0;
  let confidenceSum = 0;
  let lowConfidenceTotal = 0;
  let noteMissingCount = 0;

  for (const r of rows) {
    const hasNote = notedKeys.has(`${r.studentId} ${r.conceptId}`);
    const isDone = r.completedAt !== null;
    const isLow = r.confidence === LOW_CONFIDENCE;

    // ── 학원 합계 ──
    if (isDone) {
      completedLessons++;
      if (!hasNote) noteMissingCount++; // 미작성률은 '완료 레슨' 기준
    }
    if (r.confidence != null) {
      rated++;
      confidenceSum += r.confidence;
      if (isLow) lowConfidenceTotal++;
    }

    // ── 개념 축 ──
    unitOfConcept.set(r.conceptId, r.unitId);
    const c = byConceptAcc.get(r.conceptId) ?? {
      learners: 0,
      completed: 0,
      rated: 0,
      confidenceSum: 0,
      lowConfidence: 0,
      notesWritten: 0,
    };
    c.learners++;
    if (isDone) c.completed++;
    if (r.confidence != null) {
      c.rated++;
      c.confidenceSum += r.confidence;
      if (isLow) c.lowConfidence++;
    }
    if (hasNote) c.notesWritten++;
    byConceptAcc.set(r.conceptId, c);

    // ── 학생 축 ──
    const s = byStudent[r.studentId] ?? {
      completed: 0,
      started: 0,
      lowConfidence: 0,
      notesWritten: 0,
      lastLessonAt: null,
    };
    s.started++;
    if (isDone) s.completed++;
    if (isLow) s.lowConfidence++;
    if (hasNote) s.notesWritten++;
    const at = r.updatedAt.toISOString();
    if (s.lastLessonAt === null || at > s.lastLessonAt) s.lastLessonAt = at;
    byStudent[r.studentId] = s;
  }

  const byConcept: ConceptLessonInsight[] = [...byConceptAcc.entries()]
    .map(([conceptId, c]) => ({
      conceptId,
      unitId: unitOfConcept.get(conceptId) ?? "",
      title: CONCEPT_SKELETON_BY_ID.get(conceptId)?.title ?? conceptId,
      learners: c.learners,
      completed: c.completed,
      completionRate: Math.round((c.completed / c.learners) * 100),
      rated: c.rated,
      avgConfidence:
        c.rated > 0 ? Math.round((c.confidenceSum / c.rated) * 10) / 10 : null,
      lowConfidence: c.lowConfidence,
      lowConfidenceRate:
        c.rated > 0 ? Math.round((c.lowConfidence / c.rated) * 100) : null,
      notesWritten: c.notesWritten,
    }))
    // 완료율 낮은 순 → 동률이면 표본 큰 순(신뢰도 높은 쪽을 위로)
    .sort(
      (a, b) =>
        a.completionRate - b.completionRate || b.learners - a.learners,
    );

  // (c) 상·하위 — 표본 하한을 넘긴 개념만. 한 개념이 양쪽에 동시에 들어가지 않게 자른다.
  const eligible = byConcept.filter((c) => c.learners >= MIN_LESSON_LEARNERS);
  const bottomCompletion = eligible.slice(0, COMPLETION_RANK_SIZE);
  const topCompletion = eligible
    .slice(bottomCompletion.length)
    .slice(-COMPLETION_RANK_SIZE)
    .reverse(); // 완료율 높은 순

  return {
    totalConcepts: GRAMMAR_CONCEPT_SKELETONS.length,
    learnerCount: Object.keys(byStudent).length,
    completedLessons,
    startedLessons: rows.length,
    avgConfidence:
      rated > 0 ? Math.round((confidenceSum / rated) * 10) / 10 : null,
    lowConfidenceRate:
      rated > 0 ? Math.round((lowConfidenceTotal / rated) * 100) : null,
    noteMissingRate:
      completedLessons > 0
        ? Math.round((noteMissingCount / completedLessons) * 100)
        : null,
    noteMissingCount,
    byConcept,
    bottomCompletion,
    topCompletion,
    byStudent,
  };
}
