"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireAuth, getAcademyId } from "./_helpers";
import { buildCanonicalSentenceInsertOptions } from "@/lib/sentence-insert-options";
import type {
  WorkbenchQuestionFilters,
  ActionResult,
  SaveQuestionData,
} from "./_types";

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildWorkbenchQuestionWhere(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = { academyId };

  // 장문 세트 members render only as a set (their passage is stored as anchors, not
  // baked into questionText), so they must NOT appear as standalone bank cards.
  where.inSet = false;

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

  return where;
}

function revalidateQuestionBankPaths() {
  revalidatePath("/director/questions");
  revalidatePath("/director/workbench/questions");
  revalidatePath("/director/workbench");
}

function normalizeOptionsForSubtype(
  subType: string | null | undefined,
  options: SaveQuestionData["options"] | string | undefined,
) {
  if (subType === "SENTENCE_INSERT") {
    return buildCanonicalSentenceInsertOptions();
  }
  return options;
}

function stringifyOptionsForCreate(
  subType: string | null | undefined,
  options: SaveQuestionData["options"] | string | undefined,
) {
  const normalizedOptions = normalizeOptionsForSubtype(subType, options);
  return typeof normalizedOptions === "string"
    ? normalizedOptions
    : normalizedOptions
      ? JSON.stringify(normalizedOptions)
      : null;
}

function stringifyOptionsForUpdate(
  subType: string | null | undefined,
  options: SaveQuestionData["options"] | undefined,
) {
  if (options === undefined && subType !== "SENTENCE_INSERT") return undefined;
  return JSON.stringify(normalizeOptionsForSubtype(subType, options));
}

