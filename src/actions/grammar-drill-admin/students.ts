"use server";

// ============================================================================
// 어법 드릴 — 원장/강사용 서버 액션: 학생 목록·상세 (/director/grammar-lab)
//
// 모든 액션은 requireStaffAuth 후 staff.academyId 로 테넌트 교차검증한다.
// GrammarDrill* 테이블은 relation-free — 학생 정보는 명시 조인.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import {
  GRAMMAR_UNITS,
  CONCEPT_SKELETON_BY_ID,
} from "@/lib/grammar-drill/curriculum";
import { getGrammarItem } from "@/lib/grammar-drill/bundle";
import { stripMarkup } from "@/lib/grammar-drill/markup";

// ── 학생 목록 (집계) ─────────────────────────────────────────────────────────

export interface GrammarLabStudentRow {
  studentId: string;
  name: string;
  grade: number;
  studentCode: string;
  /** 재원(ENROLLED) 반 — 반 칩 필터·학생 셀 병기용 */
  classes: { id: string; name: string }[];
  totalAttempts: number;
  accuracy: number | null;
  lastActiveAt: string | null;
  unitsMastered: number;
  unitsStarted: number;
  weakest: {
    conceptId: string;
    title: string;
    score: number;
    attempts: number;
    correct: number;
  } | null;
  openAssignments: number;
  /** 미완료 배정 중 가장 오래된 생성 시각 — "최장 N일 경과" 표시용 */
  oldestOpenAssignmentAt: string | null;
}

