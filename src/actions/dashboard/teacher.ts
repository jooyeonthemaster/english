"use server";

import { prisma } from "@/lib/prisma";
import { getTodaySchedule, getClassStatus } from "./_helpers";
import type {
  TeacherKPIData,
  TeacherClassItem,
  RecentExamResult,
  PendingAssignmentItem,
} from "./types";

// ============================================================================
// Teacher Dashboard Actions
// ============================================================================

export async function getTeacherKPIs(
  academyId: string,
  staffId: string
): Promise<TeacherKPIData> {
  try {
    // My classes (all active)
    const myClasses = await prisma.class.findMany({
      where: { academyId, teacherId: staffId, isActive: true },
      include: {
        enrollments: { where: { status: "ENROLLED" }, select: { id: true } },
      },
    });

    // Count today's classes
    let myClassesToday = 0;
    for (const cls of myClasses) {
      const slot = getTodaySchedule(cls.schedule);
      if (slot) myClassesToday++;
    }

    // Total students across my classes
    const myStudents = myClasses.reduce((sum, cls) => sum + cls.enrollments.length, 0);

    // Ungraded exams: submissions with status SUBMITTED (not yet GRADED)
    const myClassIds = myClasses.map((c) => c.id);

    // Both count queries depend on myClassIds but are independent of each other
    const now = new Date();
    const [ungradedExams, missingAssignments] = await Promise.all([
      prisma.examSubmission.count({
        where: {
          status: "SUBMITTED",
          exam: {
            academyId,
            classId: { in: myClassIds.length > 0 ? myClassIds : ["__none__"] },
          },
        },
      }),
      // Missing assignments: submissions not yet submitted past due date
      prisma.assignmentSubmission.count({
        where: {
          status: "PENDING",
          assignment: {
            academyId,
            classId: { in: myClassIds.length > 0 ? myClassIds : ["__none__"] },
            dueDate: { lt: now },
          },
        },
      }),
    ]);

    return {
      myClassesToday,
      ungradedExams,
      missingAssignments,
      myStudents,
    };
  } catch (error) {
    console.error("getTeacherKPIs error:", error);
    return {
      myClassesToday: 0,
      ungradedExams: 0,
      missingAssignments: 0,
      myStudents: 0,
    };
  }
}

export async function getTeacherTodayClasses(
  academyId: string,
  staffId: string
): Promise<TeacherClassItem[]> {
  try {
    const { getTodayRangeKST } = require("@/lib/date-utils");
    const { today: todayStart, tomorrow: todayEnd } = getTodayRangeKST();

    const classes = await prisma.class.findMany({
      where: { academyId, teacherId: staffId, isActive: true },
      include: {
        enrollments: { where: { status: "ENROLLED" }, select: { studentId: true } },
        attendances: {
          where: {
            date: { gte: todayStart, lt: todayEnd },
            status: { in: ["PRESENT", "LATE"] },
          },
          select: { id: true },
        },
      },
    });

    const result: TeacherClassItem[] = [];

    for (const cls of classes) {
      const slot = getTodaySchedule(cls.schedule);
      if (!slot) continue;

      result.push({
        id: cls.id,
        name: cls.name,
        time: `${slot.startTime} - ${slot.endTime}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: cls.room,
        studentCount: cls.enrollments.length,
        attendedCount: cls.attendances.length,
        status: getClassStatus(slot.startTime, slot.endTime),
      });
    }

    result.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return result;
  } catch (error) {
    console.error("getTeacherTodayClasses error:", error);
    return [];
  }
}

export async function getTeacherRecentExams(
  academyId: string,
  staffId: string
): Promise<RecentExamResult[]> {
  try {
    const myClassIds = (
      await prisma.class.findMany({
        where: { academyId, teacherId: staffId, isActive: true },
        select: { id: true },
      })
    ).map((c) => c.id);

    if (myClassIds.length === 0) return [];

    const exams = await prisma.exam.findMany({
      where: {
        academyId,
        classId: { in: myClassIds },
        status: { in: ["COMPLETED", "IN_PROGRESS", "PUBLISHED"] },
      },
      include: {
        class: { select: { name: true, enrollments: { where: { status: "ENROLLED" }, select: { id: true } } } },
        submissions: {
          where: { status: "GRADED" },
          select: { score: true, maxScore: true },
        },
      },
      orderBy: { examDate: "desc" },
      take: 5,
    });

    return exams.map((exam) => {
      const scores = exam.submissions
        .filter((s) => s.score !== null && s.maxScore !== null)
        .map((s) => ((s.score! / s.maxScore!) * 100));
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

      return {
        id: exam.id,
        examTitle: exam.title,
        className: exam.class?.name || null,
        avgScore,
        submissionCount: exam.submissions.length,
        totalStudents: exam.class?.enrollments.length || 0,
        date: (exam.examDate || exam.createdAt).toISOString(),
      };
    });
  } catch (error) {
    console.error("getTeacherRecentExams error:", error);
    return [];
  }
}

export async function getTeacherPendingAssignments(
  academyId: string,
  staffId: string
): Promise<PendingAssignmentItem[]> {
  try {
    const myClassIds = (
      await prisma.class.findMany({
        where: { academyId, teacherId: staffId, isActive: true },
        select: { id: true },
      })
    ).map((c) => c.id);

    if (myClassIds.length === 0) return [];

    const assignments = await prisma.assignment.findMany({
      where: {
        academyId,
        classId: { in: myClassIds },
      },
      include: {
        class: {
          select: {
            name: true,
            enrollments: { where: { status: "ENROLLED" }, select: { id: true } },
          },
        },
        submissions: {
          where: { status: { in: ["SUBMITTED", "GRADED"] } },
          select: { id: true },
        },
      },
      orderBy: { dueDate: "desc" },
      take: 5,
    });

    return assignments.map((a) => ({
      id: a.id,
      title: a.title,
      className: a.class?.name || null,
      dueDate: a.dueDate.toISOString(),
      submittedCount: a.submissions.length,
      totalStudents: a.class?.enrollments.length || 0,
    }));
  } catch (error) {
    console.error("getTeacherPendingAssignments error:", error);
    return [];
  }
}
