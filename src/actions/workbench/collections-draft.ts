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
      _count: {
        select: {
          items: {
            where: {
              draft: {
                deletedAt: null,
                job: { deletedAt: null },
              },
            },
          },
          children: true,
        },
      },
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
    where: {
      collection: { academyId },
      draft: {
        deletedAt: null,
        job: { deletedAt: null },
      },
    },
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
  const staff = await requireAuth();
  try {
    const collection = await prisma.m1PassageDraftCollection.findFirst({
      where: { id: collectionId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!collection) {
      return { success: false as const, error: "?대뜑瑜?李얠쓣 ???놁뒿?덈떎." };
    }

    const drafts = await prisma.extractionM1PassageDraft.findMany({
      where: {
        id: { in: draftIds },
        deletedAt: null,
        job: { academyId: staff.academyId, deletedAt: null },
      },
      select: { id: true },
    });
    const allowedDraftIdSet = new Set(drafts.map((draft) => draft.id));
    const allowedDraftIds = draftIds.filter((draftId) =>
      allowedDraftIdSet.has(draftId),
    );
    if (allowedDraftIds.length === 0) {
      revalidatePath(MANAGE_PATH);
      return { success: true as const };
    }

    const maxItem = await prisma.m1PassageDraftCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.m1PassageDraftCollectionItem.createMany({
      data: allowedDraftIds.map((draftId, idx) => ({
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
  const staff = await requireAuth();
  try {
    const collection = await prisma.m1PassageDraftCollection.findFirst({
      where: { id: collectionId, academyId: staff.academyId },
      select: { id: true, name: true },
    });
    if (!collection) {
      return { success: false as const, error: "폴더를 찾을 수 없습니다." };
    }

    const existingItems = await prisma.m1PassageDraftCollectionItem.findMany({
      where: {
        collectionId,
        draftId: { in: draftIds },
        draft: {
          deletedAt: null,
          job: { deletedAt: null },
        },
      },
      select: {
        draftId: true,
        draft: {
          select: {
            title: true,
            jobId: true,
            passageOrder: true,
            job: {
              select: {
                displayName: true,
                originalFileName: true,
              },
            },
          },
        },
      },
    });
    if (existingItems.length === 0) {
      revalidatePath(MANAGE_PATH);
      return { success: true as const };
    }

    await prisma.$transaction([
      prisma.extractionAuditLog.createMany({
        data: existingItems.map((item) => ({
          academyId: staff.academyId,
          actorStaffId: staff.id,
          action: "M1_DRAFT_REMOVE_FROM_COLLECTION",
          targetType: "EXTRACTION_M1_PASSAGE_DRAFT",
          targetId: item.draftId,
          targetLabel:
            item.draft.title ||
            item.draft.job.displayName ||
            item.draft.job.originalFileName,
          metadata: {
            collectionId: collection.id,
            collectionName: collection.name,
            jobId: item.draft.jobId,
            passageOrder: item.draft.passageOrder,
          },
        })),
      }),
      prisma.m1PassageDraftCollectionItem.deleteMany({
        where: {
          collectionId,
          draftId: { in: existingItems.map((item) => item.draftId) },
        },
      }),
    ]);
    revalidatePath(MANAGE_PATH);
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false as const, error: message };
  }
}
