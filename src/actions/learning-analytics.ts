// @ts-nocheck — sessionRecord/lessonProgress models pending
"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import type { LearningAnalytics } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// 1. getLearningAnalytics — 학생용 학습 분석 (모바일 세션 기반)
// ---------------------------------------------------------------------------

export async function getLearningAnalytics(): Promise<LearningAnalytics> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [sessionRecords, lessonProgressList] = await Promise.all([
    prisma.sessionRecord.findMany({
      where: { studentId, completedAt: { gte: threeMonthsAgo } },
      select: {
        score: true,
        sessionType: true,
        completedAt: true,
        xpEarned: true,
        passageId: true,
        correctCount: true,
        totalCount: true,
        vocabCorrect: true,
        vocabTotal: true,
        grammarCorrect: true,
        grammarTotal: true,
        interpretCorrect: true,
        interpretTotal: true,
        compCorrect: true,
        compTotal: true,
      },
      orderBy: { completedAt: "asc" },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId },
      include: { passage: { select: { id: true, title: true } } },
    }),
  ]);

  // ── 영역별 점수: 카테고리 필드에서 직접 집계 ──
  let vocabCorrectSum = 0, vocabTotalSum = 0;
  let grammarCorrectSum = 0, grammarTotalSum = 0;
  let interpretCorrectSum = 0, interpretTotalSum = 0;
  let compCorrectSum = 0, compTotalSum = 0;

  for (const r of sessionRecords) {
    vocabCorrectSum += r.vocabCorrect;
    vocabTotalSum += r.vocabTotal;
    grammarCorrectSum += r.grammarCorrect;
    grammarTotalSum += r.grammarTotal;
    interpretCorrectSum += r.interpretCorrect;
    interpretTotalSum += r.interpretTotal;
    compCorrectSum += r.compCorrect;
    compTotalSum += r.compTotal;
  }

  const pct = (correct: number, total: number) =>
    total > 0 ? Math.round((correct / total) * 100) : 0;

  const radarScores = {
    vocab: pct(vocabCorrectSum, vocabTotalSum),
    interpretation: pct(interpretCorrectSum, interpretTotalSum),
    grammar: pct(grammarCorrectSum, grammarTotalSum),
    comprehension: pct(compCorrectSum, compTotalSum),
  };

  // ── 지문별 숙달도 ──
  const passageMastery = lessonProgressList.map((lp) => ({
    passageId: lp.passage.id,
    passageTitle: lp.passage.title,
    masteryScore: Math.round(lp.masteryScore),
  }));

  // ── 오답 패턴 (NaeshinWrongAnswerLog 기반) ──
  const naeshinWrongLogs = await prisma.naeshinWrongAnswerLog.findMany({
    where: { studentId },
    include: {
      question: {
        select: { learningCategory: true, subType: true },
      },
    },
    orderBy: { count: "desc" },
    take: 10,
  });

  const weakPoints = naeshinWrongLogs
    .filter((w) => w.question?.learningCategory)
    .map((w) => ({
      category: w.question?.learningCategory ?? "",
      subCategory: w.question?.subType ?? "",
      wrongCount: w.count,
    }));

  // ── 주간 추이 (최근 8주) ──
  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

  const weeklyTrend: LearningAnalytics["weeklyTrend"] = [];
  const now = new Date();

  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7 + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekRecords = sessionRecords.filter(
      (r) => r.completedAt >= weekStart && r.completedAt < weekEnd
    );

    if (weekRecords.length > 0) {
      weeklyTrend.push({
        weekLabel: `${weekStart.getMonth() + 1}/${weekStart.getDate()} ~ ${weekEnd.getMonth() + 1}/${weekEnd.getDate() - 1}`,
        accuracy: avg(weekRecords.map((r) => r.score)),
        sessionsCompleted: weekRecords.length,
        xpEarned: weekRecords.reduce((s, r) => s + r.xpEarned, 0),
      });
    }
  }

  return { radarScores, passageMastery, weakPoints, weeklyTrend };
}
