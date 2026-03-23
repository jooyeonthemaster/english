"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AssignmentFilters {
  classId?: string;
  status?: string; // "ALL" | "ACTIVE" | "OVERDUE"
  search?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface AssignmentCreateData {
  title: string;
  description?: string;
  classId?: string | null;
  targetType: string; // "CLASS" | "INDIVIDUAL"
  dueDate: string;
  maxScore?: number | null;
  attachments?: string | null; // JSON array of file URLs
}

// ---------------------------------------------------------------------------
// Assignment CRUD (Teacher/Director)
// ---------------------------------------------------------------------------

export async function getAssignments(
  academyId: string,
  filters?: AssignmentFilters
) {
  await requireStaffAuth();

  const where: Record<string, unknown> = { academyId };

  if (filters?.classId) where.classId = filters.classId;
  if (filters?.search) {
    where.title = { contains: filters.search, mode: "insensitive" };
  }

  const now = new Date();
  if (filters?.status === "ACTIVE") {
    where.dueDate = { gte: now };
  } else if (filters?.status === "OVERDUE") {
    where.dueDate = { lt: now };
  }

  const assignments = await prisma.assignment.findMany({
    where,
    include: {
      class: { select: { id: true, name: true } },
      submissions: {
        select: { id: true, status: true },
      },
    },
    orderBy: { dueDate: "desc" },
  });

  // Count enrolled students per class for submission rate
  const classIds = [
    ...new Set(
      assignments.map((a) => a.classId).filter(Boolean) as string[]
    ),
  ];

  const enrollmentCounts =
    classIds.length > 0
      ? await prisma.classEnrollment.groupBy({
          by: ["classId"],
          where: { classId: { in: classIds }, status: "ENROLLED" },
          _count: true,
        })
      : [];

  const countMap = new Map(
    enrollmentCounts.map((e) => [e.classId, e._count])
  );

  return assignments.map((a) => ({
    ...a,
    totalStudents: a.classId ? countMap.get(a.classId) || 0 : 0,
    submittedCount: a.submissions.filter(
      (s) => s.status !== "PENDING"
    ).length,
    isOverdue: new Date(a.dueDate) < now,
  }));
}

export async function createAssignment(
  academyId: string,
  data: AssignmentCreateData
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    const assignment = await prisma.assignment.create({
      data: {
        academyId,
        title: data.title,
        description: data.description || null,
        classId: data.classId || null,
        targetType: data.targetType,
        dueDate: new Date(data.dueDate),
        maxScore: data.maxScore || null,
        attachments: data.attachments || null,
      },
    });

    // If targeting a class, create pending submissions for all enrolled students
    if (data.classId && data.targetType === "CLASS") {
      const enrollments = await prisma.classEnrollment.findMany({
        where: { classId: data.classId, status: "ENROLLED" },
        select: { studentId: true },
      });

      if (enrollments.length > 0) {
        await prisma.assignmentSubmission.createMany({
          data: enrollments.map((e) => ({
            assignmentId: assignment.id,
            studentId: e.studentId,
            status: "PENDING",
          })),
        });
      }
    }

    revalidatePath("/director/assignments");
    return { success: true, id: assignment.id };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "과제 생성 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function getAssignment(assignmentId: string) {
  await requireStaffAuth();

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: { select: { id: true, name: true } },
      submissions: {
        include: {
          student: {
            select: { id: true, name: true, studentCode: true },
          },
        },
        orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
      },
    },
  });

  return assignment;
}

export async function submitAssignment(
  assignmentId: string,
  studentId: string,
  data: { content?: string; attachments?: string }
): Promise<ActionResult> {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      return { success: false, error: "과제를 찾을 수 없습니다." };
    }

    const now = new Date();
    const isLate = now > new Date(assignment.dueDate);

    // Upsert submission
    await prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: { assignmentId, studentId },
      },
      update: {
        content: data.content || null,
        attachments: data.attachments || null,
        status: isLate ? "LATE" : "SUBMITTED",
        submittedAt: now,
      },
      create: {
        assignmentId,
        studentId,
        content: data.content || null,
        attachments: data.attachments || null,
        status: isLate ? "LATE" : "SUBMITTED",
        submittedAt: now,
      },
    });

    revalidatePath("/assignments");
    revalidatePath(`/director/assignments/${assignmentId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "과제 제출 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function gradeAssignment(
  submissionId: string,
  score: number,
  feedback?: string
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score,
        feedback: feedback || null,
        status: "GRADED",
        gradedAt: new Date(),
      },
    });

    revalidatePath("/director/assignments");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "채점 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function getStudentAssignments(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { academyId: true },
  });

  if (!student) return [];

  // Get student's class enrollments
  const enrollments = await prisma.classEnrollment.findMany({
    where: { studentId, status: "ENROLLED" },
    select: { classId: true },
  });

  const classIds = enrollments.map((e) => e.classId);

  const assignments = await prisma.assignment.findMany({
    where: {
      academyId: student.academyId,
      OR: [
        { classId: { in: classIds } },
        { classId: null },
      ],
    },
    include: {
      class: { select: { id: true, name: true } },
      submissions: {
        where: { studentId },
        select: {
          id: true,
          status: true,
          score: true,
          feedback: true,
          submittedAt: true,
          gradedAt: true,
        },
      },
    },
    orderBy: { dueDate: "desc" },
  });

  const now = new Date();

  return assignments.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    className: a.class?.name || "전체",
    dueDate: a.dueDate,
    maxScore: a.maxScore,
    isOverdue: new Date(a.dueDate) < now,
    submission: a.submissions[0] || null,
  }));
}
