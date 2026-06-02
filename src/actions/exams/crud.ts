"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertClassBelongsToAcademy,
  assertExamBelongsToAcademy,
  assertQuestionsBelongToAcademy,
} from "./_helpers";
import type {
  ActionResult,
  ExamCreateData,
  ExamFilters,
} from "./_types";

// ---------------------------------------------------------------------------
// Exam CRUD
// ---------------------------------------------------------------------------

export async function getExams(academyId: string, filters?: ExamFilters) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const where: Record<string, unknown> = { academyId };

  if (filters?.type && filters.type !== "ALL") where.type = filters.type;
  if (filters?.status && filters.status !== "ALL") where.status = filters.status;
  if (filters?.classId) where.classId = filters.classId;
  if (filters?.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters?.search) {
    where.title = { contains: filters.search, mode: "insensitive" };
  }
  if (filters?.dateFrom || filters?.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters?.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters?.dateTo) dateFilter.lte = new Date(filters.dateTo);
    where.examDate = dateFilter;
  }

  const exams = await prisma.exam.findMany({
    where,
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      _count: { select: { questions: true, submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return exams;
}

export async function getExam(examId: string) {
  const staff = await requireStaffAuth();

  // Scope lookup to the caller's academy so a manipulated examId can't
  // read another tenant's exam (including its full question bodies).
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: staff.academyId },
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      questions: {
        include: {
          question: {
            include: {
              passage: {
                select: {
                  id: true,
                  title: true,
                  content: true,
                  grade: true,
                  semester: true,
                  publisher: true,
                  school: { select: { id: true, name: true } },
                },
              },
              explanation: true,
              collectionItems: {
                select: { collectionId: true },
              },
              _count: { select: { examLinks: true } },
            },
          },
        },
        orderBy: { orderNum: "asc" },
      },
      submissions: {
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
        },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  return exam;
}

export async function createExam(
  academyId: string,
  data: ExamCreateData,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0 guard: caller must not be able to forge the academyId argument.
    // The session's academyId is the source of truth.
    if (staff.academyId !== academyId) {
      return { success: false, error: "학원 정보가 일치하지 않습니다." };
    }

    // If caller passed a classId, verify it belongs to this academy.
    if (data.classId) {
      await assertClassBelongsToAcademy(data.classId, staff.academyId);
    }

    // If caller pre-populated questions, each questionId must be owned
    // by this academy — otherwise we'd let them attach another tenant's
    // question rows to our new exam.
    if (data.questions && data.questions.length > 0) {
      await assertQuestionsBelongToAcademy(
        data.questions.map((q) => q.questionId),
        staff.academyId,
      );
    }

    const exam = await prisma.exam.create({
      data: {
        academyId: staff.academyId,
        title: data.title,
        type: data.type,
        classId: data.classId || null,
        schoolId: data.schoolId || null,
        grade: data.grade || null,
        semester: data.semester || null,
        examType: data.examType || null,
        examDate: data.examDate ? new Date(data.examDate) : null,
        duration: data.duration || null,
        totalPoints: data.totalPoints,
        shuffleQuestions: data.shuffleQuestions || false,
        shuffleOptions: data.shuffleOptions || false,
        showResults: data.showResults ?? true,
        status: "DRAFT",
      },
    });

    if (data.questions && data.questions.length > 0) {
      await prisma.examQuestion.createMany({
        data: data.questions.map((q) => ({
          examId: exam.id,
          questionId: q.questionId,
          points: q.points,
          orderNum: q.orderNum,
        })),
      });
    }

    revalidatePath("/director/exams");
    return { success: true, id: exam.id };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 생성 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateExam(
  examId: string,
  data: Partial<ExamCreateData>,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0 guard: the exam must belong to the caller's academy before any
    // update touches its row. Without this, any staff of any academy
    // could overwrite this exam.
    await assertExamBelongsToAcademy(examId, staff.academyId);

    if (data.classId) {
      await assertClassBelongsToAcademy(data.classId, staff.academyId);
    }

    await prisma.exam.update({
      where: { id: examId },
      data: {
        title: data.title,
        type: data.type,
        classId: data.classId,
        schoolId: data.schoolId,
        grade: data.grade,
        semester: data.semester,
        examType: data.examType,
        examDate: data.examDate ? new Date(data.examDate) : undefined,
        duration: data.duration,
        totalPoints: data.totalPoints,
        shuffleQuestions: data.shuffleQuestions,
        shuffleOptions: data.shuffleOptions,
        showResults: data.showResults,
      },
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteExam(examId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Scope the existence check to the caller's academy. Previously we
    // did findUnique(id) which would happily return a cross-tenant exam
    // and then delete it.
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true, status: true },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam.status !== "DRAFT") {
      return { success: false, error: "초안 상태의 시험만 삭제할 수 있습니다." };
    }

    await prisma.exam.delete({ where: { id: examId } });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// Bulk delete: scoped to caller's academy, only DRAFT exams. Returns counts so
// the UI can communicate how many were actually removed (vs cross-tenant or
// non-DRAFT ids that were silently skipped).
export async function bulkDeleteExams(examIds: string[]): Promise<{
  success: boolean;
  requested: number;
  deleted: number;
  skippedNonDraft: number;
  error?: string;
}> {
  try {
    const staff = await requireStaffAuth();
    if (examIds.length === 0) {
      return {
        success: true,
        requested: 0,
        deleted: 0,
        skippedNonDraft: 0,
      };
    }

    // Pre-filter to DRAFT exams owned by this academy so we can report a
    // skipped count for non-DRAFT items the user picked.
    const eligible = await prisma.exam.findMany({
      where: {
        id: { in: examIds },
        academyId: staff.academyId,
        status: "DRAFT",
      },
      select: { id: true },
    });
    const eligibleIds = eligible.map((e) => e.id);

    const result = eligibleIds.length
      ? await prisma.exam.deleteMany({
          where: { id: { in: eligibleIds }, academyId: staff.academyId },
        })
      : { count: 0 };

    revalidatePath("/director/exams");
    return {
      success: true,
      requested: examIds.length,
      deleted: result.count,
      skippedNonDraft: examIds.length - eligibleIds.length,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 삭제 중 오류가 발생했습니다.";
    return {
      success: false,
      requested: examIds.length,
      deleted: 0,
      skippedNonDraft: 0,
      error: message,
    };
  }
}

export async function publishExam(examId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      include: { _count: { select: { questions: true } } },
    });

    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam._count.questions === 0) {
      return { success: false, error: "문제가 없는 시험은 배포할 수 없습니다." };
    }

    await prisma.exam.update({
      where: { id: examId },
      data: { status: "PUBLISHED" },
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 배포 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/**
 * incrementExamPrintCount — PDF 인쇄(window.print) 시 인쇄 횟수를 +1 한다.
 * HWPX/DOCX 내보내기는 각 export 라우트에서 직접 증가시키므로, 이 액션은
 * 클라이언트에서만 일어나는 브라우저 인쇄를 집계하기 위한 보완 경로다.
 */
export async function incrementExamPrintCount(examId: string) {
  try {
    const staff = await requireStaffAuth();
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!exam) return { success: false as const, error: "시험을 찾을 수 없습니다." };

    await prisma.exam.update({
      where: { id: examId },
      data: { printCount: { increment: 1 } },
    });

    revalidatePath("/director/exams");
    revalidatePath("/director/workbench/exams");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "인쇄 집계 중 오류가 발생했습니다.";
    return { success: false as const, error: message };
  }
}
