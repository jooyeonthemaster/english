"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";
import { pickFolderPatch } from "./_lib/folder-scope";

// ---------------------------------------------------------------------------
// M1 Passage Draft Collections — Folder-like organization for extraction
// drafts. Mirrors collections-passage.ts so the same useFolderManager hook
// and FolderSection component can drive both UIs.
//
// 학원 범위(IDOR 수리 26-09-30): 목록·수정·삭제·상위 폴더도 세션 academyId 로 건다
// (담기·빼기는 원래부터 걸려 있었다). 인자 academyId 는 호환용이고 쓰지 않는다.
// ---------------------------------------------------------------------------

const MANAGE_PATH = "/director/workbench/passages/import/jobs";
const FOLDER_NOT_FOUND = "폴더를 찾을 수 없습니다.";

export async function getM1DraftCollections(academyId: string) {
  // 학원 범위는 세션이 정한다(모든 호출부가 staff.academyId 를 넘긴다).
  const staff = await requireAuth();
  void academyId;
  return prisma.m1PassageDraftCollection.findMany({
    where: { academyId: staff.academyId },
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
    // 상위 폴더도 이 학원 것이어야 한다 — 남의 학원 폴더 아래로 붙이지 못하게.
    if (data.parentId) {
      const parent = await prisma.m1PassageDraftCollection.findFirst({
        where: { id: data.parentId, academyId: staff.academyId },
        select: { id: true },
      });
      if (!parent) return { success: false as const, error: FOLDER_NOT_FOUND };
    }
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
  const staff = await requireAuth();
  try {
    // 학원 범위 + 허용 필드만(academyId·parentId 를 실어 보내도 무시).
    const result = await prisma.m1PassageDraftCollection.updateMany({
      where: { id: collectionId, academyId: staff.academyId },
      data: pickFolderPatch(data),
    });
    if (result.count === 0) return { success: false as const, error: FOLDER_NOT_FOUND };
    revalidatePath(MANAGE_PATH);
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deleteM1DraftCollection(collectionId: string) {
  const staff = await requireAuth();
  try {
    // 학원 범위 — 남의 학원 폴더 id 는 count 0.
    const result = await prisma.m1PassageDraftCollection.deleteMany({
      where: { id: collectionId, academyId: staff.academyId },
    });
    if (result.count === 0) return { success: false as const, error: FOLDER_NOT_FOUND };
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
      return { success: false as const, error: "폴더를 찾을 수 없습니다." };
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
      return { success: true as const, addedIds: [] as string[] };
    }

    // Exclude items already in the folder so the returned addedIds reflect the
    // real DB delta (allowed ∩ requested − already-present). The client uses
    // this to keep its folder counts accurate.
    const existing = await prisma.m1PassageDraftCollectionItem.findMany({
      where: { collectionId, draftId: { in: allowedDraftIds } },
      select: { draftId: true },
    });
    const existingSet = new Set(existing.map((e) => e.draftId));
    const addedIds = allowedDraftIds.filter((id) => !existingSet.has(id));
    if (addedIds.length === 0) {
      revalidatePath(MANAGE_PATH);
      return { success: true as const, addedIds: [] as string[] };
    }

    const maxItem = await prisma.m1PassageDraftCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.m1PassageDraftCollectionItem.createMany({
      data: addedIds.map((draftId, idx) => ({
        collectionId,
        draftId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath(MANAGE_PATH);
    return { success: true as const, addedIds };
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
      return { success: true as const, removedIds: [] as string[] };
    }
    const removedIds = existingItems.map((item) => item.draftId);

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
          draftId: { in: removedIds },
        },
      }),
    ]);
    revalidatePath(MANAGE_PATH);
    return { success: true as const, removedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false as const, error: message };
  }
}
