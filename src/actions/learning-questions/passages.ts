"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, type ActionResult, type SuneungPassageData } from "./_helpers";

// ---------------------------------------------------------------------------
// 수능링고 지문 CRUD
// ---------------------------------------------------------------------------

export async function createSuneungPassage(
  data: SuneungPassageData
): Promise<ActionResult & { id?: string }> {
  try {
    await requireAuth();

    const passage = await prisma.suneungPassage.create({
      data: {
        title: data.title,
        content: data.content,
        source: data.source || null,
        grade: data.grade,
        year: data.year || null,
        examType: data.examType || null,
        difficulty: data.difficulty || null,
        tags: data.tags || null,
      },
    });

    return { success: true, id: passage.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "지문 생성 실패";
    return { success: false, error: message };
  }
}

export async function getSuneungPassages(filters?: {
  grade?: number;
  search?: string;
}) {
  await requireAuth();

  const where: Record<string, unknown> = {};
  if (filters?.grade) where.grade = filters.grade;
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { content: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return prisma.suneungPassage.findMany({
    where,
    include: {
      analysis: { select: { id: true } },
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
