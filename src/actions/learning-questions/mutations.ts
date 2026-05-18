"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth, type ActionResult } from "./_helpers";

// ---------------------------------------------------------------------------
// 학습 문제 은행 — 승인/삭제
// ---------------------------------------------------------------------------

export async function approveNaeshinQuestion(questionId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.update({
      where: { id: questionId },
      data: { approved: true },
    });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "승인 실패" };
  }
}

export async function deleteNaeshinQuestion(questionId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.delete({ where: { id: questionId } });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "삭제 실패" };
  }
}

export async function bulkApproveNaeshinQuestions(ids: string[]): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.updateMany({
      where: { id: { in: ids } },
      data: { approved: true },
    });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "승인 실패" };
  }
}

// ---------------------------------------------------------------------------
// 카테고리 단위 일괄 승인
// ---------------------------------------------------------------------------

export async function approveCategoryQuestions(
  setId: string,
  category: string
): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.updateMany({
      where: { learningSetId: setId, learningCategory: category, approved: false },
      data: { approved: true },
    });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "승인 실패" };
  }
}

export async function bulkDeleteNaeshinQuestions(ids: string[]): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.deleteMany({
      where: { id: { in: ids } },
    });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "삭제 실패" };
  }
}
