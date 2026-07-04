"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";
import {
  buildCollectionSubjectScopeWhere,
  isMissingColumnError,
} from "./_collection-where";

// ---------------------------------------------------------------------------
// Question Collections (playlist-style)
// ---------------------------------------------------------------------------

export async function getQuestionCollections(
  academyId: string,
  opts?: {
    /** 과목 스코프 — "KOREAN"=국어 폴더만 / 미지정=영어 기본(국어 폴더 제외). */
    subject?: "KOREAN";
  },
) {
  await requireAuth();
  // 폴더 "N개" 배지 — 지문 세트는 멤버 N개가 아니라 "세트 1개"로 센다(일반 문제와 동일한 시각 단위).
  // 삭제(휴지통) 문제 제외. items._count(prisma)는 distinct setId 를 못 세므로 JS 로 집계.
  const items = await prisma.questionCollectionItem.findMany({
    where: { collection: { academyId }, question: { deletedAt: null } },
    select: {
      collectionId: true,
      question: { select: { inSet: true, setId: true } },
    },
  });
  const regularByCol = new Map<string, number>();
  const setsByCol = new Map<string, Set<string>>();
  for (const it of items) {
    const q = it.question;
    if (q.setId) {
      let s = setsByCol.get(it.collectionId);
      if (!s) {
        s = new Set<string>();
        setsByCol.set(it.collectionId, s);
      }
      s.add(q.setId);
    } else {
      regularByCol.set(
        it.collectionId,
        (regularByCol.get(it.collectionId) ?? 0) + 1,
      );
    }
  }
  const itemCountFor = (id: string) =>
    (regularByCol.get(id) ?? 0) + (setsByCol.get(id)?.size ?? 0);

  // children 카운트는 prisma 로. items 는 위 세트-인식 집계로 덮어쓴다.
  const childrenSelect = { _count: { select: { children: true } } } as const;
  try {
    const collections = await prisma.questionCollection.findMany({
      // 과목 스코프(항상 적용) — 국어/영어 폴더 완전 분리. 기존(subject null)
      // 폴더는 전부 영어로 간주돼 영어 목록에 그대로 남는다(무회귀).
      where: { academyId, ...buildCollectionSubjectScopeWhere(opts?.subject) },
      include: childrenSelect,
      orderBy: { name: "asc" },
    });
    return collections.map((c) => ({
      ...c,
      _count: {
        children: c._count.children,
        items: itemCountFor(c.id),
      },
    }));
  } catch (error) {
    // 우아한 강등 — DB 에 subject 컬럼이 아직 없으면(P2022, surgical ALTER 이전)
    // 레거시(과목 미분리·공유 폴더) 목록으로 폴백한다. subject 를 SELECT 하지
    // 않도록 명시 select 로 재조회하고, 반환 형태는 subject:null 로 맞춘다.
    if (!isMissingColumnError(error)) throw error;
    const rows = await prisma.questionCollection.findMany({
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
        ...childrenSelect,
      },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      ...row,
      subject: null as string | null,
      _count: {
        children: row._count.children,
        items: itemCountFor(row.id),
      },
    }));
  }
}

/**
 * Returns the question-collection membership graph for an academy as
 * { collectionId: questionId[] }. Client-callable analogue of the inline
 * prisma.questionCollectionItem.findMany the question-management page runs
 * server-side. Academy-scoped: never leaks another tenant's membership.
 */
