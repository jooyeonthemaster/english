"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ExamFilters {
  type?: string;
  status?: string;
  classId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface ExamCreateData {
  title: string;
  type: string; // "OFFLINE" | "ONLINE" | "VOCAB" | "MOCK"
  classId?: string | null;
  schoolId?: string | null;
  grade?: number | null;
  semester?: string | null;
  examType?: string | null;
  examDate?: string | null;
  duration?: number | null;
  totalPoints: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResults?: boolean;
  questions?: ExamQuestionInput[];
}

export interface ExamQuestionInput {
  questionId: string;
  points: number;
  orderNum: number;
}

// ---------------------------------------------------------------------------
// Exam CRUD
// ---------------------------------------------------------------------------

export async function getExams(academyId: string, filters?: ExamFilters) {
  await requireStaffAuth();

  const where: Record<string, unknown> = { academyId };

  if (filters?.type && filters.type !== "ALL") where.type = filters.type;
  if (filters?.status && filters.status !== "ALL")
    where.status = filters.status;
  if (filters?.classId) where.classId = filters.classId;
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
  await requireStaffAuth();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      questions: {
        include: {
          question: {
            include: {
              explanation: true,
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
  data: ExamCreateData
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    const exam = await prisma.exam.create({
      data: {
        academyId,
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

    // Add questions if provided
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
  data: Partial<ExamCreateData>
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

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
    await requireStaffAuth();

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam.status !== "DRAFT") {
      return {
        success: false,
        error: "초안 상태의 시험만 삭제할 수 있습니다.",
      };
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

// ---------------------------------------------------------------------------
// Publish (with offline submission auto-creation)
// ---------------------------------------------------------------------------

export async function publishExam(examId: string): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { questions: true } } },
    });

    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam._count.questions === 0) {
      return {
        success: false,
        error: "문제가 없는 시험은 배포할 수 없습니다.",
      };
    }

    await prisma.exam.update({
      where: { id: examId },
      data: { status: "PUBLISHED" },
    });

    // OFFLINE 시험: 반 학생 전원에 submission 자동 생성
    if (exam.type === "OFFLINE" && exam.classId) {
      const enrollments = await prisma.classEnrollment.findMany({
        where: { classId: exam.classId, status: "ENROLLED" },
        select: { studentId: true },
      });

      if (enrollments.length > 0) {
        await prisma.examSubmission.createMany({
          data: enrollments.map((e) => ({
            examId,
            studentId: e.studentId,
            answers: "{}",
            status: "SUBMITTED",
            submittedAt: new Date(),
          })),
          skipDuplicates: true,
        });
      }
    }

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
