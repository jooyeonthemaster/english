"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";

// ---------------------------------------------------------------------------
// Passage Collections — Folder-like organization for passages
// ---------------------------------------------------------------------------

export async function getPassageCollections(academyId: string) {
  await requireAuth();
  return prisma.passageCollection.findMany({
    where: { academyId },
    include: {
      _count: { select: { items: true, children: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createPassageCollection(data: {
  name: string;
  description?: string;
  color?: string;
  parentId?: string;
}) {
  const staff = await requireAuth();
  try {
    const collection = await prisma.passageCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        color: data.color || null,
        parentId: data.parentId || null,
      },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const, id: collection.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 생성 실패";
    return { success: false as const, error: message };
  }
}

export async function updatePassageCollection(
  collectionId: string,
  data: { name?: string; description?: string; color?: string }
) {
  await requireAuth();
  try {
    await prisma.passageCollection.update({
      where: { id: collectionId },
      data,
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deletePassageCollection(collectionId: string) {
  await requireAuth();
  try {
    await prisma.passageCollection.delete({
      where: { id: collectionId },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 삭제 실패";
    return { success: false as const, error: message };
  }
}

export async function addPassagesToCollection(
  collectionId: string,
  passageIds: string[]
) {
  await requireAuth();
  try {
    const maxItem = await prisma.passageCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.passageCollectionItem.createMany({
      data: passageIds.map((passageId, idx) => ({
        collectionId,
        passageId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에 추가 실패";
    return { success: false as const, error: message };
  }
}

export async function removePassagesFromCollection(
  collectionId: string,
  passageIds: string[]
) {
  await requireAuth();
  try {
    await prisma.passageCollectionItem.deleteMany({
      where: {
        collectionId,
        passageId: { in: passageIds },
      },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false as const, error: message };
  }
}

export async function getPassageCollectionItems(collectionId: string) {
  await requireAuth();
  const items = await prisma.passageCollectionItem.findMany({
    where: { collectionId },
    include: {
      passage: {
        include: {
          school: { select: { id: true, name: true, type: true } },
          analysis: { select: { id: true, updatedAt: true, analysisData: true } },
          _count: { select: { questions: true, notes: true } },
        },
      },
    },
    orderBy: { orderNum: "asc" },
  });
  return items.map((i) => i.passage);
}