export async function getAcademyQuestionCollectionMembership(
  academyId: string,
): Promise<Record<string, string[]>> {
  const session = await requireAuth();
  if (session.academyId !== academyId) return {};
  const items = await prisma.questionCollectionItem.findMany({
    // 휴지통 가드 — 삭제된 문제는 멤버십(폴더 카운트 파생)에서 제외(page.tsx 인라인 쿼리와 일치).
    where: { collection: { academyId }, question: { deletedAt: null } },
    select: { collectionId: true, questionId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.questionId);
  }
  return membership;
}

export async function createQuestionCollection(data: {
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
  /** 폴더 과목 — "KOREAN"=국어 라우트에서 생성. 미지정=영어(INSERT 에 subject 미포함, 무회귀). */
  subject?: "KOREAN";
}) {
  const staff = await requireAuth();
  const baseData = {
    academyId: staff.academyId,
    name: data.name,
    description: data.description || null,
    parentId: data.parentId || null,
    color: data.color || null,
  };
  try {
    const collection = await prisma.questionCollection.create({
      data: {
        ...baseData,
        ...(data.subject ? { subject: data.subject } : {}),
      },
      // RETURNING 에서 subject 를 빼 컬럼 미반영 DB(P2022)에서도 영어 경로
      // 생성이 절대 깨지지 않게 한다(반환값은 id 만 사용).
      select: { id: true },
    });
    revalidatePath("/director/questions");
    if (data.subject === "KOREAN") revalidatePath("/director/korean/questions");
    return { success: true as const, id: collection.id };
  } catch (error) {
    // 우아한 강등 — 국어 스코프 생성인데 subject 컬럼이 아직 없으면(P2022)
    // 레거시(공유) 폴더로라도 생성한다. ALTER 이전 환경에서 502 대신 동작 유지.
    if (data.subject && isMissingColumnError(error)) {
      try {
        const collection = await prisma.questionCollection.create({
          data: baseData,
          select: { id: true },
        });
        revalidatePath("/director/questions");
        revalidatePath("/director/korean/questions");
        return { success: true as const, id: collection.id };
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : "컬렉션 생성 실패";
        return { success: false as const, error: message };
      }
    }
    const message =
      error instanceof Error ? error.message : "컬렉션 생성 실패";
    return { success: false as const, error: message };
  }
}

export async function updateQuestionCollection(
  collectionId: string,
  data: { name?: string; description?: string }
) {
  await requireAuth();
  try {
    await prisma.questionCollection.update({
      where: { id: collectionId },
      data,
      // RETURNING 최소화 — subject 컬럼 미반영 DB에서도 이름변경이 깨지지 않게.
      select: { id: true },
    });
    revalidatePath("/director/questions");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deleteQuestionCollection(collectionId: string) {
  await requireAuth();
  try {
    await prisma.questionCollection.delete({
      where: { id: collectionId },
      // RETURNING 최소화 — subject 컬럼 미반영 DB에서도 삭제가 깨지지 않게.
      select: { id: true },
    });
    revalidatePath("/director/questions");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 삭제 실패";
    return { success: false as const, error: message };
  }
}

export async function addQuestionsToCollection(
  collectionId: string,
  questionIds: string[]
) {
  await requireAuth();
  try {
    // Compute the items that will ACTUALLY be inserted (not already present)
    // so the caller can reconcile its optimistic UI counts with the DB. Using
    // skipDuplicates alone hides this — createMany never reports which rows it
    // skipped — so the client would over-count.
    const existing = await prisma.questionCollectionItem.findMany({
      where: { collectionId, questionId: { in: questionIds } },
      select: { questionId: true },
    });
    const existingSet = new Set(existing.map((e) => e.questionId));
    const addedIds = [...new Set(questionIds)].filter(
      (id) => !existingSet.has(id),
    );
    if (addedIds.length === 0) {
      return { success: true as const, addedIds: [] as string[] };
    }

    const maxItem = await prisma.questionCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.questionCollectionItem.createMany({
      data: addedIds.map((questionId, idx) => ({
        collectionId,
        questionId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/questions");
    return { success: true as const, addedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 추가 실패";
    return { success: false as const, error: message };
  }
}

export async function removeQuestionsFromCollection(
  collectionId: string,
  questionIds: string[]
) {
  await requireAuth();
  try {
    // Resolve which of the requested items are actually in the collection so
    // the caller can reconcile counts against the DB (the rest were never
    // members and must not be counted as removals).
    const existing = await prisma.questionCollectionItem.findMany({
      where: { collectionId, questionId: { in: questionIds } },
      select: { questionId: true },
    });
    const removedIds = existing.map((e) => e.questionId);
    if (removedIds.length === 0) {
      return { success: true as const, removedIds: [] as string[] };
    }

    await prisma.questionCollectionItem.deleteMany({
      where: {
        collectionId,
        questionId: { in: removedIds },
      },
    });
    revalidatePath("/director/questions");
    return { success: true as const, removedIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 제거 실패";
    return { success: false as const, error: message };
  }
}
