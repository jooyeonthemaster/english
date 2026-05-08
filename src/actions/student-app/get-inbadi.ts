"use server";

import { prisma } from "@/lib/prisma";
import { requireStudent, xpForLevel } from "./_helpers";

// ---------------------------------------------------------------------------
// 2. getStudentInbadi — Full 영어 인바디 analytics
// ---------------------------------------------------------------------------
export async function getStudentInbadi() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: true,
      studentAnalytics: true,
    },
  });

  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  const analytics = student.studentAnalytics;

  // Parse grammar detail
  let grammarDetail: Record<string, number> = {};
  if (analytics?.grammarDetail) {
    try {
      grammarDetail = JSON.parse(analytics.grammarDetail);
    } catch {
      grammarDetail = {};
    }
  }

  // Parse weak points
  let weakPoints: string[] = [];
  if (analytics?.weakPoints) {
    try {
      weakPoints = JSON.parse(analytics.weakPoints);
    } catch {
      weakPoints = [];
    }
  }

  // Both queries are independent — run in parallel
  const [recentTests, recentExams, assignmentGrades] = await Promise.all([
    // Recent test history
    prisma.vocabTestResult.findMany({
      where: { studentId },
      include: { list: true },
      orderBy: { takenAt: "desc" },
      take: 10,
    }),
    // Exam submissions
    prisma.examSubmission.findMany({
      where: { studentId, status: "GRADED" },
      include: { exam: true },
      orderBy: { submittedAt: "desc" },
      take: 10,
    }),
    prisma.assignmentSubmission.findMany({
      where: {
        studentId,
        status: "GRADED",
        score: { not: null },
      },
      include: {
        assignment: {
          select: {
            title: true,
            maxScore: true,
            class: { select: { name: true } },
          },
        },
      },
      orderBy: [{ gradedAt: "desc" }, { submittedAt: "desc" }],
      take: 10,
    }),
  ]);

  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      level: student.level,
      xp: student.xp,
      xpForNextLevel: xpForLevel(student.level),
      streak: student.streak,
      schoolName: student.school?.name ?? null,
    },
    analytics: {
      overallScore: analytics?.overallScore ?? 0,
      grammarScore: analytics?.grammarScore ?? 0,
      vocabScore: analytics?.vocabScore ?? 0,
      readingScore: analytics?.readingScore ?? 0,
      writingScore: analytics?.writingScore ?? 0,
      listeningScore: analytics?.listeningScore ?? 0,
      level: analytics?.level ?? "D",
      grammarDetail,
      weakPoints,
    },
    recentTests: recentTests.map((r) => ({
      id: r.id,
      title: r.list.title,
      testType: r.testType,
      score: r.score,
      total: r.total,
      percent: r.percent,
      date: r.takenAt.toISOString(),
    })),
    recentExams: recentExams.map((s) => ({
      id: s.id,
      title: s.exam.title,
      score: s.score ?? 0,
      maxScore: s.maxScore ?? 100,
      percent: s.percent ?? 0,
      date: s.submittedAt?.toISOString() ?? s.startedAt.toISOString(),
    })),
    assignmentGrades: assignmentGrades.map((s) => ({
      id: s.id,
      title: s.assignment.title,
      className: s.assignment.class?.name ?? "",
      score: s.score ?? 0,
      maxScore: s.assignment.maxScore ?? 100,
      feedback: s.feedback,
      date: s.gradedAt?.toISOString() ?? s.submittedAt?.toISOString() ?? s.createdAt.toISOString(),
    })),
  };
}
