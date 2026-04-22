"use server";

import { prisma } from "@/lib/prisma";
import { requireStudent } from "./_helpers";

// ---------------------------------------------------------------------------
// 17. getStudentAssignmentList — 학생 숙제 목록 (상태별)
// ---------------------------------------------------------------------------
export async function getStudentAssignmentList() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      academyId: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
      },
    },
  });

  if (!student) return [];

  const classIds = student.classEnrollments.map((e) => e.classId);

  const assignments = await prisma.assignment.findMany({
    where: {
      academyId: student.academyId,
      OR: [
        { classId: { in: classIds } },
        { classId: null },
      ],
    },
    include: {
      class: { select: { name: true } },
      submissions: {
        where: { studentId },
        select: {
          id: true,
          status: true,
          score: true,
          feedback: true,
          submittedAt: true,
        },
      },
    },
    orderBy: { dueDate: "desc" },
    take: 30,
  });

  const now = new Date();
  return assignments.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    className: a.class?.name ?? "전체",
    dueDate: a.dueDate.toISOString(),
    maxScore: a.maxScore,
    isOverdue: a.dueDate < now,
    submission: a.submissions[0]
      ? {
          status: a.submissions[0].status,
          score: a.submissions[0].score,
          feedback: a.submissions[0].feedback,
          submittedAt: a.submissions[0].submittedAt?.toISOString() ?? null,
        }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// 18. getStudentEnrollments — 수강 중인 반 목록
// ---------------------------------------------------------------------------
export async function getStudentEnrollments() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const enrollments = await prisma.classEnrollment.findMany({
    where: { studentId },
    include: {
      class: {
        include: {
          teacher: { select: { name: true } },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  return enrollments.map((e) => ({
    id: e.id,
    classId: e.class.id,
    className: e.class.name,
    teacherName: e.class.teacher?.name ?? null,
    schedule: e.class.schedule,
    status: e.status,
    enrolledAt: e.enrolledAt.toISOString(),
  }));
}
