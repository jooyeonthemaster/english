"use server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Anchor, LayoutDescriptor } from "@/lib/question-sets/types";

export interface QuestionSetMember {
  itemId: string;
  questionId: string;
  orderInSet: number;
  isStructural: boolean;
  typeId: string | null;
  difficulty: string;
  questionText: string;
  options: unknown;
  correctAnswer: string;
  structuredData: unknown;
  spans: Anchor[];
  approved: boolean;
  explanation: { content: string; keyPoints: string | null; wrongOptionExplanations: string | null } | null;
}

export interface QuestionSetForRender {
  id: string;
  status: string;
  structuralMode: string;
  setLabel: string | null;
  canonicalPassage: string;
  layout: LayoutDescriptor | null;
  members: QuestionSetMember[];
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Load a 장문 세트 with its ordered members for rendering. Academy-scoped. */
export async function getQuestionSet(
  setId: string,
): Promise<QuestionSetForRender | null> {
  const staff = await getStaffSession();
  if (!staff) return null;

  const set = await prisma.questionSet.findFirst({
    where: { id: setId, academyId: staff.academyId },
    include: {
      items: {
        orderBy: { orderInSet: "asc" },
        include: { question: { include: { explanation: true } } },
      },
    },
  });
  if (!set) return null;

  return {
    id: set.id,
    status: set.status,
    structuralMode: set.structuralMode,
    setLabel: set.setLabel,
    canonicalPassage: set.canonicalPassage,
    layout: parseJson<LayoutDescriptor>(set.displayedPassageLayout),
    members: set.items.map((item) => {
      const q = item.question;
      return {
        itemId: item.id,
        questionId: q.id,
        orderInSet: item.orderInSet,
        isStructural: item.isStructural,
        typeId: q.subType,
        difficulty: q.difficulty,
        questionText: q.questionText,
        options: parseJson<unknown>(q.options),
        correctAnswer: q.correctAnswer,
        structuredData: q.structuredData,
        spans: (item.spans as unknown as Anchor[]) ?? [],
        approved: q.approved,
        explanation: q.explanation
          ? {
              content: q.explanation.content,
              keyPoints: q.explanation.keyPoints,
              wrongOptionExplanations: q.explanation.wrongOptionExplanations,
            }
          : null,
      };
    }),
  };
}

/** Approve every member question in a set. */
export async function approveQuestionSet(
  setId: string,
): Promise<{ success: boolean; approved: number; error?: string }> {
  const staff = await getStaffSession();
  if (!staff) return { success: false, approved: 0, error: "Authentication required" };

  const set = await prisma.questionSet.findFirst({
    where: { id: setId, academyId: staff.academyId },
    select: { id: true },
  });
  if (!set) return { success: false, approved: 0, error: "세트를 찾을 수 없습니다." };

  const result = await prisma.question.updateMany({
    where: { setId, academyId: staff.academyId },
    data: { approved: true },
  });
  return { success: true, approved: result.count };
}

/** Delete a set and its member questions (member questions are set-only). */
export async function deleteQuestionSet(
  setId: string,
): Promise<{ success: boolean; error?: string }> {
  const staff = await getStaffSession();
  if (!staff) return { success: false, error: "Authentication required" };

  const set = await prisma.questionSet.findFirst({
    where: { id: setId, academyId: staff.academyId },
    select: { id: true },
  });
  if (!set) return { success: false, error: "세트를 찾을 수 없습니다." };

  // Deleting the member questions cascades their QuestionSetItem rows; then the set.
  await prisma.question.deleteMany({ where: { setId, academyId: staff.academyId } });
  await prisma.questionSet.delete({ where: { id: setId } });
  return { success: true };
}
