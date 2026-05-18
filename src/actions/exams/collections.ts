"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertExamCollectionBelongsToAcademy,
  assertExamsBelongToAcademy,
} from "./_helpers";
import type { ActionResult } from "./_types";

// ---------------------------------------------------------------------------
// Exam Collections — Folder-like organization for exams
// ---------------------------------------------------------------------------

export async function getExamCollections(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];
  const collections = await prisma.examCollection.findMany({
    where: { academyId },
    include: {
      _count: { select: { items: true, children: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return collections.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    description: c.description,
    color: c.color,
    _count: { items: c._count.items, children: c._count.children },
  }));
}

export async function getExamCollectionMembership(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return {};
  const items = await prisma.examCollectionItem.findMany({
    where: { collection: { academyId } },
    select: { collectionId: true, examId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.examId);
  }
  return membership;
}

export async function createExamCollection(data: {
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
}): Promise<ActionResult> {
  const staff = await requireStaffAuth();
  try {
    // If a parent folder is provided, make sure it's also in this academy —
    // otherwise the caller could nest a folder under another tenant's tree.
    if (data.parentId) {
      await assertExamCollectionBelongsToAcademy(data.parentId, staff.academyId);
    }

    const collection = await prisma.examCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        parentId: data.parentId || null,
        color: data.color || null,
      },
    });
    revalidatePath("/director/exams");
    return { success: true, id: collection.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 생성 실패";
    return { success: false, error: message };
  }
}

export async function updateExamCollection(
  collectionId: string,
  data: { name?: string; description?: string },
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);

    await prisma.examCollection.update({ where: { id: collectionId }, data });
    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false, error: message };
  }
}

export async function deleteExamCollection(
  collectionId: string,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);

    await prisma.examCollection.delete({ where: { id: collectionId } });
    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 삭제 실패";
    return { success: false, error: message };
  }
}

export async function addExamsToCollection(
  collectionId: string,
  examIds: string[],
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);
    await assertExamsBelongToAcademy(examIds, staff.academyId);

    const maxItem = await prisma.examCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.examCollectionItem.createMany({
      data: examIds.map((examId, idx) => ({
        collectionId,
        examId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 추가 실패";
    return { success: false, error: message };
  }
}

export async function removeExamsFromCollection(
  collectionId: string,
  examIds: string[],
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);
    // examIds don't need academy verification here because deleteMany is
    // scoped by { collectionId, examId in: ... } and the collection itself
    // has already been proven to belong to this academy. Rows referencing
    // foreign examIds simply won't match and will no-op.

    await prisma.examCollectionItem.deleteMany({
      where: { collectionId, examId: { in: examIds } },
    });
    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false, error: message };
  }
}
