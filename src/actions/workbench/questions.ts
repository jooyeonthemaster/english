"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireAuth, getAcademyId } from "./_helpers";
import type {
  WorkbenchQuestionFilters,
  ActionResult,
  SaveQuestionData,
} from "./_types";

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

  if (filters?.type) {
    // Support comma-separated multi-type: "MULTIPLE_CHOICE,SHORT_ANSWER"
    const types = filters.type.split(",").filter(Boolean);
    where.type = types.length > 1 ? { in: types } : types[0];
  }
  if (filters?.subType) {
    // Support comma-separated multi-subtype: "BLANK_INFERENCE,GRAMMAR_ERROR"
    const subs = filters.subType.split(",").filter(Boolean);
    where.subType = subs.length > 1 ? { in: subs } : subs[0];
  }
  if (filters?.difficulty) where.difficulty = filters.difficulty;
  if (filters?.passageId) where.passageId = filters.passageId;
  if (filters?.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters?.tags) where.tags = { contains: filters.tags };
  if (filters?.aiGenerated !== undefined) where.aiGenerated = filters.aiGenerated;
  if (filters?.approved !== undefined) where.approved = filters.approved;
  if (filters?.starred !== undefined) where.starred = filters.starred;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  // Build orderBy based on sort param
  const DIFFICULTY_ORDER_DESC = ["KILLER", "INTERMEDIATE", "BASIC"];
  const DIFFICULTY_ORDER_ASC = ["BASIC", "INTERMEDIATE", "KILLER"];
  let orderBy: Prisma.QuestionOrderByWithRelationInput | Prisma.QuestionOrderByWithRelationInput[] = { createdAt: "desc" }; // default: newest first
  if (filters?.sort === "oldest") {
    orderBy = { createdAt: "asc" as const };
  } else if (filters?.sort === "starred") {
    orderBy = [{ starred: "desc" as const }, { createdAt: "desc" as const }];
  }
  // For difficulty sorts, we still use createdAt ordering at DB level
  // and sort in-memory since Prisma doesn't support custom enum ordering.
  // However, for simplicity, we use a raw approach with orderBy on the field.
  const needsDifficultySort = filters?.sort === "difficulty_desc" || filters?.sort === "difficulty_asc";

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
      orderBy: needsDifficultySort ? { createdAt: "desc" as const } : orderBy,
      skip,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  // In-memory sort for difficulty (since it's a string enum, not natively orderable)
  if (needsDifficultySort) {
    const order = filters?.sort === "difficulty_desc" ? DIFFICULTY_ORDER_DESC : DIFFICULTY_ORDER_ASC;
    questions.sort((a, b) => {
      const ai = order.indexOf(a.difficulty);
      const bi = order.indexOf(b.difficulty);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  return { questions, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Returns analyzed passages (passages with a PassageAnalysis row) that have
 * at least one question matching the filters, paginated by passage. Each
 * passage carries its matching questions inline. Used by the "지문별" view
 * on /director/workbench/questions.
 */
export async function getWorkbenchQuestionsGroupedByPassage(
  academyId: string,
  filters?: WorkbenchQuestionFilters
) {
  await requireAuth();

  const page = filters?.page || 1;
  const limit = filters?.limit || 10; // passages per page
  const skip = (page - 1) * limit;

  const questionWhere: Record<string, unknown> = {};

  if (filters?.type) {
    const types = filters.type.split(",").filter(Boolean);
    questionWhere.type = types.length > 1 ? { in: types } : types[0];
  }
  if (filters?.subType) {
    const subs = filters.subType.split(",").filter(Boolean);
    questionWhere.subType = subs.length > 1 ? { in: subs } : subs[0];
  }
  if (filters?.difficulty) questionWhere.difficulty = filters.difficulty;
  if (filters?.aiGenerated !== undefined)
    questionWhere.aiGenerated = filters.aiGenerated;
  if (filters?.approved !== undefined) questionWhere.approved = filters.approved;
  if (filters?.starred !== undefined) questionWhere.starred = filters.starred;
  if (filters?.search) {
    questionWhere.questionText = {
      contains: filters.search,
      mode: "insensitive",
    };
  }
  if (filters?.collectionId) {
    questionWhere.collectionItems = {
      some: { collectionId: filters.collectionId },
    };
  }
  if (filters?.tags) {
    questionWhere.tags = { contains: filters.tags };
  }

  const passageWhere: Record<string, unknown> = {
    academyId,
    analysis: { isNot: null },
    questions: { some: questionWhere },
  };

  const [rawPassages, total] = await Promise.all([
    prisma.passage.findMany({
      where: passageWhere,
      select: {
        id: true,
        title: true,
        grade: true,
        semester: true,
        unit: true,
        publisher: true,
        updatedAt: true,
        school: { select: { id: true, name: true } },
        analysis: { select: { id: true, updatedAt: true } },
        _count: { select: { questions: true } },
        questions: {
          where: questionWhere,
          include: {
            explanation: true,
            _count: { select: { examLinks: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.passage.count({ where: passageWhere }),
  ]);

  // Re-shape so each question has a `passage` field (mirroring the flat-mode
  // QuestionItem shape that QuestionBankCard expects).
  const passages = rawPassages.map((p) => {
    const passageSummary = {
      id: p.id,
      title: p.title,
      content: "",
      grade: p.grade,
      semester: p.semester,
      publisher: p.publisher,
      school: p.school,
    };
    return {
      id: p.id,
      title: p.title,
      grade: p.grade,
      semester: p.semester,
      unit: p.unit,
      publisher: p.publisher,
      school: p.school,
      analysis: p.analysis,
      totalQuestionCount: p._count.questions,
      questions: p.questions.map((q) => ({ ...q, passage: passageSummary })),
    };
  });

  return {
    passages,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getWorkbenchQuestion(questionId: string) {
  await requireAuth();

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      passage: {
        select: {
          id: true,
          title: true,
          content: true,
          analysis: { select: { id: true, analysisData: true, updatedAt: true } },
        },
      },
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

    const passageIds = [
      ...new Set(
        questions
          .map((q) => q.passageId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (passageIds.length > 0) {
      const eligiblePassages = await prisma.passage.findMany({
        where: {
          id: { in: passageIds },
          academyId,
          analysis: { isNot: null },
        },
        select: { id: true },
      });
      if (eligiblePassages.length !== passageIds.length) {
        return {
          success: false,
          error: "지문 분석이 완료된 지문만 문제 저장에 사용할 수 있습니다.",
        };
      }
    }

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
            structuredData: toPrismaJson(q.structuredData),
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
        structuredData: toPrismaJson(data.structuredData),
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

export async function toggleQuestionStar(
  questionId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { starred: true },
    });

    if (!question) {
      return { success: false, error: "문제를 찾을 수 없습니다." };
    }

    await prisma.question.update({
      where: { id: questionId },
      data: { starred: !question.starred },
    });

    revalidatePath("/director/questions");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "중요 표시 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
