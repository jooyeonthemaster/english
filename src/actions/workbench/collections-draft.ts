"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";

// ---------------------------------------------------------------------------
// M1 Passage Draft Collections — Folder-like organization for extraction
// drafts. Mirrors collections-passage.ts so the same useFolderManager hook
// and FolderSection component can drive both UIs.
// ---------------------------------------------------------------------------

const MANAGE_PATH = "/director/workbench/passages/import/jobs";

export async function getM1DraftCollections(academyId: string) {
  await requireAuth();
  return prisma.m1PassageDraftCollection.findMany({
    where: { academyId },
    include: {
      _count: { select: { items: true, children: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getAcademyM1DraftCollectionMembership(
  academyId: string,
): Promise<Record<string, string[]>> {
  const session = await requireAuth();
  if (session.academyId !== academyId) {
    // Silent isolation — never leak another academy's membership graph.
    return {};
  }
  const items = await prisma.m1PassageDraftCollectionItem.findMany({
    where: { collection: { academyId } },
    select: { collectionId: true, draftId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.draftId);
  }
  return membership;
}

export async function createM1DraftCollection(data: {
  name: string;
  description?: string;
  color?: string;
  parentId?: string;
}) {
  const staff = await requireAuth();
  try {
    const collection = await prisma.m1PassageDraftCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        color: data.color || null,
        parentId: data.parentId || null,
      },
    });
    revalidatePath(MANAGE_PATH);
    return { success: true as const, id: collection.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 생성 실패";
    return { success: false as const, error: message };
  }
}

export async function updateM1DraftCollection(
  collectionId: string,
  data: { name?: string; description?: string; color?: string },
) {
  await requireAuth();
  try {
    await prisma.m1PassageDraftCollection.update({
      where: { id: collectionId },
      data,
    });
    revalidatePath(MANAGE_PATH);
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deleteM1DraftCollection(collectionId: string) {
  await requireAuth();
  try {
    await prisma.m1PassageDraftCollection.delete({
      where: { id: collectionId },
    });
    revalidatePath(MANAGE_PATH);
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 삭제 실패";
    return { success: false as const, error: message };
  }
}

export async function addDraftsToCollection(
  collectionId: string,
  draftIds: string[],
) {
  await requireAuth();
  try {
    const maxItem = await prisma.m1PassageDraftCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.m1PassageDraftCollectionItem.createMany({
      data: draftIds.map((draftId, idx) => ({
        collectionId,
        draftId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath(MANAGE_PATH);
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에 추가 실패";
    return { success: false as const, error: message };
  }
}

export async function removeDraftsFromCollection(
  collectionId: string,
  draftIds: string[],
) {
  await requireAuth();
  try {
    await prisma.m1PassageDraftCollectionItem.deleteMany({
      where: {
        collectionId,
        draftId: { in: draftIds },
      },
    });
    revalidatePath(MANAGE_PATH);
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false as const, error: message };
  }
}
