"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Exam Question Management
// ---------------------------------------------------------------------------

export async function addQuestionsToExam(
  examId: string,
  questionIds: string[]
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    // Get current max order
    const maxOrder = await prisma.examQuestion.findFirst({
      where: { examId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });

    let nextOrder = (maxOrder?.orderNum || 0) + 1;

    await prisma.examQuestion.createMany({
      data: questionIds.map((qId) => ({
        examId,
        questionId: qId,
        points: 1,
        orderNum: nextOrder++,
      })),
      skipDuplicates: true,
    });

    revalidatePath(`/director/exams/${examId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 추가 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function removeQuestionFromExam(
  examId: string,
  examQuestionId: string
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    await prisma.examQuestion.delete({
      where: { id: examQuestionId },
    });

    revalidatePath(`/director/exams/${examId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 제거 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function reorderExamQuestions(
  examId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  try {
    await requireStaffAuth();

    const updates = orderedIds.map((id, index) =>
      prisma.examQuestion.update({
        where: { id },
        data: { orderNum: index + 1 },
      })
    );

    await prisma.$transaction(updates);

    revalidatePath(`/director/exams/${examId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 순서 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Question Bank (for picker)
// ---------------------------------------------------------------------------

export async function getQuestionBank(
  academyId: string,
  filters?: {
    type?: string;
    difficulty?: string;
    search?: string;
  }
) {
  await requireStaffAuth();

  const where: Record<string, unknown> = { academyId };

  if (filters?.type && filters.type !== "ALL") where.type = filters.type;
  if (filters?.difficulty && filters.difficulty !== "ALL")
    where.difficulty = filters.difficulty;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  const questions = await prisma.question.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return questions;
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export async function getClassesForFilter(academyId: string) {
  await requireStaffAuth();

  const classes = await prisma.class.findMany({
    where: { academyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return classes;
}

export async function getSchoolsForFilter(academyId: string) {
  await requireStaffAuth();

  const schools = await prisma.school.findMany({
    where: { academyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return schools;
}

// ---------------------------------------------------------------------------
// Backward-compatible stubs for old (admin) routes
// ---------------------------------------------------------------------------

export async function createQuestion(
  examId: string,
  data: {
    questionNumber: number;
    questionText: string;
    correctAnswer: string;
    points?: number;
    passageId?: string;
    explanation?: { content: string; keyPoints?: string; difficulty?: string };
  }
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };

    const question = await prisma.question.create({
      data: {
        academyId: exam.academyId,
        type: "MULTIPLE_CHOICE",
        questionText: data.questionText,
        correctAnswer: data.correctAnswer,
        points: data.points ?? 1,
        passageId: data.passageId || null,
        approved: true,
      },
    });

    await prisma.examQuestion.create({
      data: {
        examId,
        questionId: question.id,
        orderNum: data.questionNumber,
        points: data.points ?? 1,
      },
    });

    if (data.explanation?.content) {
      await prisma.questionExplanation.create({
        data: {
          questionId: question.id,
          content: data.explanation.content,
          keyPoints: data.explanation.keyPoints,
          difficulty: data.explanation.difficulty,
        },
      });
    }

    revalidatePath(`/admin`);
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "생성 실패",
    };
  }
}

export async function deleteQuestion(
  questionId: string
): Promise<ActionResult> {
  try {
    await requireStaffAuth();
    await prisma.examQuestion.deleteMany({ where: { questionId } });
    await prisma.question.delete({ where: { id: questionId } });
    revalidatePath(`/admin`);
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "삭제 실패",
    };
  }
}
