"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertExamBelongsToAcademy,
  assertQuestionsBelongToAcademy,
} from "./_helpers";
import type { ActionResult } from "./_types";

// ---------------------------------------------------------------------------
// 시험 - 문제 연결 관리 (Exam <-> Question)
// ---------------------------------------------------------------------------

export async function addQuestionsToExam(
  examId: string,
  questionIds: string[],
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0-1 guard: both the target exam and every question being attached
    // must live in the caller's academy. Previously, a crafted payload
    // could graft this academy's questions onto another tenant's exam,
    // or vice-versa.
    await assertExamBelongsToAcademy(examId, staff.academyId);
    await assertQuestionsBelongToAcademy(questionIds, staff.academyId);

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
  examQuestionId: string,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Verify the examQuestion row actually belongs to an exam owned by
    // this academy. Without this, an attacker could delete any
    // ExamQuestion row they know the id of.
    const link = await prisma.examQuestion.findFirst({
      where: {
        id: examQuestionId,
        examId,
        exam: { academyId: staff.academyId },
      },
      select: { id: true },
    });
    if (!link) {
      return { success: false, error: "문제 연결을 찾을 수 없습니다." };
    }

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
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Every ExamQuestion id must belong to an exam in this academy, and
    // to the specific exam being reordered. Otherwise a payload could
    // re-number unrelated ExamQuestion rows across tenants.
    await assertExamBelongsToAcademy(examId, staff.academyId);
    if (orderedIds.length > 0) {
      const valid = await prisma.examQuestion.findMany({
        where: {
          id: { in: orderedIds },
          examId,
        },
        select: { id: true },
      });
      if (valid.length !== new Set(orderedIds).size) {
        return {
          success: false,
          error: "일부 문제 연결이 이 시험에 속하지 않습니다.",
        };
      }
    }

    const updates = orderedIds.map((id, index) =>
      prisma.examQuestion.update({
        where: { id },
        data: { orderNum: index + 1 },
      }),
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
