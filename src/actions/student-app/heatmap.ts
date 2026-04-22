"use server";

import { prisma } from "@/lib/prisma";
import { requireStudent } from "./_helpers";

// ---------------------------------------------------------------------------
// 4. getStudentHeatmap — Daily activity for last 90 days
// ---------------------------------------------------------------------------
export async function getStudentHeatmap() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  ninetyDaysAgo.setHours(0, 0, 0, 0);

  const progress = await prisma.studyProgress.findMany({
    where: {
      studentId,
      date: { gte: ninetyDaysAgo },
    },
    orderBy: { date: "asc" },
  });

  return progress.map((p) => ({
    date: p.date.toISOString().split("T")[0],
    vocabTests: p.vocabTests,
    questionsAnswered: p.questionsAnswered,
    studyMinutes: p.studyMinutes,
    xpEarned: p.xpEarned,
    // Activity level: 0-3
    level: Math.min(
      3,
      (p.vocabTests > 0 ? 1 : 0) +
        (p.questionsAnswered > 2 ? 1 : 0) +
        (p.studyMinutes > 30 ? 1 : 0)
    ),
  }));
}
