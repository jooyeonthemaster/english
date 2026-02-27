"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ExamFilters {
  grade?: number;
  semester?: string;
  examType?: string;
  year?: number;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

interface ExamData {
  schoolId: string;
  title: string;
  grade: number;
  semester: string;
  examType: string;
  year: number;
}

interface QuestionData {
  questionNumber: number;
  questionText: string;
  correctAnswer: string;
  points: number;
  passageId?: string;
  explanation?: {
    content: string;
    keyPoints: string;
    difficulty?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("인증이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// Exam CRUD
// ---------------------------------------------------------------------------

export async function getExams(schoolId: string, filters?: ExamFilters) {
  await requireAuth();

  const where: Record<string, unknown> = { schoolId };

  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.examType) where.examType = filters.examType;
  if (filters?.year) where.year = filters.year;

  const exams = await prisma.exam.findMany({
    where,
    include: {
      _count: { select: { questions: true } },
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });

  return exams;
}

export async function getExam(examId: string) {
  await requireAuth();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      school: true,
      questions: {
        include: {
          explanation: true,
          passage: { select: { id: true, title: true } },
        },
        orderBy: { questionNumber: "asc" },
      },
    },
  });

  return exam;
}

export async function createExam(data: ExamData): Promise<ActionResult> {
  try {
    await requireAuth();

    const exam = await prisma.exam.create({
      data: {
        schoolId: data.schoolId,
        title: data.title,
        grade: data.grade,
        semester: data.semester,
        examType: data.examType,
        year: data.year,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true, id: exam.id };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateExam(
  id: string,
  data: Partial<ExamData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.exam.update({
      where: { id },
      data: {
        title: data.title,
        grade: data.grade,
        semester: data.semester,
        examType: data.examType,
        year: data.year,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteExam(id: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.exam.delete({ where: { id } });

    revalidatePath("/admin/schools");
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
// ExamQuestion CRUD
// ---------------------------------------------------------------------------

export async function createQuestion(
  examId: string,
  data: QuestionData
): Promise<ActionResult> {
  try {
    await requireAuth();

    const question = await prisma.examQuestion.create({
      data: {
        examId,
        questionNumber: data.questionNumber,
        questionText: data.questionText,
        correctAnswer: data.correctAnswer,
        points: data.points,
        passageId: data.passageId || null,
      },
    });

    if (data.explanation && data.explanation.content.trim()) {
      await prisma.questionExplanation.create({
        data: {
          questionId: question.id,
          content: data.explanation.content,
          keyPoints: data.explanation.keyPoints,
          difficulty: data.explanation.difficulty || null,
        },
      });
    }

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문항 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateQuestion(
  id: string,
  data: Partial<QuestionData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.examQuestion.update({
      where: { id },
      data: {
        questionNumber: data.questionNumber,
        questionText: data.questionText,
        correctAnswer: data.correctAnswer,
        points: data.points,
        passageId: data.passageId || null,
      },
    });

    if (data.explanation) {
      const existing = await prisma.questionExplanation.findUnique({
        where: { questionId: id },
      });

      if (existing) {
        await prisma.questionExplanation.update({
          where: { questionId: id },
          data: {
            content: data.explanation.content,
            keyPoints: data.explanation.keyPoints,
            difficulty: data.explanation.difficulty || null,
          },
        });
      } else if (data.explanation.content.trim()) {
        await prisma.questionExplanation.create({
          data: {
            questionId: id,
            content: data.explanation.content,
            keyPoints: data.explanation.keyPoints,
            difficulty: data.explanation.difficulty || null,
          },
        });
      }
    }

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문항 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.examQuestion.delete({ where: { id } });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문항 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
