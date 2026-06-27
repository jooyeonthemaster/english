"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";

// ---------------------------------------------------------------------------
// Question Collections (playlist-style)
// ---------------------------------------------------------------------------

export async function getQuestionCollections(academyId: string) {
  await requireAuth();
  return prisma.questionCollection.findMany({
    where: { academyId },
    include: { _count: { select: { items: true, children: true } } },
    orderBy: { name: "asc" },
  });
}

/**
 * Returns the question-collection membership graph for an academy as
 * { collectionId: questionId[] }. Client-callable analogue of the inline
 * prisma.questionCollectionItem.findMany the question-management page runs
 * server-side. Academy-scoped: never leaks another tenant's membership.
 */
export async function getAcademyQuestionCollectionMembership(
  academyId: string,
): Promise<Record<string, string[]>> {
  const session = await requireAuth();
  if (session.academyId !== academyId) return {};
  const items = await prisma.questionCollectionItem.findMany({
    where: { collection: { academyId } },
    select: { collectionId: true, questionId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.questionId);
  }
  return membership;
}

export async function createQuestionCollection(data: {
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
}) {
  const staff = await requireAuth();
  try {
    const collection = await prisma.questionCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        parentId: data.parentId || null,
        color: data.color || null,
      },
    });
    revalidatePath("/director/questions");
    return { success: true as const, id: collection.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 생성 실패";
    return { success: false as const, error: message };
  }
}

export async function updateQuestionCollection(
  collectionId: string,
  data: { name?: string; description?: string }
) {
  await requireAuth();
  try {
    await prisma.questionCollection.update({
      where: { id: collectionId },
      data,
    });
    revalidatePath("/director/questions");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deleteQuestionCollection(collectionId: string) {
  await requireAuth();
  try {
    await prisma.questionCollection.delete({
      where: { id: collectionId },
    });
    revalidatePath("/director/questions");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 삭제 실패";
    return { success: false as const, error: message };
  }
}

export async function addQuestionsToCollection(
  collectionId: string,
  questionIds: string[]
) {
  await requireAuth();
  try {
    // Compute the items that will ACTUALLY be inserted (not already present)
    // so the caller can reconcile its optimistic UI counts with the DB. Using
    // skipDuplicates alone hides this — createMany never reports which rows it
    // skipped — so the client would over-count.
    const existing = await prisma.questionCollectionItem.findMany({
      where: { collectionId, questionId: { in: questionIds } },
      select: { questionId: true },
    });
    const existingSet = new Set(existing.map((e) => e.questionId));
    const addedIds = [...new Set(questionIds)].filter(
      (id) => !existingSet.has(id),
    );
    if (addedIds.length === 0) {
      return { success: true as const, addedIds: [] as string[] };
    }

    const maxItem = await prisma.questionCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.questionCollectionItem.createMany({
      data: addedIds.map((questionId, idx) => ({
        collectionId,
        questionId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/questions");
    return { success: true as const, addedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 추가 실패";
    return { success: false as const, error: message };
  }
}

export async function removeQuestionsFromCollection(
  collectionId: string,
  questionIds: string[]
) {
  await requireAuth();
  try {
    // Resolve which of the requested items are actually in the collection so
    // the caller can reconcile counts against the DB (the rest were never
    // members and must not be counted as removals).
    const existing = await prisma.questionCollectionItem.findMany({
      where: { collectionId, questionId: { in: questionIds } },
      select: { questionId: true },
    });
    const removedIds = existing.map((e) => e.questionId);
    if (removedIds.length === 0) {
      return { success: true as const, removedIds: [] as string[] };
    }

    await prisma.questionCollectionItem.deleteMany({
      where: {
        collectionId,
        questionId: { in: removedIds },
      },
    });
    revalidatePath("/director/questions");
    return { success: true as const, removedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 제거 실패";
    return { success: false as const, error: message };
  }
}
