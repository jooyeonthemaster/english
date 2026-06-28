"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";

// ---------------------------------------------------------------------------
// Webtoon Collections — Folder-like organization for webtoons.
// Mirrors collections-passage.ts; webtoons have no folder model of their own so
// these provide the same create/rename/delete/membership surface the shared
// useFolderManager + FolderSection expect.
// ---------------------------------------------------------------------------

const WEBTOON_LIBRARY_PATH = "/director/workbench/webtoon/library";

export async function getWebtoonCollections(academyId: string) {
  await requireAuth();
  return prisma.webtoonCollection.findMany({
    where: { academyId },
    include: {
      _count: { select: { items: true, children: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createWebtoonCollection(data: {
  name: string;
  description?: string;
  color?: string;
  parentId?: string;
}) {
  const staff = await requireAuth();
  try {
    const collection = await prisma.webtoonCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        color: data.color || null,
        parentId: data.parentId || null,
      },
    });
    revalidatePath(WEBTOON_LIBRARY_PATH);
    return { success: true as const, id: collection.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 생성 실패";
    return { success: false as const, error: message };
  }
}

export async function updateWebtoonCollection(
  collectionId: string,
  data: { name?: string; description?: string; color?: string }
) {
  await requireAuth();
  try {
    await prisma.webtoonCollection.update({
      where: { id: collectionId },
      data,
    });
    revalidatePath(WEBTOON_LIBRARY_PATH);
    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deleteWebtoonCollection(collectionId: string) {
  await requireAuth();
  try {
    await prisma.webtoonCollection.delete({
      where: { id: collectionId },
    });
    revalidatePath(WEBTOON_LIBRARY_PATH);
    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 삭제 실패";
    return { success: false as const, error: message };
  }
}

export async function addWebtoonsToCollection(
  collectionId: string,
  webtoonIds: string[]
) {
  await requireAuth();
  try {
    const existing = await prisma.webtoonCollectionItem.findMany({
      where: { collectionId, webtoonId: { in: webtoonIds } },
      select: { webtoonId: true },
    });
    const existingSet = new Set(existing.map((e) => e.webtoonId));
    const addedIds = [...new Set(webtoonIds)].filter(
      (id) => !existingSet.has(id),
    );
    if (addedIds.length === 0) {
      return { success: true as const, addedIds: [] as string[] };
    }

    const maxItem = await prisma.webtoonCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.webtoonCollectionItem.createMany({
      data: addedIds.map((webtoonId, idx) => ({
        collectionId,
        webtoonId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath(WEBTOON_LIBRARY_PATH);
    return { success: true as const, addedIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더에 추가 실패";
    return { success: false as const, error: message };
  }
}

export async function removeWebtoonsFromCollection(
  collectionId: string,
  webtoonIds: string[]
) {
  await requireAuth();
  try {
    const existing = await prisma.webtoonCollectionItem.findMany({
      where: { collectionId, webtoonId: { in: webtoonIds } },
      select: { webtoonId: true },
    });
    const removedIds = existing.map((e) => e.webtoonId);
    if (removedIds.length === 0) {
      return { success: true as const, removedIds: [] as string[] };
    }

    await prisma.webtoonCollectionItem.deleteMany({
      where: {
        collectionId,
        webtoonId: { in: removedIds },
      },
    });
    revalidatePath(WEBTOON_LIBRARY_PATH);
    return { success: true as const, removedIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false as const, error: message };
  }
}

// ---------------------------------------------------------------------------
// Webtoon → Collection membership map for the current academy. Keeps all DB
// access inside the action layer (single guarded, academy-scoped entry point).
// ---------------------------------------------------------------------------
export async function getAcademyWebtoonCollectionMembership(
  academyId: string
): Promise<Record<string, string[]>> {
  const session = await requireAuth();
  if (session.academyId !== academyId) {
    // Silent isolation — never leak another academy's membership graph.
    return {};
  }
  const items = await prisma.webtoonCollectionItem.findMany({
    where: { collection: { academyId } },
    select: { collectionId: true, webtoonId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.webtoonId);
  }
  return membership;
}
