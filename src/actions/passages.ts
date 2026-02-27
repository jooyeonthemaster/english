"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PassageFilters {
  grade?: number;
  semester?: string;
  search?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

interface PassageData {
  schoolId: string;
  title: string;
  content: string;
  source?: string;
  grade: number;
  semester: string;
  unit?: string;
  notes?: { noteType: string; content: string }[];
}

interface PassageNoteData {
  noteType: string;
  content: string;
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
// Passage CRUD
// ---------------------------------------------------------------------------

export async function getPassages(schoolId: string, filters?: PassageFilters) {
  await requireAuth();

  const where: Record<string, unknown> = { schoolId };

  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.search) {
    where.title = { contains: filters.search };
  }

  const passages = await prisma.passage.findMany({
    where,
    include: {
      _count: { select: { notes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return passages;
}

export async function getPassage(passageId: string) {
  await requireAuth();

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    include: {
      notes: { orderBy: { order: "asc" } },
      school: true,
    },
  });

  return passage;
}

export async function createPassage(data: PassageData): Promise<ActionResult> {
  try {
    await requireAuth();

    const passage = await prisma.passage.create({
      data: {
        schoolId: data.schoolId,
        title: data.title,
        content: data.content,
        source: data.source || null,
        grade: data.grade,
        semester: data.semester,
        unit: data.unit || null,
      },
    });

    if (data.notes && data.notes.length > 0) {
      await prisma.passageNote.createMany({
        data: data.notes.map((note, index) => ({
          passageId: passage.id,
          noteType: note.noteType,
          content: note.content,
          order: index,
        })),
      });
    }

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updatePassage(
  id: string,
  data: Partial<PassageData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passage.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        source: data.source,
        grade: data.grade,
        semester: data.semester,
        unit: data.unit,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deletePassage(id: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passage.delete({ where: { id } });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// PassageNote CRUD
// ---------------------------------------------------------------------------

export async function createPassageNote(
  passageId: string,
  data: PassageNoteData
): Promise<ActionResult> {
  try {
    await requireAuth();

    const maxOrder = await prisma.passageNote.findFirst({
      where: { passageId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    await prisma.passageNote.create({
      data: {
        passageId,
        noteType: data.noteType,
        content: data.content,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "노트 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updatePassageNote(
  id: string,
  data: PassageNoteData
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passageNote.update({
      where: { id },
      data: {
        noteType: data.noteType,
        content: data.content,
      },
    });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "노트 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deletePassageNote(id: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passageNote.delete({ where: { id } });

    revalidatePath("/admin/schools");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "노트 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
