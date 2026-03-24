"use server";

import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface WorkbenchPassageFilters {
  schoolId?: string;
  grade?: number;
  semester?: string;
  publisher?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WorkbenchQuestionFilters {
  type?: string;
  subType?: string;
  difficulty?: string;
  passageId?: string;
  collectionId?: string;
  tags?: string;
  aiGenerated?: boolean;
  approved?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

interface CreatePassageData {
  title: string;
  content: string;
  schoolId?: string;
  grade?: number;
  semester?: string;
  unit?: string;
  publisher?: string;
  difficulty?: string;
  tags?: string[];
  source?: string;
}

interface SaveQuestionData {
  passageId?: string;
  type: string;
  subType?: string;
  questionText: string;
  options?: { label: string; text: string }[];
  correctAnswer: string;
  points?: number;
  difficulty: string;
  tags?: string[];
  aiGenerated: boolean;
  explanation?: string;
  keyPoints?: string[];
  wrongOptionExplanations?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireAuth() {
  const staff = await getStaffSession();
  if (!staff) throw new Error("인증이 필요합니다.");
  return staff;
}

function getAcademyId(session: { academyId: string }) {
  return session.academyId;
}

// ---------------------------------------------------------------------------
// Passage CRUD (Workbench)
// ---------------------------------------------------------------------------

export async function getWorkbenchPassages(
  academyId: string,
  filters?: WorkbenchPassageFilters
) {
  await requireAuth();

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { academyId };

  if (filters?.schoolId) where.schoolId = filters.schoolId;
  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.publisher) where.publisher = filters.publisher;
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { content: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [passages, total] = await Promise.all([
    prisma.passage.findMany({
      where,
      include: {
        school: { select: { id: true, name: true, type: true } },
        analysis: { select: { id: true, updatedAt: true, analysisData: true } },
        _count: { select: { questions: true, notes: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.passage.count({ where }),
  ]);

  return { passages, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getWorkbenchPassage(passageId: string) {
  await requireAuth();

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    include: {
      school: { select: { id: true, name: true, type: true } },
      notes: { orderBy: { order: "asc" } },
      analysis: true,
      questions: {
        include: { explanation: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return passage;
}

export async function createWorkbenchPassage(
  data: CreatePassageData
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);

    const passage = await prisma.passage.create({
      data: {
        academyId,
        schoolId: data.schoolId || null,
        title: data.title,
        content: data.content,
        source: data.source || null,
        grade: data.grade || null,
        semester: data.semester || null,
        unit: data.unit || null,
        publisher: data.publisher || null,
        difficulty: data.difficulty || null,
        tags: data.tags ? JSON.stringify(data.tags) : null,
      },
    });

    revalidatePath("/director/workbench/passages");
    return { success: true, id: passage.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateWorkbenchPassage(
  passageId: string,
  data: Partial<CreatePassageData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passage.update({
      where: { id: passageId },
      data: {
        title: data.title,
        content: data.content,
        schoolId: data.schoolId || null,
        source: data.source,
        grade: data.grade,
        semester: data.semester,
        unit: data.unit,
        publisher: data.publisher,
        difficulty: data.difficulty,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
      },
    });

    revalidatePath("/director/workbench/passages");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteWorkbenchPassage(
  passageId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passage.delete({ where: { id: passageId } });

    revalidatePath("/director/workbench/passages");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Question Bank CRUD
// ---------------------------------------------------------------------------

export async function getWorkbenchQuestions(
  academyId: string,
  filters?: WorkbenchQuestionFilters
) {
  await requireAuth();

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { academyId };

  if (filters?.type) where.type = filters.type;
  if (filters?.subType) where.subType = filters.subType;
  if (filters?.difficulty) where.difficulty = filters.difficulty;
  if (filters?.passageId) where.passageId = filters.passageId;
  if (filters?.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters?.aiGenerated !== undefined) where.aiGenerated = filters.aiGenerated;
  if (filters?.approved !== undefined) where.approved = filters.approved;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: {
        passage: {
          select: {
            id: true, title: true, content: true,
            grade: true, semester: true, publisher: true,
            school: { select: { id: true, name: true } },
          },
        },
        explanation: true,
        _count: { select: { examLinks: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  return { questions, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getWorkbenchQuestion(questionId: string) {
  await requireAuth();

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      passage: { select: { id: true, title: true, content: true } },
      explanation: true,
    },
  });

  return question;
}

export async function saveGeneratedQuestions(
  questions: SaveQuestionData[]
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);

    // Use $transaction to batch all question + explanation creates in one roundtrip
    await prisma.$transaction(async (tx) => {
      for (const q of questions) {
        const question = await tx.question.create({
          data: {
            academyId,
            passageId: q.passageId || null,
            type: q.type,
            subType: q.subType || null,
            questionText: q.questionText || "",
            options: typeof q.options === "string" ? q.options : q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer || "",
            points: q.points || 1,
            difficulty: q.difficulty || "INTERMEDIATE",
            tags: typeof q.tags === "string" ? q.tags : q.tags ? JSON.stringify(q.tags) : null,
            aiGenerated: q.aiGenerated ?? true,
            approved: false,
          },
        });

        if (q.explanation) {
          await tx.questionExplanation.create({
            data: {
              questionId: question.id,
              content: q.explanation,
              keyPoints: typeof q.keyPoints === "string" ? q.keyPoints : q.keyPoints ? JSON.stringify(q.keyPoints) : null,
              wrongOptionExplanations: typeof q.wrongOptionExplanations === "string" ? q.wrongOptionExplanations : q.wrongOptionExplanations ? JSON.stringify(q.wrongOptionExplanations) : null,
              aiGenerated: q.aiGenerated ?? true,
            },
          });
        }
      }
    });

    revalidatePath("/director/questions");
    revalidatePath("/director/workbench");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 저장 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateWorkbenchQuestion(
  questionId: string,
  data: Partial<SaveQuestionData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.question.update({
      where: { id: questionId },
      data: {
        type: data.type,
        subType: data.subType,
        questionText: data.questionText,
        options: data.options ? JSON.stringify(data.options) : undefined,
        correctAnswer: data.correctAnswer,
        points: data.points,
        difficulty: data.difficulty,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
      },
    });

    if (data.explanation !== undefined) {
      const existing = await prisma.questionExplanation.findUnique({
        where: { questionId },
      });

      if (existing) {
        await prisma.questionExplanation.update({
          where: { questionId },
          data: {
            content: data.explanation || "",
            keyPoints: data.keyPoints ? JSON.stringify(data.keyPoints) : undefined,
            wrongOptionExplanations: data.wrongOptionExplanations
              ? JSON.stringify(data.wrongOptionExplanations)
              : undefined,
          },
        });
      } else if (data.explanation) {
        await prisma.questionExplanation.create({
          data: {
            questionId,
            content: data.explanation,
            keyPoints: data.keyPoints ? JSON.stringify(data.keyPoints) : null,
            wrongOptionExplanations: data.wrongOptionExplanations
              ? JSON.stringify(data.wrongOptionExplanations)
              : null,
            aiGenerated: false,
          },
        });
      }
    }

    revalidatePath("/director/questions");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteWorkbenchQuestion(
  questionId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.question.delete({ where: { id: questionId } });

    revalidatePath("/director/questions");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function approveWorkbenchQuestion(
  questionId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.question.update({
      where: { id: questionId },
      data: { approved: true },
    });

    revalidatePath("/director/questions");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 승인 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getWorkbenchStats(academyId: string) {
  await requireAuth();

  const [
    totalPassages,
    totalQuestions,
    aiGeneratedCount,
    approvedCount,
    recentPassages,
    recentQuestions,
  ] = await Promise.all([
    prisma.passage.count({ where: { academyId } }),
    prisma.question.count({ where: { academyId } }),
    prisma.question.count({ where: { academyId, aiGenerated: true } }),
    prisma.question.count({ where: { academyId, approved: true } }),
    prisma.passage.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        grade: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
    }),
    prisma.question.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        subType: true,
        difficulty: true,
        questionText: true,
        aiGenerated: true,
        approved: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    totalPassages,
    totalQuestions,
    aiGeneratedCount,
    approvedCount,
    recentPassages,
    recentQuestions,
  };
}

// ---------------------------------------------------------------------------
// School list helper (for filters)
// ---------------------------------------------------------------------------

export async function getAcademySchools(academyId: string) {
  await requireAuth();

  return prisma.school.findMany({
    where: { academyId },
    select: { id: true, name: true, type: true, publisher: true },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Passage Analysis — Save edited analysis
// ---------------------------------------------------------------------------

export async function updatePassageAnalysis(
  passageId: string,
  analysisData: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const existing = await prisma.passageAnalysis.findUnique({
      where: { passageId },
    });

    if (!existing) {
      return { success: false, error: "분석 데이터가 존재하지 않습니다." };
    }

    await prisma.passageAnalysis.update({
      where: { passageId },
      data: {
        analysisData,
      },
    });

    revalidatePath(`/director/workbench/passages/${passageId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "분석 데이터 저장 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Question Collections (playlist-style)
// ---------------------------------------------------------------------------

export async function getQuestionCollections(academyId: string) {
  await requireAuth();
  return prisma.questionCollection.findMany({
    where: { academyId },
    include: { _count: { select: { items: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createQuestionCollection(data: {
  name: string;
  description?: string;
}) {
  const staff = await requireAuth();
  try {
    const collection = await prisma.questionCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
      },
    });
    revalidatePath("/director/questions");
    return { success: true as const, id: collection.id };
  } catch (error) {
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
    const maxItem = await prisma.questionCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.questionCollectionItem.createMany({
      data: questionIds.map((questionId, idx) => ({
        collectionId,
        questionId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/questions");
    return { success: true as const };
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
    await prisma.questionCollectionItem.deleteMany({
      where: {
        collectionId,
        questionId: { in: questionIds },
      },
    });
    revalidatePath("/director/questions");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "컬렉션 제거 실패";
    return { success: false as const, error: message };
  }
}
