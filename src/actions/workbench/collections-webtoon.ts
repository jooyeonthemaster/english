"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";
import {
  buildCollectionSubjectScopeWhere,
  isMissingColumnError,
} from "./_collection-where";

// ---------------------------------------------------------------------------
// Webtoon Collections — Folder-like organization for webtoons.
// Mirrors collections-passage.ts; webtoons have no folder model of their own so
// these provide the same create/rename/delete/membership surface the shared
// useFolderManager + FolderSection expect.
// ---------------------------------------------------------------------------

const WEBTOON_LIBRARY_PATH = "/director/workbench/webtoon/library";
const KOREAN_WEBTOON_LIBRARY_PATH = "/director/korean/webtoon/library";

export async function getWebtoonCollections(
  academyId: string,
  /** 과목 스코프 — "KOREAN"=국어 폴더만 / 미지정=영어 기본(국어 폴더 제외). */
  subject?: "KOREAN",
) {
  await requireAuth();
  const countSelect = {
    _count: { select: { items: true, children: true } },
  } as const;
  try {
    return await prisma.webtoonCollection.findMany({
      // 과목 스코프(항상 적용) — 국어/영어 폴더 완전 분리. 기존(subject null)
      // 폴더는 전부 영어로 간주돼 영어 목록에 그대로 남는다(무회귀).
      where: { academyId, ...buildCollectionSubjectScopeWhere(subject) },
      include: countSelect,
      orderBy: { name: "asc" },
    });
  } catch (error) {
    // 우아한 강등 — DB 에 subject 컬럼이 아직 없으면(P2022, surgical ALTER 이전)
    // 레거시(과목 미분리·공유 폴더) 목록으로 폴백한다. subject 를 SELECT 하지
    // 않도록 명시 select 로 재조회하고, 반환 형태는 subject:null 로 맞춘다.
    if (!isMissingColumnError(error)) throw error;
    const rows = await prisma.webtoonCollection.findMany({
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

export async function createWebtoonCollection(data: {
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
    const collection = await prisma.webtoonCollection.create({
      data: {
        ...baseData,
        ...(data.subject ? { subject: data.subject } : {}),
      },
      // RETURNING 에서 subject 를 빼 컬럼 미반영 DB(P2022)에서도 영어 경로
      // 생성이 절대 깨지지 않게 한다(반환값은 id 만 사용).
      select: { id: true },
    });
    revalidatePath(WEBTOON_LIBRARY_PATH);
    if (data.subject === "KOREAN") revalidatePath(KOREAN_WEBTOON_LIBRARY_PATH);
    return { success: true as const, id: collection.id };
  } catch (error) {
    // 우아한 강등 — 국어 스코프 생성인데 subject 컬럼이 아직 없으면(P2022)
    // 레거시(공유) 폴더로라도 생성한다. ALTER 이전 환경에서 502 대신 동작 유지.
    if (data.subject && isMissingColumnError(error)) {
      try {
        const collection = await prisma.webtoonCollection.create({
          data: baseData,
          select: { id: true },
        });
        revalidatePath(WEBTOON_LIBRARY_PATH);
        revalidatePath(KOREAN_WEBTOON_LIBRARY_PATH);
        return { success: true as const, id: collection.id };
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : "폴더 생성 실패";
        return { success: false as const, error: message };
      }
    }
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
