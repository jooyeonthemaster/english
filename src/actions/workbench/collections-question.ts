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
    const maxItem = await prisma.questionCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.questionCollectionItem.createMany({
      data: questionIds.map((questionId, idx) => ({
        collectionId,
        questionId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/questions");
    return { success: true as const };
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
    await prisma.questionCollectionItem.deleteMany({
      where: {
        collectionId,
        questionId: { in: questionIds },
      },
    });
    revalidatePath("/director/questions");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 제거 실패";
    return { success: false as const, error: message };
  }
}
