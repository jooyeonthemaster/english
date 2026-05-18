"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function generateWeeklyReport(studentId: string) {
  const staff = await requireStaffAuth();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: { select: { name: true } },
      parentLinks: { include: { parent: true } },
      academy: { select: { name: true, logoUrl: true } },
    },
  });

  if (!student) throw new Error("학생을 찾을 수 없습니다.");

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // All 5 data-gathering queries are independent — run in parallel
  const [attendances, examSubs, allExamSubs, analytics, vocabResults] =
    await Promise.all([
      // Attendance this week
      prisma.attendance.findMany({
        where: { studentId, date: { gte: weekAgo, lte: now } },
      }),
      // Exams graded this week
      prisma.examSubmission.findMany({
        where: {
          studentId,
          status: "GRADED",
          gradedAt: { gte: weekAgo },
        },
        include: { exam: { select: { title: true, examDate: true } } },
      }),
      // Score trend (last 6 exams)
      prisma.examSubmission.findMany({
        where: { studentId, status: "GRADED" },
        include: { exam: { select: { title: true } } },
        orderBy: { gradedAt: "desc" },
        take: 6,
      }),
      // Category scores from analytics
      prisma.studentAnalytics.findUnique({
        where: { studentId },
      }),
      // Vocab summary this week
      prisma.vocabTestResult.findMany({
        where: { studentId, takenAt: { gte: weekAgo } },
      }),
    ]);

  const present = attendances.filter((a) => a.status === "PRESENT").length;
  const late = attendances.filter((a) => a.status === "LATE").length;
  const absent = attendances.filter((a) => a.status === "ABSENT").length;
  const attendanceRate =
    attendances.length > 0
      ? Math.round(((present + late) / attendances.length) * 100)
      : 0;

  const exams = examSubs.map((s) => ({
    title: s.exam.title,
    date: (s.exam.examDate || s.gradedAt)?.toISOString() || "",
    score: s.score || 0,
    maxScore: s.maxScore || 100,
    percent: Math.round(s.percent || 0),
  }));

  const scoreTrend = allExamSubs
    .reverse()
    .map((s) => ({
      label:
        s.exam.title.length > 6 ? s.exam.title.slice(0, 6) : s.exam.title,
      score: Math.round(s.percent || 0),
    }));

  const categoryScores = analytics
    ? [
        { category: "문법", score: Math.round(analytics.grammarScore) },
        { category: "어휘", score: Math.round(analytics.vocabScore) },
        { category: "독해", score: Math.round(analytics.readingScore) },
        { category: "작문", score: Math.round(analytics.writingScore) },
      ]
    : [];
  const vocabAvg =
    vocabResults.length > 0
      ? Math.round(
          vocabResults.reduce((sum, v) => sum + v.percent, 0) /
            vocabResults.length
        )
      : 0;

  // Weak points from analytics
  let weaknesses: string[] = [];
  let strengths: string[] = [];

  if (analytics?.weakPoints) {
    try {
      weaknesses = JSON.parse(analytics.weakPoints);
    } catch {
      // ignore
    }
  }

  // Derive strengths from high category scores
  if (categoryScores.length > 0) {
    strengths = categoryScores
      .filter((c) => c.score >= 70)
      .map((c) => `${c.category} 영역 우수`);
    if (weaknesses.length === 0) {
      weaknesses = categoryScores
        .filter((c) => c.score < 60)
        .map((c) => `${c.category} 영역 보완 필요`);
    }
  }

  // Recommendations
  const recommendations: string[] = [];
  if (attendanceRate < 80) {
    recommendations.push("출석률 향상이 필요합니다. 정시 등원을 권장합니다.");
  }
  if (vocabAvg < 70) {
    recommendations.push("단어 학습 복습을 통해 어휘력 강화가 필요합니다.");
  }
  if (weaknesses.length > 0) {
    recommendations.push(
      `${weaknesses[0]}에 대한 추가 학습을 추천합니다.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push("전반적으로 양호합니다. 현재 학습 페이스를 유지하세요.");
  }

  const reportData = {
    period: `${weekAgo.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`,
    attendance: {
      present,
      absent,
      late,
      total: attendances.length,
      rate: attendanceRate,
    },
    exams,
    scoreTrend,
    categoryScores,
    vocabSummary: {
      testsCompleted: vocabResults.length,
      averageScore: vocabAvg,
      totalWords: vocabResults.reduce((sum, v) => sum + v.total, 0),
    },
    strengths,
    weaknesses,
    teacherComment: null,
    recommendations,
  };

  // Create reports for all linked parents in parallel
  const parentLinks = student.parentLinks;
  let reports;

  if (parentLinks.length > 0) {
    reports = await Promise.all(
      parentLinks.map((link) =>
        prisma.parentReport.create({
          data: {
            studentId,
            parentId: link.parentId,
            type: "WEEKLY",
            reportData: JSON.stringify(reportData),
            status: "DRAFT",
          },
        })
      )
    );
  } else {
    // If no parent links, still create report without parent
    const report = await prisma.parentReport.create({
      data: {
        studentId,
        type: "WEEKLY",
        reportData: JSON.stringify(reportData),
        status: "DRAFT",
      },
    });
    reports = [report];
  }

  revalidatePath("/director/reports");
  return { success: true, count: reports.length };
}
