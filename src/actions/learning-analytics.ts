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
// 1. getLearningAnalytics — 학생용 학습 분석 (인바디)
// ---------------------------------------------------------------------------

export async function getLearningAnalytics(): Promise<LearningAnalytics> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [sessionRecords, wrongLogs, lessonProgressList] = await Promise.all([
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
      },
      orderBy: { completedAt: "asc" },
    }),
    prisma.wrongAnswerLog.findMany({
      where: { studentId },
      select: { category: true, subCategory: true, count: true },
      orderBy: { count: "desc" },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId },
      include: { passage: { select: { id: true, title: true } } },
    }),
  ]);

  // 영역별 점수 (세션 타입에서 추론)
  const categoryScores = { VOCAB: [] as number[], INTERPRETATION: [] as number[], GRAMMAR: [] as number[], COMPREHENSION: [] as number[] };

  for (const record of sessionRecords) {
    if (record.sessionType === "VOCAB_FOCUS") {
      categoryScores.VOCAB.push(record.score);
    } else if (record.sessionType === "GRAMMAR_FOCUS") {
      categoryScores.GRAMMAR.push(record.score);
    } else if (record.sessionType === "MIX_1" || record.sessionType === "MIX_2") {
      // 종합 믹스는 모든 카테고리에 기여
      categoryScores.VOCAB.push(record.score);
      categoryScores.INTERPRETATION.push(record.score);
      categoryScores.GRAMMAR.push(record.score);
      categoryScores.COMPREHENSION.push(record.score);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

  const radarScores = {
    vocab: avg(categoryScores.VOCAB),
    interpretation: avg(categoryScores.INTERPRETATION),
    grammar: avg(categoryScores.GRAMMAR),
    comprehension: avg(categoryScores.COMPREHENSION),
  };

  // 지문별 숙달도
  const passageMastery = lessonProgressList.map((lp) => ({
    passageId: lp.passage.id,
    passageTitle: lp.passage.title,
    masteryScore: Math.round(lp.masteryScore),
  }));

  // 오답 패턴 (많은 순, 상위 10개)
  const weakPoints = wrongLogs
    .filter((w) => w.category)
    .slice(0, 10)
    .map((w) => ({
      category: w.category ?? "",
      subCategory: w.subCategory ?? "",
      wrongCount: w.count,
    }));

  // 주간 추이 (최근 8주)
  const weeklyTrend: LearningAnalytics["weeklyTrend"] = [];
  const now = new Date();

  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7 + 1); // Monday
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
