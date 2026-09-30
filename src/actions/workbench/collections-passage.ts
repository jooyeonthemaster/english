"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";
import { HAS_PRIME_REPORT_WHERE } from "./passage-constants";
import {
  buildCollectionSubjectScopeWhere,
  isMissingColumnError,
} from "./_collection-where";
import { pickFolderPatch, sanitizeIdList } from "./_lib/folder-scope";

// ---------------------------------------------------------------------------
// Passage Collections — Folder-like organization for passages
//
// 학원 범위(IDOR 수리 26-09-30): 모든 액션이 세션 academyId 로 폴더·지문을 거른다.
// 인자 academyId 는 호환용이고 쓰지 않는다. 남의 학원 폴더 id 는 「폴더를 찾을 수
// 없습니다」, 남의 학원 지문 id 는 조용히 빠진다(존재 여부를 드러내지 않는다).
// ---------------------------------------------------------------------------

const FOLDER_NOT_FOUND = "폴더를 찾을 수 없습니다.";

async function isOwnedPassageFolder(collectionId: unknown, academyId: string) {
  if (typeof collectionId !== "string" || collectionId.length === 0) return false;
  const row = await prisma.passageCollection.findFirst({
    where: { id: collectionId, academyId },
    select: { id: true },
  });
  return row !== null;
}

export async function getPassageCollections(
  academyId: string,
  opts?: {
    onlyWithReport?: boolean;
    /** 과목 스코프 — "KOREAN"=국어 폴더만 / 미지정=영어 기본(국어 폴더 제외). */
    subject?: "KOREAN";
  },
) {
  // 학원 범위는 세션이 정한다 — 모든 서버 호출부가 staff.academyId 를 넘기고, 클라이언트
  // 훅(use-collections-state)은 "" 를 넘겨 빈 목록을 받던 상태였다.
  const staff = await requireAuth();
  void academyId;
  const scopedAcademyId = staff.academyId;
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
      where: { academyId: scopedAcademyId, ...buildCollectionSubjectScopeWhere(opts?.subject) },
      include: countSelect,
      orderBy: { name: "asc" },
    });
  } catch (error) {
    // 우아한 강등 — DB 에 subject 컬럼이 아직 없으면(P2022, surgical ALTER 이전)
    // 레거시(과목 미분리·공유 폴더) 목록으로 폴백한다. subject 를 SELECT 하지
    // 않도록 명시 select 로 재조회하고, 반환 형태는 subject:null 로 맞춘다.
    if (!isMissingColumnError(error)) throw error;
    const rows = await prisma.passageCollection.findMany({
      where: { academyId: scopedAcademyId },
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
    // 상위 폴더도 이 학원 것이어야 한다 — 남의 학원 폴더 아래로 붙이지 못하게.
    if (baseData.parentId && !(await isOwnedPassageFolder(baseData.parentId, staff.academyId))) {
      return { success: false as const, error: FOLDER_NOT_FOUND };
    }
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
  const staff = await requireAuth();
  try {
    // 학원 범위 + 허용 필드만(academyId·parentId·subject 를 실어 보내도 무시).
    // updateMany 는 RETURNING 이 없어 subject 컬럼 미반영 DB 에서도 깨지지 않는다.
    const result = await prisma.passageCollection.updateMany({
      where: { id: collectionId, academyId: staff.academyId },
      data: pickFolderPatch(data),
    });
    if (result.count === 0) return { success: false as const, error: FOLDER_NOT_FOUND };
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deletePassageCollection(collectionId: string) {
  const staff = await requireAuth();
  try {
    // 학원 범위 — 남의 학원 폴더 id 는 count 0(RETURNING 없음 → subject 컬럼 미반영 DB 안전).
    const result = await prisma.passageCollection.deleteMany({
      where: { id: collectionId, academyId: staff.academyId },
    });
    if (result.count === 0) return { success: false as const, error: FOLDER_NOT_FOUND };
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
  const staff = await requireAuth();
  try {
    // 학원 범위 — 폴더도 지문도 이 학원 것만. 남의 학원 지문을 내 폴더에 담아
    // getPassageCollectionItems 로 본문을 읽어 가는 경로를 막는다(IDOR 수리 26-09-30).
    if (!(await isOwnedPassageFolder(collectionId, staff.academyId))) {
      return { success: false as const, error: FOLDER_NOT_FOUND };
    }
    const requestedIds = sanitizeIdList(passageIds);
    const owned = requestedIds.length
      ? await prisma.passage.findMany({
          where: { id: { in: requestedIds }, academyId: staff.academyId },
          select: { id: true },
        })
      : [];
    const ownedSet = new Set(owned.map((p) => p.id));
    const ownedIds = requestedIds.filter((id) => ownedSet.has(id));

    // Only the not-already-present items are actually inserted; return them so
    // the client can keep its folder counts in sync with the DB (createMany +
    // skipDuplicates silently drops the rest).
    const existing = await prisma.passageCollectionItem.findMany({
      where: { collectionId, passageId: { in: ownedIds } },
      select: { passageId: true },
    });
    const existingSet = new Set(existing.map((e) => e.passageId));
    const addedIds = ownedIds.filter((id) => !existingSet.has(id));
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
  const staff = await requireAuth();
  try {
    // 학원 범위 — 남의 학원 폴더에서는 아무것도 빼지 않는다.
    if (!(await isOwnedPassageFolder(collectionId, staff.academyId))) {
      return { success: false as const, error: FOLDER_NOT_FOUND };
    }
    const existing = await prisma.passageCollectionItem.findMany({
      where: { collectionId, passageId: { in: sanitizeIdList(passageIds) } },
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
  const staff = await requireAuth();
  // 학원 범위 — 폴더와 지문 둘 다 이 학원 것만(남의 학원 폴더 id 는 빈 목록).
  const items = await prisma.passageCollectionItem.findMany({
    where: {
      collectionId,
      collection: { academyId: staff.academyId },
      passage: { academyId: staff.academyId },
    },
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
