"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireAuth, getAcademyId } from "./_helpers";
import { buildCanonicalSentenceInsertOptionsFrom } from "@/lib/sentence-insert-options";
import { buildGeneratedQuestionText } from "@/lib/question-generation-persistence";
import {
  getQuestionGenerationPlanFromTags,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import type {
  WorkbenchQuestionFilters,
  ActionResult,
  SaveQuestionData,
} from "./_types";

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeQuestionTextForCompare(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof rawTags !== "string") return [];
  const trimmed = rawTags.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  } catch {
    // Fall through to comma-separated tag parsing.
  }

  return trimmed
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function readGenerationPlanFromStructuredData(
  structuredData: unknown,
): QuestionGenerationPlan | null {
  if (!isRecord(structuredData)) return null;
  const plan = structuredData._generationPlan;
  return plan === "PREMIUM" || plan === "STANDARD"
    ? normalizeQuestionGenerationPlan(plan)
    : null;
}

function enrichGeneratedQuestionPlanMetadata(q: SaveQuestionData) {
  const incomingTags = readQuestionTags(q.tags);
  const plan =
    readGenerationPlanFromStructuredData(q.structuredData) ??
    getQuestionGenerationPlanFromTags(incomingTags);
  const tags = plan
    ? mergeQuestionGenerationPlanTag(incomingTags, plan)
    : incomingTags;
  const structuredData =
    plan && isRecord(q.structuredData)
      ? { ...q.structuredData, _generationPlan: plan, tags }
      : q.structuredData;

  return { tags, structuredData };
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
    return buildCanonicalSentenceInsertOptionsFrom(options);
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

    // Use $transaction to batch all question + explanation creates in one roundtrip.
    // 명시적 timeout 필수: 옵션을 안 주면 Prisma 기본 5s interactive tx 라, 문항 수가
    // 많거나 모델이 느릴 때(특히 PREMIUM) question+explanation create 루프가 5s를 넘겨
    // "Transaction not found / already closed" 롤백 → 생성 성공분 전체 유실로 이어졌다.
    // 백그라운드 잡 저장(saveGeneratedQuestionsForJob)과 동일한 30s 상한으로 맞춘다.
    await prisma.$transaction(async (tx) => {
      for (const q of questions) {
        const planMetadata = enrichGeneratedQuestionPlanMetadata(q);
        const question = await tx.question.create({
          data: {
            academyId,
            passageId: q.passageId || null,
            type: q.type,
            subType: q.subType || null,
            questionText: q.questionText || "",
            structuredData: toPrismaJson(planMetadata.structuredData),
            options: stringifyOptionsForCreate(q.subType || null, q.options),
            correctAnswer: q.correctAnswer || "",
            points: q.points || 1,
            difficulty: q.difficulty || "INTERMEDIATE",
            tags: planMetadata.tags.length > 0
              ? JSON.stringify(planMetadata.tags)
              : null,
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
    }, { maxWait: 10_000, timeout: QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS });

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

    // 직접 수정 반영을 위해 항상 현재 스냅샷을 읽는다. AI 생성 문제의 카드는
    // structuredData(JSON 컬럼)로 렌더되므로, flat 컬럼만 갱신하면 검수 화면에
    // 편집이 보이지 않는다(직접수정 미반영 버그). 여기서 스냅샷을 함께 맞춘다.
    const currentQuestion = await prisma.question.findUnique({
      where: { id: questionId },
      select: { tags: true, structuredData: true },
    });
    const incomingTags =
      data.tags !== undefined ? readQuestionTags(data.tags) : undefined;
    const existingTags = readQuestionTags(currentQuestion?.tags);
    const metadataStructuredData =
      data.structuredData !== undefined
        ? data.structuredData
        : currentQuestion?.structuredData;
    const plan =
      readGenerationPlanFromStructuredData(metadataStructuredData) ??
      getQuestionGenerationPlanFromTags(incomingTags ?? existingTags);
    const updateTags =
      incomingTags !== undefined
        ? plan
          ? mergeQuestionGenerationPlanTag(incomingTags, plan)
          : incomingTags
        : undefined;

    // ── structuredData / questionText 재조정 ──
    // 1) 명시 structuredData 가 오면 기존 경로(플랜 메타 보정).
    // 2) 직접 수정(구조화 문제, structuredData 미전달): 옵션/정답/난이도/해설을
    //    스냅샷에 병합해 구조화 렌더를 유지하고 편집을 반영. 단, 발문/지문 텍스트를
    //    자유 편집한 경우(파생 questionText 와 불일치) 구조화 하위필드로 역매핑이
    //    불가하므로 스냅샷의 _typeId 를 떼어 카드가 편집된 flat 컬럼으로 렌더하게 한다.
    let finalStructuredData: Prisma.InputJsonValue | undefined;
    let finalQuestionText: string | undefined = data.questionText;

    const existingSnapshot = currentQuestion?.structuredData;
    if (data.structuredData !== undefined) {
      finalStructuredData = toPrismaJson(
        plan && isRecord(data.structuredData)
          ? {
              ...data.structuredData,
              _generationPlan: plan,
              tags:
                updateTags ?? mergeQuestionGenerationPlanTag(existingTags, plan),
            }
          : data.structuredData,
      );
    } else if (
      isRecord(existingSnapshot) &&
      typeof existingSnapshot._typeId === "string"
    ) {
      const merged: Record<string, unknown> = { ...existingSnapshot };
      if (data.options !== undefined) {
        const edited = Array.isArray(data.options) ? data.options : [];
        const existingOpts = Array.isArray(existingSnapshot.options)
          ? (existingSnapshot.options as unknown[])
          : [];
        // 편집된 옵션이 이미 정본(label/text + slotValues/blankValues 등 하위필드)을
        // 담고 있다(폼 initialOptions = JSON.parse(options 플랫컬럼), updateOptionText 가
        // {...o} 로 보존). 따라서 편집 객체를 그대로 신뢰하고(=재정렬 시 하위필드도
        // 함께 이동), base 는 신규 추가 옵션이 빠뜨린 필드만 백필. 인덱스-zip 으로
        // base 의 하위필드를 덮어쓰면 재정렬 시 slotValues 가 엉뚱한 선지에 붙는다.
        merged.options = edited.map((opt, i) => {
          const base = isRecord(existingOpts[i])
            ? (existingOpts[i] as Record<string, unknown>)
            : {};
          return { ...base, ...(opt as Record<string, unknown>) };
        });
      }
      if (data.correctAnswer !== undefined)
        merged.correctAnswer = data.correctAnswer;
      if (data.difficulty !== undefined) merged.difficulty = data.difficulty;
      if (data.explanation !== undefined) merged.explanation = data.explanation;
      if (data.keyPoints !== undefined) merged.keyPoints = data.keyPoints;
      if (data.wrongOptionExplanations !== undefined)
        merged.wrongOptionExplanations = data.wrongOptionExplanations;
      if (plan) merged._generationPlan = plan;
      if (updateTags !== undefined) merged.tags = updateTags;

      const derivedText = buildGeneratedQuestionText(merged);
      const userEditedQuestionText =
        data.questionText !== undefined &&
        normalizeQuestionTextForCompare(data.questionText) !==
          normalizeQuestionTextForCompare(derivedText);

      if (userEditedQuestionText) {
        finalStructuredData = toPrismaJson({
          ...(plan ? { _generationPlan: plan } : {}),
          ...(updateTags !== undefined
            ? { tags: updateTags }
            : existingSnapshot.tags
              ? { tags: existingSnapshot.tags }
              : {}),
          _manualEditedFlat: true,
        });
        finalQuestionText = data.questionText;
      } else {
        finalStructuredData = toPrismaJson(merged);
        finalQuestionText = derivedText;
      }
    } else {
      // 레거시/수동 문제(스냅샷 없음) — 기존 동작(flat 컬럼만 갱신).
      finalStructuredData = undefined;
    }

    await prisma.question.update({
      where: { id: questionId },
      data: {
        type: data.type,
        subType: data.subType,
        questionText: finalQuestionText,
        structuredData: finalStructuredData,
        options: stringifyOptionsForUpdate(data.subType, data.options),
        correctAnswer: data.correctAnswer,
        points: data.points,
        difficulty: data.difficulty,
        tags: updateTags !== undefined ? JSON.stringify(updateTags) : undefined,
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