export async function listGrammarLabStudents(): Promise<GrammarLabStudentRow[]> {
  const staff = await requireStaffAuth();

  const students = await prisma.student.findMany({
    where: { academyId: staff.academyId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      studentCode: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { class: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  if (students.length === 0) return [];
  const ids = students.map((s) => s.id);

  const [attemptAgg, lastAttempts, masteries, progresses, assignments] =
    await Promise.all([
      prisma.grammarDrillAttempt.groupBy({
        by: ["studentId", "correct"],
        where: { academyId: staff.academyId, studentId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.grammarDrillAttempt.groupBy({
        by: ["studentId"],
        where: { academyId: staff.academyId, studentId: { in: ids } },
        _max: { createdAt: true },
      }),
      prisma.grammarDrillMastery.findMany({
        where: { academyId: staff.academyId, studentId: { in: ids } },
      }),
      prisma.grammarDrillUnitProgress.findMany({
        where: { academyId: staff.academyId, studentId: { in: ids } },
      }),
      prisma.grammarDrillAssignment.groupBy({
        by: ["studentId"],
        where: {
          academyId: staff.academyId,
          studentId: { in: ids },
          status: { not: "DONE" },
        },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
    ]);

  return students.map((s) => {
    const correctRow = attemptAgg.find(
      (a) => a.studentId === s.id && a.correct,
    )?._count._all ?? 0;
    const wrongRow = attemptAgg.find(
      (a) => a.studentId === s.id && !a.correct,
    )?._count._all ?? 0;
    const total = correctRow + wrongRow;
    const myMasteries = masteries.filter(
      (m) => m.studentId === s.id && m.attempts >= 3,
    );
    const weakestRow = [...myMasteries].sort(
      (a, b) => a.masteryScore - b.masteryScore,
    )[0];
    const myProgress = progresses.filter((p) => p.studentId === s.id);
    const assignmentRow = assignments.find((a) => a.studentId === s.id);
    return {
      studentId: s.id,
      name: s.name,
      grade: s.grade,
      studentCode: s.studentCode,
      classes: s.classEnrollments.map((e) => e.class),
      totalAttempts: total,
      accuracy: total > 0 ? Math.round((correctRow / total) * 100) : null,
      lastActiveAt:
        lastAttempts
          .find((l) => l.studentId === s.id)
          ?._max.createdAt?.toISOString() ?? null,
      unitsMastered: myProgress.filter((p) => p.stage === "MASTERED").length,
      unitsStarted: myProgress.length,
      weakest: weakestRow
        ? {
            conceptId: weakestRow.conceptId,
            title:
              CONCEPT_SKELETON_BY_ID.get(weakestRow.conceptId)?.title ??
              weakestRow.conceptId,
            score: Math.round(weakestRow.masteryScore),
            attempts: weakestRow.attempts,
            correct: weakestRow.correct,
          }
        : null,
      openAssignments: assignmentRow?._count._all ?? 0,
      oldestOpenAssignmentAt:
        assignmentRow?._min.createdAt?.toISOString() ?? null,
    };
  });
}

// ── 학생 상세 ────────────────────────────────────────────────────────────────

export async function getGrammarLabStudentDetail(studentId: string) {
  const staff = await requireStaffAuth();
  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: staff.academyId },
    select: { id: true, name: true, grade: true, studentCode: true },
  });
  if (!student) return null;

  const [masteries, progresses, attempts, assignments, chatMessages, lessons] =
    await Promise.all([
      prisma.grammarDrillMastery.findMany({ where: { studentId } }),
      prisma.grammarDrillUnitProgress.findMany({ where: { studentId } }),
      prisma.grammarDrillAttempt.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
      prisma.grammarDrillAssignment.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.grammarDrillChatMessage.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
      // 개념 학습(레슨) 진행 — 개념당 1행(@@unique studentId+conceptId).
      // 학생이 남긴 필기(note)·이해도(confidence)가 교사의 오개념 창구다.
      prisma.grammarDrillLessonProgress.findMany({
        where: { studentId },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  // 유형·힌트·시간 집계는 전량 기준(원장 시야) — 최근 2000건 캡
  const allAttempts = await prisma.grammarDrillAttempt.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      itemType: true,
      correct: true,
      hintUsed: true,
      conceptPeeked: true,
      timeMs: true,
      difficulty: true,
      createdAt: true,
      source: true,
    },
  });

  // 서울(UTC+9) 고정 일자 키 — 집계 루프·14일 활동이 공유
  const SEOUL = 9 * 3600_000;
  const dayKey = (d: Date) => Math.floor((d.getTime() + SEOUL) / 86_400_000);
  const today = dayKey(new Date());

  const byType: Record<string, { total: number; correct: number }> = {};
  const byDifficulty: Record<string, { total: number; correct: number }> = {};
  const bySource: Record<string, { total: number; correct: number }> = {};
  let hintCount = 0;
  let peekCount = 0;
  let timeSum = 0;
  // 최근 7일 / 직전 7일 — KPI 추세 델타(허브 어법 탭)용 병행 집계
  const recent7 = { solved: 0, correct: 0 };
  const prev7 = { solved: 0, correct: 0 };
  for (const a of allAttempts) {
    (byType[a.itemType] ??= { total: 0, correct: 0 }).total++;
    if (a.correct) byType[a.itemType].correct++;
    (byDifficulty[a.difficulty] ??= { total: 0, correct: 0 }).total++;
    if (a.correct) byDifficulty[a.difficulty].correct++;
    (bySource[a.source] ??= { total: 0, correct: 0 }).total++;
    if (a.correct) bySource[a.source].correct++;
    if (a.hintUsed > 0) hintCount++;
    if (a.conceptPeeked) peekCount++;
    timeSum += a.timeMs;
    const diff = today - dayKey(a.createdAt);
    if (diff >= 0 && diff < 7) {
      recent7.solved++;
      if (a.correct) recent7.correct++;
    } else if (diff >= 7 && diff < 14) {
      prev7.solved++;
      if (a.correct) prev7.correct++;
    }
  }

  // 최근 14일 일별 활동
  const days = Array.from({ length: 14 }, (_, i) => ({
    offset: 13 - i,
    solved: 0,
    correct: 0,
  }));
  for (const a of allAttempts) {
    const diff = today - dayKey(a.createdAt);
    if (diff >= 0 && diff < 14) {
      const cell = days[13 - diff];
      cell.solved++;
      if (a.correct) cell.correct++;
    }
  }

  const grid = GRAMMAR_UNITS.map((u) => ({
    unitId: u.id,
    title: u.title,
    part: u.part,
    stage: progresses.find((p) => p.unitId === u.id)?.stage ?? "CONCEPT",
    bestTestScore:
      progresses.find((p) => p.unitId === u.id)?.bestTestScore ?? null,
    concepts: u.conceptIds.map((cid) => {
      const m = masteries.find((x) => x.conceptId === cid);
      return {
        conceptId: cid,
        title: CONCEPT_SKELETON_BY_ID.get(cid)?.title ?? cid,
        score: Math.round(m?.masteryScore ?? 0),
        attempts: m?.attempts ?? 0,
        correct: m?.correct ?? 0,
        box: m?.box ?? 0,
        lastAttemptAt: m?.lastAttemptAt?.toISOString() ?? null,
      };
    }),
  }));

  const recentAttempts = attempts.map((a) => {
    const item = getGrammarItem(a.itemId);
    let preview = a.itemId;
    if (item) {
      const text =
        "stem" in item
          ? item.stem
          : "sentence" in item
            ? item.sentence
            : item.text;
      preview = stripMarkup(text).slice(0, 80);
    }
    return {
      id: a.id,
      itemId: a.itemId,
      unitId: a.unitId,
      conceptId: a.conceptId,
      conceptTitle:
        CONCEPT_SKELETON_BY_ID.get(a.conceptId)?.title ?? a.conceptId,
      itemType: a.itemType,
      difficulty: a.difficulty,
      correct: a.correct,
      answer: a.answer,
      hintUsed: a.hintUsed,
      conceptPeeked: a.conceptPeeked,
      timeMs: a.timeMs,
      source: a.source,
      createdAt: a.createdAt.toISOString(),
      preview,
    };
  });

  return {
    student,
    grid,
    byType,
    byDifficulty,
    bySource,
    days,
    totals: {
      solved: allAttempts.length,
      correct: allAttempts.filter((a) => a.correct).length,
      hintRate: allAttempts.length ? hintCount / allAttempts.length : 0,
      peekRate: allAttempts.length ? peekCount / allAttempts.length : 0,
      avgTimeMs: allAttempts.length ? Math.round(timeSum / allAttempts.length) : 0,
      recent7,
      prev7,
    },
    recentAttempts,
    lessons: lessons.map((l) => ({
      conceptId: l.conceptId,
      unitId: l.unitId,
      conceptTitle:
        CONCEPT_SKELETON_BY_ID.get(l.conceptId)?.title ?? l.conceptId,
      blocksSeen: l.blocksSeen,
      blocksTotal: l.blocksTotal,
      checkCorrect: l.checkCorrect,
      checkTotal: l.checkTotal,
      confidence: l.confidence,
      note: l.note,
      secondsSpent: l.secondsSpent,
      completedAt: l.completedAt?.toISOString() ?? null,
      updatedAt: l.updatedAt.toISOString(),
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      note: a.note,
      status: a.status,
      spec: a.spec as Record<string, unknown>,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
      resultSummary: a.resultSummary as Record<string, unknown> | null,
    })),
    chatMessages: chatMessages
      .reverse()
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        contextItemId: m.contextItemId,
        createdAt: m.createdAt.toISOString(),
      })),
  };
}

export type GrammarLabStudentDetail = NonNullable<
  Awaited<ReturnType<typeof getGrammarLabStudentDetail>>
>;
