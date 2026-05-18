"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";
import type { ChildGradesData } from "./types";

export async function getChildGrades(
  studentId: string
): Promise<ChildGradesData> {
  const session = await requireParentAuth();
  if (!session.studentIds.includes(studentId)) {
    throw new Error("접근 권한이 없습니다.");
  }

  // All 3 queries are independent — run in parallel
  const [examSubs, vocabResults, analytics] = await Promise.all([
    // Recent exam submissions
    prisma.examSubmission.findMany({
      where: { studentId, status: "GRADED" },
      include: {
        exam: {
          select: {
            title: true,
            examDate: true,
            classId: true,
            submissions: {
              where: { status: "GRADED" },
              select: { percent: true },
            },
          },
        },
      },
      orderBy: { gradedAt: "desc" },
      take: 20,
    }),
    // Vocab test results
    prisma.vocabTestResult.findMany({
      where: { studentId },
      include: { list: { select: { title: true } } },
      orderBy: { takenAt: "desc" },
      take: 20,
    }),
    // Category scores from analytics
    prisma.studentAnalytics.findUnique({
      where: { studentId },
    }),
  ]);

  const recentExams = examSubs.map((sub) => {
    const allScores = sub.exam.submissions
      .map((s) => s.percent || 0)
      .sort((a, b) => b - a);
    const myRank = allScores.indexOf(sub.percent || 0) + 1;

    return {
      id: sub.id,
      examTitle: sub.exam.title,
      examDate: sub.exam.examDate?.toISOString() || null,
      score: sub.score || 0,
      maxScore: sub.maxScore || 100,
      percent: Math.round(sub.percent || 0),
      rank: allScores.length > 1 ? myRank : null,
      totalStudents: allScores.length > 1 ? allScores.length : null,
    };
  });

  // Score trend (last 6 exams, chronological order)
  const trendExams = [...examSubs].reverse().slice(-6);
  const scoreTrend = trendExams.map((sub, i) => ({
    label: sub.exam.title.length > 8 ? sub.exam.title.slice(0, 8) : sub.exam.title,
    score: Math.round(sub.percent || 0),
  }));

  const vocabTests = vocabResults.map((v) => ({
    id: v.id,
    listTitle: v.list.title,
    testType: v.testType,
    score: v.score,
    total: v.total,
    percent: Math.round(v.percent),
    takenAt: v.takenAt.toISOString(),
  }));

  const categoryScores = analytics
    ? [
        { category: "문법", score: Math.round(analytics.grammarScore) },
        { category: "어휘", score: Math.round(analytics.vocabScore) },
        { category: "독해", score: Math.round(analytics.readingScore) },
        { category: "작문", score: Math.round(analytics.writingScore) },
      ]
    : [
        { category: "문법", score: 0 },
        { category: "어휘", score: 0 },
        { category: "독해", score: 0 },
        { category: "작문", score: 0 },
      ];

  // Weak areas
  const weakAreas: string[] = [];
  if (analytics?.weakPoints) {
    try {
      const parsed = JSON.parse(analytics.weakPoints);
      if (Array.isArray(parsed)) {
        weakAreas.push(...parsed.slice(0, 3));
      }
    } catch {
      // ignore parse errors
    }
  }
  if (weakAreas.length === 0) {
    // Derive from category scores
    const sorted = [...categoryScores].sort((a, b) => a.score - b.score);
    weakAreas.push(
      ...sorted.slice(0, 2).map((c) => `${c.category} 영역 보완 필요`)
    );
  }

  return {
    recentExams,
    scoreTrend,
    vocabTests,
    categoryScores,
    weakAreas,
  };
}