// Returns the ids actually deleted (academy-owned + existing) — callers tombstone
// exactly these, never the full request, so a partial delete can't hide surviving rows.
async function deleteQuestionsForAcademy(
  questionIds: string[],
  academyId: string,
): Promise<string[]> {
  const uniqueIds = [...new Set(questionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const ownedQuestions = await prisma.question.findMany({
    where: { id: { in: uniqueIds }, academyId },
    select: { id: true },
  });
  const ownedIds = ownedQuestions.map((question) => question.id);
  if (ownedIds.length === 0) return [];

  const questionIdWhere = { questionId: { in: ownedIds } };

  await prisma.$transaction([
    prisma.examQuestion.deleteMany({ where: questionIdWhere }),
    prisma.wrongAnswerLog.deleteMany({ where: questionIdWhere }),
    prisma.aIConversation.deleteMany({ where: questionIdWhere }),
    prisma.questionCollectionItem.deleteMany({ where: questionIdWhere }),
    prisma.questionExplanation.deleteMany({ where: questionIdWhere }),
    prisma.question.deleteMany({
      where: { id: { in: ownedIds }, academyId },
    }),
  ]);

  return ownedIds;
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

  const where = buildWorkbenchQuestionWhere(academyId, filters);

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
        examLinks: {
          select: { exam: { select: { id: true, title: true } } },
        },
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
 * Aggregate question counts by review status (전체/미검수/검수완료) for the
 * status segmented control. Respects all active filters EXCEPT `approved`
 * (which the control itself owns), so the three counts always sum to "전체".
 */
export async function getWorkbenchQuestionStatusCounts(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
) {
  await requireAuth();

  const { approved: _ignored, ...rest } = filters ?? {};
  const where = buildWorkbenchQuestionWhere(academyId, rest);

  const grouped = await prisma.question.groupBy({
    by: ["approved"],
    where,
    _count: { _all: true },
  });

  let approved = 0;
  let pending = 0;
  for (const row of grouped) {
    if (row.approved) approved += row._count._all;
    else pending += row._count._all;
  }

  return { all: approved + pending, pending, approved };
}

/**
 * Returns passages that have
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

  const questionWhere = buildWorkbenchQuestionWhere(academyId, filters);

  const passageWhere: Record<string, unknown> = {
    academyId,
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
            examLinks: {
              select: { exam: { select: { id: true, title: true } } },
            },
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

export async function getWorkbenchQuestionIds(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
  options?: { passageOnly?: boolean },
): Promise<{ success: boolean; ids: string[]; count: number; error?: string }> {
  try {
    const staff = await requireAuth();
    if (staff.academyId !== academyId) {
      return {
        success: false,
        ids: [],
        count: 0,
        error: "학원 정보가 일치하지 않습니다.",
      };
    }

    const where = buildWorkbenchQuestionWhere(staff.academyId, filters);
    if (options?.passageOnly && !filters?.passageId) {
      where.passageId = { not: null };
    }

    const questions = await prisma.question.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    const ids = questions.map((question) => question.id);

    return { success: true, ids, count: ids.length };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 목록을 불러오는 중 오류가 발생했습니다.";
    return { success: false, ids: [], count: 0, error: message };
  }
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
        },
        select: { id: true },
      });
      if (eligiblePassages.length !== passageIds.length) {
        return {
          success: false,
          error: "지문을 찾을 수 없어 문제 저장에 사용할 수 없습니다.",
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
            options: stringifyOptionsForCreate(q.subType || null, q.options),
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

    revalidateQuestionBankPaths();
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
        options: stringifyOptionsForUpdate(data.subType, data.options),
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

    revalidateQuestionBankPaths();
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
    const staff = await requireAuth();

    const deletedIds = await deleteQuestionsForAcademy([questionId], staff.academyId);
    if (deletedIds.length === 0) {
      return { success: false, error: "문제를 찾을 수 없습니다." };
    }

    revalidateQuestionBankPaths();
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// Bulk delete: scoped to caller's academy so cross-tenant ids silently no-op
// instead of erroring out the whole batch.
export async function bulkDeleteWorkbenchQuestions(
  questionIds: string[],
): Promise<{
  success: boolean;
  requested: number;
  deleted: number;
  deletedIds: string[];
  error?: string;
}> {
  try {
    const staff = await requireAuth();
    if (questionIds.length === 0) {
      return { success: true, requested: 0, deleted: 0, deletedIds: [] };
    }
    const deletedIds = await deleteQuestionsForAcademy(questionIds, staff.academyId);
    revalidateQuestionBankPaths();
    return {
      success: true,
      requested: questionIds.length,
      deleted: deletedIds.length,
      deletedIds,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 삭제 중 오류가 발생했습니다.";
    return {
      success: false,
      requested: questionIds.length,
      deleted: 0,
      deletedIds: [],
      error: message,
    };
  }
}

export async function approveWorkbenchQuestion(
  questionId: string
): Promise<ActionResult> {
  try {
    const staff = await requireAuth();

    const updated = await prisma.question.updateMany({
      where: { id: questionId, academyId: staff.academyId },
      data: { approved: true },
    });
    if (updated.count === 0) {
      return { success: false, error: "문제를 찾을 수 없습니다." };
    }

    revalidateQuestionBankPaths();
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 승인 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function unapproveWorkbenchQuestion(
  questionId: string
): Promise<ActionResult> {
  try {
    const staff = await requireAuth();

    const updated = await prisma.question.updateMany({
      where: { id: questionId, academyId: staff.academyId },
      data: { approved: false },
    });
    if (updated.count === 0) {
      return { success: false, error: "문제를 찾을 수 없습니다." };
    }

    revalidateQuestionBankPaths();
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "검수취소 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function bulkApproveWorkbenchQuestions(
  questionIds: string[],
): Promise<{
  success: boolean;
  requested: number;
  approved: number;
  approvedIds: string[];
  error?: string;
}> {
  try {
    const staff = await requireAuth();
    const uniqueIds = [...new Set(questionIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return {
        success: true,
        requested: 0,
        approved: 0,
        approvedIds: [],
      };
    }

    const ownedQuestions = await prisma.question.findMany({
      where: { id: { in: uniqueIds }, academyId: staff.academyId },
      select: { id: true },
    });
    const ownedIds = ownedQuestions.map((question) => question.id);

    if (ownedIds.length === 0) {
      return {
        success: false,
        requested: uniqueIds.length,
        approved: 0,
        approvedIds: [],
        error: "문제를 찾을 수 없습니다.",
      };
    }

    await prisma.question.updateMany({
      where: { id: { in: ownedIds }, academyId: staff.academyId },
      data: { approved: true },
    });

    revalidateQuestionBankPaths();
    return {
      success: true,
      requested: uniqueIds.length,
      approved: ownedIds.length,
      approvedIds: ownedIds,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 일괄 승인 중 오류가 발생했습니다.";
    return {
      success: false,
      requested: questionIds.length,
      approved: 0,
      approvedIds: [],
      error: message,
    };
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

    revalidateQuestionBankPaths();
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "중요 표시 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
