"use server";

import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { requireAuth } from "./_helpers";

/** Get comprehensive student stats */
export async function getStudentStats(studentId: string) {
  await requireAuth();
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    attendances,
    totalAttendances,
    examSubmissions,
    invoices,
    consultations,
    student,
  ] = await Promise.all([
    // Recent attendance (30 days)
    prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: "desc" },
    }),
    // Total attendance count
    prisma.attendance.count({
      where: { studentId },
    }),
    // Exam submissions with scores
    showResults
      ? prisma.examSubmission.findMany({
          where: { studentId },
          include: {
            exam: { select: { title: true, grade: true, examType: true } },
          },
          orderBy: { submittedAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    // Invoices
    prisma.invoice.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { dueDate: "desc" },
      take: 10,
    }),
    // Consultations
    prisma.consultation.findMany({
      where: { studentId },
      include: {
        staff: { select: { name: true } },
      },
      orderBy: { date: "desc" },
      take: 10,
    }),
    // Student XP/level
    prisma.student.findUnique({
      where: { id: studentId },
      select: { xp: true, level: true, streak: true },
    }),
  ]);

  // Calculate attendance rate
  const presentCount = attendances.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;
  const attendanceRate =
    attendances.length > 0
      ? Math.round((presentCount / attendances.length) * 100)
      : 0;

  // Calculate average exam score
  const scoredExams = showResults
    ? examSubmissions.filter((e) => e.score !== null)
    : [];
  const averageScore =
    scoredExams.length > 0
      ? Math.round(
          scoredExams.reduce((sum, e) => sum + (e.score ?? 0), 0) /
            scoredExams.length
        )
      : 0;

  return {
    attendanceRate,
    totalAttendances,
    recentAttendances: attendances,
    averageScore,
    examSubmissions,
    invoices,
    consultations,
    xp: student?.xp ?? 0,
    level: student?.level ?? 1,
    streak: student?.streak ?? 0,
  };
}
