"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertExamCollectionBelongsToAcademy,
  assertExamsBelongToAcademy,
} from "./_helpers";
import type { ActionResult } from "./_types";
import {
  buildExamCollectionSubjectScopeWhere,
  isMissingColumnError,
} from "./_exam-subject-where";

// ---------------------------------------------------------------------------
// Exam Collections — Folder-like organization for exams
// ---------------------------------------------------------------------------

export async function getExamCollections(
  academyId: string,
  subject?: "KOREAN",
) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const include = {
    _count: { select: { items: true, children: true } },
  } as const;
  const orderBy = { createdAt: "asc" as const };
  const mapRow = (c: {
    id: string;
    parentId: string | null;
    name: string;
    description: string | null;
    color: string | null;
    _count: { items: number; children: number };
  }) => ({
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    description: c.description,
    color: c.color,
    _count: { items: c._count.items, children: c._count.children },
  });

  // 과목 스코프(항상 적용) — 국어/영어 시험지 폴더 완전 분리. 미지정=영어(기존 폴더
  // 전부=subject null=영어 취급, 무회귀), "KOREAN"=국어 라우트 생성 폴더만.
  try {
    const collections = await prisma.examCollection.findMany({
      where: { academyId, ...buildExamCollectionSubjectScopeWhere(subject) },
      include,
      orderBy,
    });
    return collections.map(mapRow);
  } catch (error) {
    // 우아한 강등 — subject 컬럼 미ALTER(P2022) 시 레거시(과목 미분리·공유 폴더) 목록.
    if (!isMissingColumnError(error)) throw error;
    const collections = await prisma.examCollection.findMany({
      where: { academyId },
      include,
      orderBy,
      omit: { subject: true },
    });
    return collections.map(mapRow);
  }
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
  /** 폴더 과목 — "KOREAN"=국어 라우트 생성. 미지정=영어(INSERT 에 subject 미포함, 무회귀). */
  subject?: "KOREAN";
}): Promise<ActionResult> {
  const staff = await requireStaffAuth();
  // 공통 INSERT 필드 — RETURNING 은 id 만(컬럼 미반영 DB에서도 안전).
  const baseData = {
    academyId: staff.academyId,
    name: data.name,
    description: data.description || null,
    parentId: data.parentId || null,
    color: data.color || null,
  };
  try {
    // If a parent folder is provided, make sure it's also in this academy —
    // otherwise the caller could nest a folder under another tenant's tree.
    if (data.parentId) {
      await assertExamCollectionBelongsToAcademy(data.parentId, staff.academyId);
    }

    const collection = await prisma.examCollection.create({
      // 과목 스탬핑 — 국어만 'KOREAN'. 미지정이면 subject 미포함(조건부 spread).
      data: { ...baseData, ...(data.subject ? { subject: data.subject } : {}) },
      select: { id: true },
    });
    if (data.subject === "KOREAN") revalidatePath("/director/korean/exams");
    revalidatePath("/director/exams");
    return { success: true, id: collection.id };
  } catch (error) {
    // 우아한 강등 — 국어 스코프 생성인데 subject 컬럼이 아직 없으면(P2022) subject 를
    // 빼고 재시도한다(레거시=과목 미분리 공유 폴더로 생성, 502 대신 UX 유지).
    if (data.subject && isMissingColumnError(error)) {
      try {
        const collection = await prisma.examCollection.create({
          data: baseData,
          select: { id: true },
        });
        revalidatePath("/director/exams");
        return { success: true, id: collection.id };
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error ? fallbackError.message : "폴더 생성 실패";
        return { success: false, error: message };
      }
    }
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

    const existing = await prisma.examCollectionItem.findMany({
      where: { collectionId, examId: { in: examIds } },
      select: { examId: true },
    });
    const existingSet = new Set(existing.map((e) => e.examId));
    const addedIds = [...new Set(examIds)].filter((id) => !existingSet.has(id));
    if (addedIds.length === 0) {
      return { success: true, addedIds: [] };
    }

    const maxItem = await prisma.examCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.examCollectionItem.createMany({
      data: addedIds.map((examId, idx) => ({
        collectionId,
        examId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/exams");
    return { success: true, addedIds };
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

    const existing = await prisma.examCollectionItem.findMany({
      where: { collectionId, examId: { in: examIds } },
      select: { examId: true },
    });
    const removedIds = existing.map((e) => e.examId);
    if (removedIds.length === 0) {
      return { success: true, removedIds: [] };
    }

    await prisma.examCollectionItem.deleteMany({
      where: { collectionId, examId: { in: removedIds } },
    });
    revalidatePath("/director/exams");
    return { success: true, removedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false, error: message };
  }
}
