"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAcademyId, requireAuth } from "./_helpers";
import type { ActionResult } from "./_types";

export interface QuestionDraftListItem {
  id: string;
  jobId: string;
  passageDraftId: string | null;
  questionOrder: number;
  questionNumber: number | null;
  sourcePageIndex: number[];
  stem: string;
  choices: unknown;
  answer: string | null;
  explanation: string | null;
  questionType: string | null;
  confidence: number | null;
  warnings: unknown;
  reviewStatus: string;
  createdAt: string;
  passageDraft: {
    id: string;
    passageOrder: number;
    restoredText: string | null;
    teacherText: string | null;
    problemText: string;
    restorationStatus: string;
    verificationStatus: string;
  } | null;
  job: {
    id: string;
    mode: string;
    originalFileName: string | null;
    sourceMaterialId: string | null;
    createdAt: string;
  };
}

export interface QuestionDraftUpdateInput {
  stem: string;
  choices: unknown;
  answer: string;
  explanation: string;
  questionType?: string | null;
}

export async function getPendingQuestionDrafts(): Promise<
  QuestionDraftListItem[]
> {
  const session = await requireAuth();
  const academyId = getAcademyId(session);

  const drafts = await prisma.extractionQuestionDraft.findMany({
    where: {
      job: { academyId },
      reviewStatus: { notIn: ["PROMOTED", "SKIPPED"] },
    },
    orderBy: [{ createdAt: "desc" }, { questionOrder: "asc" }],
    include: {
      passageDraft: {
        select: {
          id: true,
          passageOrder: true,
          restoredText: true,
          teacherText: true,
          problemText: true,
          restorationStatus: true,
          verificationStatus: true,
        },
      },
      job: {
        select: {
          id: true,
          mode: true,
          originalFileName: true,
          sourceMaterialId: true,
          createdAt: true,
        },
      },
    },
  });

  return drafts.map((draft) => ({
    id: draft.id,
    jobId: draft.jobId,
    passageDraftId: draft.passageDraftId,
    questionOrder: draft.questionOrder,
    questionNumber: draft.questionNumber,
    sourcePageIndex: draft.sourcePageIndex,
    stem: draft.stem,
    choices: draft.choices,
    answer: draft.answer,
    explanation: draft.explanation,
    questionType: draft.questionType,
    confidence: draft.confidence,
    warnings: draft.warnings,
    reviewStatus: draft.reviewStatus,
    createdAt: draft.createdAt.toISOString(),
    passageDraft: draft.passageDraft,
    job: {
      ...draft.job,
      createdAt: draft.job.createdAt.toISOString(),
    },
  }));
}

export async function updateQuestionDraft(
  draftId: string,
  input: QuestionDraftUpdateInput,
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);

    const draft = await prisma.extractionQuestionDraft.findFirst({
      where: { id: draftId, job: { academyId } },
      select: { id: true, reviewStatus: true },
    });
    if (!draft)
      return { success: false, error: "문제 draft를 찾을 수 없습니다." };
    if (draft.reviewStatus === "PROMOTED") {
      return { success: false, error: "이미 문제 은행에 등록된 draft입니다." };
    }

    await prisma.extractionQuestionDraft.update({
      where: { id: draftId },
      data: {
        stem: input.stem,
        choices: input.choices as Prisma.InputJsonValue,
        answer: input.answer,
        explanation: input.explanation,
        questionType: input.questionType || null,
        reviewStatus: "REVIEWED",
      },
    });

    revalidatePath("/director/questions/pending");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 draft 저장에 실패했습니다.";
    return { success: false, error: message };
  }
}

export async function skipQuestionDraft(
  draftId: string,
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);

    const draft = await prisma.extractionQuestionDraft.findFirst({
      where: { id: draftId, job: { academyId } },
      select: { id: true, reviewStatus: true },
    });
    if (!draft)
      return { success: false, error: "문제 draft를 찾을 수 없습니다." };
    if (draft.reviewStatus === "PROMOTED") {
      return {
        success: false,
        error: "등록된 문제 draft는 삭제할 수 없습니다.",
      };
    }

    await prisma.extractionQuestionDraft.update({
      where: { id: draftId },
      data: { reviewStatus: "SKIPPED" },
    });

    revalidatePath("/director/questions/pending");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 draft 삭제에 실패했습니다.";
    return { success: false, error: message };
  }
}

export async function promoteQuestionDraft(
  draftId: string,
  input: QuestionDraftUpdateInput,
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);

    const draft = await prisma.extractionQuestionDraft.findFirst({
      where: { id: draftId, job: { academyId } },
      include: {
        job: { select: { sourceMaterialId: true } },
        passageDraft: { select: { id: true } },
      },
    });
    if (!draft)
      return { success: false, error: "문제 draft를 찾을 수 없습니다." };
    if (draft.reviewStatus === "PROMOTED") {
      return { success: false, error: "이미 문제 은행에 등록된 draft입니다." };
    }

    const choices = normalizeChoices(input.choices);
    const metadata = draft.metadata as Record<string, unknown> | null;
    const sourceExtractionItemId =
      typeof metadata?.questionItemId === "string"
        ? metadata.questionItemId
        : draft.id;

    const question = await prisma.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          academyId,
          passageId: null,
          sourceMaterialId: draft.job.sourceMaterialId,
          sourceExtractionItemId,
          questionNumber: draft.questionNumber,
          type: choices.length > 0 ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
          subType: input.questionType || draft.questionType || null,
          questionText: input.stem,
          options: choices.length > 0 ? JSON.stringify(choices) : null,
          correctAnswer: input.answer || "",
          points: 1,
          difficulty: "INTERMEDIATE",
          aiGenerated: false,
          approved: true,
          tags: JSON.stringify(["M2 추출"]),
        },
      });

      if (input.explanation.trim().length > 0) {
        await tx.questionExplanation.create({
          data: {
            questionId: created.id,
            content: input.explanation,
            aiGenerated: false,
            approved: true,
          },
        });
      }

      await tx.extractionQuestionDraft.update({
        where: { id: draft.id },
        data: {
          stem: input.stem,
          choices: choices as Prisma.InputJsonValue,
          answer: input.answer,
          explanation: input.explanation,
          questionType: input.questionType || null,
          reviewStatus: "PROMOTED",
          confirmedAt: new Date(),
          metadata: {
            ...((draft.metadata as Record<string, unknown> | null) ?? {}),
            promotedQuestionId: created.id,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    revalidatePath("/director/questions/pending");
    revalidatePath("/director/questions");
    return { success: true, id: question.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "문제 은행 등록에 실패했습니다.";
    return { success: false, error: message };
  }
}

function normalizeChoices(
  value: unknown,
): Array<{ label: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((choice, index) => {
      if (!choice || typeof choice !== "object") return null;
      const row = choice as Record<string, unknown>;
      const label =
        typeof row.label === "string" ? row.label : String(index + 1);
      const text =
        typeof row.text === "string"
          ? row.text
          : typeof row.content === "string"
            ? row.content
            : "";
      if (!text.trim()) return null;
      return { label, text };
    })
    .filter((choice): choice is { label: string; text: string } =>
      Boolean(choice),
    );
}
