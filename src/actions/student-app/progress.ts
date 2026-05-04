"use server";

import { prisma } from "@/lib/prisma";
import { requireStudent, xpForLevel } from "./_helpers";

// ---------------------------------------------------------------------------
// 11. getStudentProgress — Score trends
// ---------------------------------------------------------------------------
export async function getStudentProgress() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [vocabResults, examResults, dailyProgress] = await Promise.all([
    prisma.vocabTestResult.findMany({
      where: { studentId, takenAt: { gte: threeMonthsAgo } },
      include: { list: true },
      orderBy: { takenAt: "asc" },
    }),
    prisma.examSubmission.findMany({
      where: {
        studentId,
        status: "GRADED",
        submittedAt: { gte: threeMonthsAgo },
      },
      include: { exam: true },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.studyProgress.findMany({
      where: { studentId, date: { gte: threeMonthsAgo } },
      orderBy: { date: "asc" },
    }),
  ]);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { level: true, xp: true },
  });

  return {
    vocabTrend: vocabResults.map((r) => ({
      date: r.takenAt.toISOString().split("T")[0],
      title: r.list.title,
      percent: r.percent,
    })),
    examTrend: examResults.map((s) => ({
      date: (s.submittedAt ?? s.startedAt).toISOString().split("T")[0],
      title: s.exam.title,
      percent: s.percent ?? 0,
    })),
    dailyStudy: dailyProgress.map((p) => ({
      date: p.date.toISOString().split("T")[0],
      minutes: p.studyMinutes,
      vocabTests: p.vocabTests,
      xp: p.xpEarned,
    })),
    currentLevel: student?.level ?? 1,
    currentXp: student?.xp ?? 0,
    xpForNextLevel: xpForLevel(student?.level ?? 1),
  };
}
