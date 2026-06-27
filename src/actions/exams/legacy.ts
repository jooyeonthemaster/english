"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "./_types";

// ---------------------------------------------------------------------------
// Backward-compatible stubs for old (admin) routes.
// 새로운 코드에서는 사용하지 말고 워크벤치 actions 를 활용한다.
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
  },
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Scope the exam lookup to this academy so we cannot plant a question
    // in someone else's exam (and thereby inherit their academyId).
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true, academyId: true },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };

    if (data.passageId) {
      const passage = await prisma.passage.findFirst({
        where: { id: data.passageId, academyId: staff.academyId },
        select: { id: true },
      });
      if (!passage) {
        return { success: false, error: "지문을 찾을 수 없습니다." };
      }
    }

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
  questionId: string,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Scope the question to this academy — otherwise any id leaks let
    // anyone delete any other tenant's question row.
    const question = await prisma.question.findFirst({
      where: { id: questionId, academyId: staff.academyId, deletedAt: null },
      select: { id: true },
    });
    if (!question) {
      return { success: false, error: "문제를 찾을 수 없습니다." };
    }

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
