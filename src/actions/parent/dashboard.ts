"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";
import type {
  ChildDashboard,
  ChildSummary,
  ParentDashboardData,
} from "./types";

export async function getParentDashboard(): Promise<ParentDashboardData> {
  const session = await requireParentAuth();

  const parent = await prisma.parent.findUnique({
    where: { id: session.parentId },
    include: {
      studentLinks: {
        include: {
          student: {
            include: {
              school: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!parent) throw new Error("학부모 정보를 찾을 수 없습니다.");

  const children: ChildSummary[] = parent.studentLinks.map((link) => ({
    id: link.student.id,
    name: link.student.name,
    grade: link.student.grade,
    schoolName: link.student.school?.name || null,
    status: link.student.status,
  }));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Notices query is the same for all children — fetch once
  const notices = await prisma.notice.findMany({
    where: {
      academyId: session.academyId,
      targetType: { in: ["ALL", "PARENTS"] },
      publishAt: { lte: now },
    },
    orderBy: { publishAt: "desc" },
    take: 5,
    include: {
      reads: {
        where: { readerId: session.parentId, readerType: "PARENT" },
      },
    },
  });
  const recentNotices = notices.map((n) => ({
    id: n.id,
    title: n.title,
    publishAt: n.publishAt.toISOString(),
    isRead: n.reads.length > 0,
  }));

  // Process all children in parallel — each child's queries are independent
  const childEntries = await Promise.all(
    children.map(async (child) => {
      // Phase 1: attendance, exam scores, and class enrollments are independent
      const [attendances, examSubs, studentClasses] = await Promise.all([
        // Attendance this month
        prisma.attendance.findMany({
          where: {
            studentId: child.id,
            date: { gte: startOfMonth, lte: endOfMonth },
          },
        }),
        // Average exam score (recent)
        prisma.examSubmission.findMany({
          where: {
            studentId: child.id,
            status: "GRADED",
            percent: { not: null },
          },
          orderBy: { gradedAt: "desc" },
          take: 10,
          select: { percent: true },
        }),
        // Class enrollments (needed for assignments + next exam)
        prisma.classEnrollment.findMany({
          where: { studentId: child.id, status: "ENROLLED" },
          select: { classId: true },
        }),
      ]);

      const present = attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
      const attendanceRate =
        attendances.length > 0
          ? Math.round((present / attendances.length) * 100)
          : 0;

      const averageScore =
        examSubs.length > 0
          ? Math.round(
              examSubs.reduce((sum, s) => sum + (s.percent || 0), 0) /
                examSubs.length
            )
          : 0;

      const classIds = studentClasses.map((c) => c.classId);

      // Phase 2: assignments and next exam depend on classIds — run in parallel
      const [assignments, nextExam] = await Promise.all([
        prisma.assignmentSubmission.findMany({
          where: {
            studentId: child.id,
            assignment: {
              classId: { in: classIds.length > 0 ? classIds : ["__none__"] },
            },
          },
          select: { status: true },
        }),
        prisma.exam.findFirst({
          where: {
            classId: { in: classIds.length > 0 ? classIds : ["__none__"] },
            examDate: { gte: now },
            status: { in: ["PUBLISHED", "DRAFT"] },
          },
          orderBy: { examDate: "asc" },
          select: { examDate: true, title: true },
        }),
      ]);

      const assignmentDone = assignments.filter(
        (a) => a.status === "SUBMITTED" || a.status === "GRADED"
      ).length;
      const assignmentRate =
        assignments.length > 0
          ? Math.round((assignmentDone / assignments.length) * 100)
          : 0;

      const dashboard: ChildDashboard = {
        attendanceRate,
        attendancePresent: present,
        attendanceTotal: attendances.length,
        averageScore,
        assignmentRate,
        assignmentDone,
        assignmentTotal: assignments.length,
        nextExamDate: nextExam?.examDate?.toISOString() || null,
        nextExamTitle: nextExam?.title || null,
        recentNotices,
        weeklySummary: `이번 달 출석률 ${attendanceRate}%, 평균 점수 ${averageScore}점`,
      };

      return [child.id, dashboard] as const;
    })
  );

  const childDashboards: Record<string, ChildDashboard> = {};
  for (const [childId, dashboard] of childEntries) {
    childDashboards[childId] = dashboard;
  }

  return {
    parentName: parent.name,
    children,
    childDashboards,
  };
}
