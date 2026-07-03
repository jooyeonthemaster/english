"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";
import { HAS_PRIME_REPORT_WHERE } from "./passage-constants";
import {
  buildCollectionSubjectScopeWhere,
  isMissingColumnError,
} from "./_collection-where";

// ---------------------------------------------------------------------------
// Passage Collections — Folder-like organization for passages
// ---------------------------------------------------------------------------

export async function getPassageCollections(
  academyId: string,
  opts?: {
    onlyWithReport?: boolean;
    /** 과목 스코프 — "KOREAN"=국어 폴더만 / 미지정=영어 기본(국어 폴더 제외). */
    subject?: "KOREAN";
  },
) {
  await requireAuth();
  const countSelect = {
    _count: {
      select: {
        // 학습지 관리 페이지(onlyWithReport)는 목록과 동일하게 "보고서 있는
        // 학습지"만 센다. 보고서 없는/삭제된 멤버십 행이 배지를 부풀려
        // "N개인데 폴더는 비어 있음"으로 보이던 문제를 막는다.
        items: opts?.onlyWithReport
          ? { where: { passage: HAS_PRIME_REPORT_WHERE } }
          : true,
        children: true,
      },
    },
  } as const;
  try {
    return await prisma.passageCollection.findMany({
      // 과목 스코프(항상 적용) — 국어/영어 폴더 완전 분리. 기존(subject null)
      // 폴더는 전부 영어로 간주돼 영어 목록에 그대로 남는다(무회귀).
      where: { academyId, ...buildCollectionSubjectScopeWhere(opts?.subject) },
      include: countSelect,
      orderBy: { name: "asc" },
    });
  } catch (error) {
    // 우아한 강등 — DB 에 subject 컬럼이 아직 없으면(P2022, surgical ALTER 이전)
    // 레거시(과목 미분리·공유 폴더) 목록으로 폴백한다. subject 를 SELECT 하지
    // 않도록 명시 select 로 재조회하고, 반환 형태는 subject:null 로 맞춘다.
    if (!isMissingColumnError(error)) throw error;
    const rows = await prisma.passageCollection.findMany({
      where: { academyId },
      select: {
        id: true,
        academyId: true,
        parentId: true,
        name: true,
        description: true,
        color: true,
        createdAt: true,
        updatedAt: true,
        ...countSelect,
      },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({ ...row, subject: null as string | null }));
  }
}

export async function createPassageCollection(data: {
  name: string;
  description?: string;
  color?: string;
  parentId?: string;
  /** 폴더 과목 — "KOREAN"=국어 라우트에서 생성. 미지정=영어(INSERT 에 subject 미포함, 무회귀). */
  subject?: "KOREAN";
}) {
  const staff = await requireAuth();
  const baseData = {
    academyId: staff.academyId,
    name: data.name,
    description: data.description || null,
    color: data.color || null,
    parentId: data.parentId || null,
  };
  try {
    const collection = await prisma.passageCollection.create({
      data: {
        ...baseData,
        ...(data.subject ? { subject: data.subject } : {}),
      },
      // RETURNING 에서 subject 를 빼 컬럼 미반영 DB(P2022)에서도 영어 경로
      // 생성이 절대 깨지지 않게 한다(반환값은 id 만 사용).
      select: { id: true },
    });
    revalidatePath("/director/workbench/passages");
    if (data.subject === "KOREAN") revalidatePath("/director/korean/passages");
    return { success: true as const, id: collection.id };
  } catch (error) {
    // 우아한 강등 — 국어 스코프 생성인데 subject 컬럼이 아직 없으면(P2022)
    // 레거시(공유) 폴더로라도 생성한다. ALTER 이전 환경에서 502 대신 동작 유지.
    if (data.subject && isMissingColumnError(error)) {
      try {
        const collection = await prisma.passageCollection.create({
          data: baseData,
          select: { id: true },
        });
        revalidatePath("/director/workbench/passages");
        revalidatePath("/director/korean/passages");
        return { success: true as const, id: collection.id };
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : "폴더 생성 실패";
        return { success: false as const, error: message };
      }
    }
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
      // RETURNING 최소화 — subject 컬럼 미반영 DB에서도 이름변경이 깨지지 않게.
      select: { id: true },
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
      // RETURNING 최소화 — subject 컬럼 미반영 DB에서도 삭제가 깨지지 않게.
      select: { id: true },
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
    // Only the not-already-present items are actually inserted; return them so
    // the client can keep its folder counts in sync with the DB (createMany +
    // skipDuplicates silently drops the rest).
    const existing = await prisma.passageCollectionItem.findMany({
      where: { collectionId, passageId: { in: passageIds } },
      select: { passageId: true },
    });
    const existingSet = new Set(existing.map((e) => e.passageId));
    const addedIds = [...new Set(passageIds)].filter(
      (id) => !existingSet.has(id),
    );
    if (addedIds.length === 0) {
      return { success: true as const, addedIds: [] as string[] };
    }

    const maxItem = await prisma.passageCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.passageCollectionItem.createMany({
      data: addedIds.map((passageId, idx) => ({
        collectionId,
        passageId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/workbench/passages");
    return { success: true as const, addedIds };
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
    const existing = await prisma.passageCollectionItem.findMany({
      where: { collectionId, passageId: { in: passageIds } },
      select: { passageId: true },
    });
    const removedIds = existing.map((e) => e.passageId);
    if (removedIds.length === 0) {
      return { success: true as const, removedIds: [] as string[] };
    }

    await prisma.passageCollectionItem.deleteMany({
      where: {
        collectionId,
        passageId: { in: removedIds },
      },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const, removedIds };
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
