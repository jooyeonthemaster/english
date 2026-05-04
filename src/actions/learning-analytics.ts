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

  const { getMonthsAgoKST } = await import("@/lib/date-utils");
  const threeMonthsAgo = getMonthsAgoKST(3);

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
  const { getWeekStartKST } = await import("@/lib/date-utils");
  const currentWeekStart = getWeekStartKST();

  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const weekRecords = sessionRecords.filter(
      (r) => r.completedAt >= weekStart && r.completedAt < weekEnd
    );

    if (weekRecords.length > 0) {
      weeklyTrend.push({
        weekLabel: (() => {
          const KST = 9 * 60 * 60 * 1000;
          const s = new Date(weekStart.getTime() + KST);
          const e = new Date(weekEnd.getTime() + KST - 24 * 60 * 60 * 1000);
          return `${s.getUTCMonth() + 1}/${s.getUTCDate()} ~ ${e.getUTCMonth() + 1}/${e.getUTCDate()}`;
        })(),
        accuracy: avg(weekRecords.map((r) => r.score)),
        sessionsCompleted: weekRecords.length,
        xpEarned: weekRecords.reduce((s, r) => s + r.xpEarned, 0),
      });
    }
  }

  return { radarScores, passageMastery, weakPoints, weeklyTrend };
}

// ---------------------------------------------------------------------------
// 2. updateStudentAnalytics — StudentAnalytics 테이블 자동 갱신
//    호출 시점: 세션 완료, 시험 채점, 숙제 채점 후
// ---------------------------------------------------------------------------

export async function updateStudentAnalytics(studentId: string): Promise<void> {
  const { getMonthsAgoKST } = await import("@/lib/date-utils");
  const threeMonthsAgo = getMonthsAgoKST(3);

  // 모든 쿼리 병렬 실행
  const [sessionRecords, gradedExams, wrongLogs] =
    await Promise.all([
      // 학습 세션 (3개월)
      prisma.sessionRecord.findMany({
        where: { studentId, completedAt: { gte: threeMonthsAgo } },
        select: {
          vocabCorrect: true,
          vocabTotal: true,
          grammarCorrect: true,
          grammarTotal: true,
          interpretCorrect: true,
          interpretTotal: true,
          compCorrect: true,
          compTotal: true,
        },
      }),
      // 채점 완료 시험 (최근 10개)
      prisma.examSubmission.findMany({
        where: { studentId, status: "GRADED" },
        orderBy: { gradedAt: "desc" },
        take: 10,
        select: { percent: true },
      }),
      // 오답 로그 (상위 5개)
      prisma.naeshinWrongAnswerLog.findMany({
        where: { studentId },
        include: {
          question: {
            select: { learningCategory: true, subType: true },
          },
        },
        orderBy: { count: "desc" },
        take: 5,
      }),
    ]);

  // 카테고리별 정답률 집계
  let vocabC = 0, vocabT = 0;
  let gramC = 0, gramT = 0;
  let interpC = 0, interpT = 0;
  let compC = 0, compT = 0;

  for (const r of sessionRecords) {
    vocabC += r.vocabCorrect;
    vocabT += r.vocabTotal;
    gramC += r.grammarCorrect;
    gramT += r.grammarTotal;
    interpC += r.interpretCorrect;
    interpT += r.interpretTotal;
    compC += r.compCorrect;
    compT += r.compTotal;
  }

  const pctSafe = (c: number, t: number) =>
    t > 0 ? Math.round((c / t) * 100) : 0;
  const avgArr = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

  // 세션 기반 점수
  const vocabScore = pctSafe(vocabC, vocabT);
  const grammarScore = pctSafe(gramC, gramT);
  const readingScore = pctSafe(interpC, interpT);
  const compScore = pctSafe(compC, compT);

  // 시험 평균 → writingScore 프록시
  const examAvg = avgArr(
    gradedExams.map((e) => e.percent ?? 0)
  );
  const writingScore = examAvg;

  // 종합 점수 (가중 평균)
  const overall = Math.round(
    vocabScore * 0.2 +
      grammarScore * 0.25 +
      readingScore * 0.25 +
      writingScore * 0.15 +
      compScore * 0.15
  );

  // 레벨 결정
  const level =
    overall >= 90
      ? "S"
      : overall >= 80
        ? "A"
        : overall >= 70
          ? "B"
          : overall >= 60
            ? "C"
            : "D";

  // 약점 추출
  const weakPointsList = wrongLogs
    .filter((w) => w.question?.learningCategory)
    .map(
      (w) =>
        `${w.question?.learningCategory ?? ""}: ${w.question?.subType ?? ""}`
    );

  // Upsert
  await prisma.studentAnalytics.upsert({
    where: { studentId },
    create: {
      studentId,
      overallScore: overall,
      grammarScore,
      vocabScore,
      readingScore,
      writingScore,
      listeningScore: compScore,
      level,
      weakPoints: JSON.stringify(weakPointsList),
      grammarDetail: "{}",
    },
    update: {
      overallScore: overall,
      grammarScore,
      vocabScore,
      readingScore,
      writingScore,
      listeningScore: compScore,
      level,
      weakPoints: JSON.stringify(weakPointsList),
    },
  });
}
