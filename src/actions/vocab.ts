"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface VocabListFilters {
  grade?: number;
  semester?: string;
  search?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

interface VocabListData {
  schoolId: string;
  title: string;
  grade: number;
  semester: string;
  unit?: string;
}

interface VocabItemData {
  english: string;
  korean: string;
  partOfSpeech?: string;
  exampleEn?: string;
  exampleKr?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("인증이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// VocabularyList CRUD
// ---------------------------------------------------------------------------

export async function getVocabLists(
  schoolId: string,
  filters?: VocabListFilters
) {
  await requireAuth();

  const where: Record<string, unknown> = { schoolId };

  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.search) {
    where.title = { contains: filters.search };
  }

  const lists = await prisma.vocabularyList.findMany({
    where,
    include: {
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return lists;
}

export async function getVocabList(listId: string) {
  await requireAuth();

  const list = await prisma.vocabularyList.findUnique({
    where: { id: listId },
    include: {
      items: { orderBy: { order: "asc" } },
      school: true,
    },
  });

  return list;
}

export async function createVocabList(
  data: VocabListData
): Promise<ActionResult> {
  try {
    await requireAuth();

    const list = await prisma.vocabularyList.create({
      data: {
        schoolId: data.schoolId,
        title: data.title,
        grade: data.grade,
        semester: data.semester,
        unit: data.unit || null,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true, id: list.id };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "단어장 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateVocabList(
  id: string,
  data: Partial<VocabListData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.vocabularyList.update({
      where: { id },
      data: {
        title: data.title,
        grade: data.grade,
        semester: data.semester,
        unit: data.unit,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "단어장 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteVocabList(id: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.vocabularyList.delete({ where: { id } });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "단어장 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// VocabularyItem CRUD
// ---------------------------------------------------------------------------

export async function addVocabItem(
  listId: string,
  data: VocabItemData
): Promise<ActionResult> {
  try {
    await requireAuth();

    const maxOrder = await prisma.vocabularyItem.findFirst({
      where: { listId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    await prisma.vocabularyItem.create({
      data: {
        listId,
        english: data.english,
        korean: data.korean,
        partOfSpeech: data.partOfSpeech || null,
        exampleEn: data.exampleEn || null,
        exampleKr: data.exampleKr || null,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "단어 추가 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateVocabItem(
  id: string,
  data: VocabItemData
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.vocabularyItem.update({
      where: { id },
      data: {
        english: data.english,
        korean: data.korean,
        partOfSpeech: data.partOfSpeech || null,
        exampleEn: data.exampleEn || null,
        exampleKr: data.exampleKr || null,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "단어 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteVocabItem(id: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.vocabularyItem.delete({ where: { id } });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "단어 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function bulkCreateVocabItems(
  listId: string,
  items: VocabItemData[]
): Promise<ActionResult> {
  try {
    await requireAuth();

    const filtered = items.filter(
      (item) => item.english.trim() && item.korean.trim()
    );

    if (filtered.length === 0) {
      return { success: false, error: "등록할 단어가 없습니다." };
    }

    const maxOrder = await prisma.vocabularyItem.findFirst({
      where: { listId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const startOrder = (maxOrder?.order ?? -1) + 1;

    await prisma.vocabularyItem.createMany({
      data: filtered.map((item, index) => ({
        listId,
        english: item.english.trim(),
        korean: item.korean.trim(),
        partOfSpeech: item.partOfSpeech || null,
        exampleEn: item.exampleEn || null,
        exampleKr: item.exampleKr || null,
        order: startOrder + index,
      })),
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "단어 일괄 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
