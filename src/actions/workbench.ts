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
  sourceMaterialId?: string;
  collectionId?: string;
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
  starred?: boolean;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export type PassageAnnotationType = "vocab" | "grammar" | "syntax" | "sentence" | "examPoint";

export interface PassageAnnotationInput {
  id: string; // client-side annotation id (Tiptap mark attr)
  type: PassageAnnotationType;
  text: string;
  memo: string;
  from: number;
  to: number;
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
  annotations?: PassageAnnotationInput[];
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
  if (filters?.sourceMaterialId) where.sourceMaterialId = filters.sourceMaterialId;
  if (filters?.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
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

// ---------------------------------------------------------------------------
// SourceMaterial lookup — lightweight read used to render filter badges when
// /workbench/passages is entered from /import with ?sourceMaterialId=...
// ---------------------------------------------------------------------------
export async function getSourceMaterialSummary(sourceMaterialId: string) {
  const session = await requireAuth();
  const academyId = getAcademyId(session);

  const material = await prisma.sourceMaterial.findFirst({
    where: { id: sourceMaterialId, academyId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      type: true,
      year: true,
      round: true,
      grade: true,
      examType: true,
      publisher: true,
    },
  });

  return material;
}

// ---------------------------------------------------------------------------
// PassageCollection lookup — mirror of getSourceMaterialSummary so the
// /workbench/passages page can verify that a `?collectionId=` deep-link
// actually belongs to the current academy before wiring it into the filter.
// Returns null for cross-academy / deleted ids so the caller can silently
// drop the filter instead of leaking other tenants' data.
// ---------------------------------------------------------------------------
export async function getPassageCollectionSummary(collectionId: string) {
  const session = await requireAuth();
  const academyId = getAcademyId(session);

  return prisma.passageCollection.findFirst({
    where: { id: collectionId, academyId },
    select: { id: true, name: true, color: true },
  });
}

// ---------------------------------------------------------------------------
// Passage → Collection membership map for the current academy.
// Replaces the raw `prisma.passageCollectionItem.findMany` that the page
// component was issuing directly, so all DB access stays inside the action
// layer and we get a single guarded entry point for future scoping tweaks.
// ---------------------------------------------------------------------------
export async function getAcademyPassageCollectionMembership(
  academyId: string
): Promise<Record<string, string[]>> {
  const session = await requireAuth();
  if (session.academyId !== academyId) {
    // Silent isolation — never leak another academy's membership graph.
    return {};
  }
  const items = await prisma.passageCollectionItem.findMany({
    where: { collection: { academyId } },
    select: { collectionId: true, passageId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.passageId);
  }
  return membership;
}

// ---------------------------------------------------------------------------
// Passage → question id list. Used by the "시험에 추가" dialog to convert
// a passage context into the actual question rows that will be linked to
// an Exam (since Exam rows reference Question, not Passage).
// Academy-scoped: only returns ids of questions on a passage this academy
// owns, so a manipulated passageId can't exfiltrate another tenant's bank.
// ---------------------------------------------------------------------------
export async function getPassageQuestionIds(
  passageId: string
): Promise<{ passageId: string; title: string; questionIds: string[] } | null> {
  const session = await requireAuth();
  const academyId = getAcademyId(session);

  const passage = await prisma.passage.findFirst({
    where: { id: passageId, academyId },
    select: {
      id: true,
      title: true,
      questions: { select: { id: true } },
    },
  });
  if (!passage) return null;

  return {
    passageId: passage.id,
    title: passage.title,
    questionIds: passage.questions.map((q) => q.id),
  };
}

// ---------------------------------------------------------------------------
// DRAFT exams list — powers the "기존 시험에 추가" dropdown in the passage
// detail dialog. Only DRAFT status is returned so we never accidentally
// mutate a PUBLISHED exam's question set from a quick-add flow.
// ---------------------------------------------------------------------------
export async function getDraftExamsForPicker(academyId: string) {
  const session = await requireAuth();
  if (session.academyId !== academyId) return [];

  return prisma.exam.findMany({
    where: { academyId, status: "DRAFT" },
    select: {
      id: true,
      title: true,
      type: true,
      examDate: true,
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
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

    const annotationRows = (data.annotations ?? []).map((a, index) => ({
      annotationId: a.id,
      noteType: a.type,
      content: a.text,
      memo: a.memo ?? "",
      highlightStart: a.from,
      highlightEnd: a.to,
      order: index,
    }));

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
        ...(annotationRows.length > 0
          ? { notes: { create: annotationRows } }
          : {}),
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

// ---------------------------------------------------------------------------
// Annotation persistence — separate from passage create so users can edit
// markings on an already-saved passage without re-writing everything.
// Mutating annotations invalidates the cached passage-analysis (stamped hash)
// so the next analysis run re-reads the latest teacher intent.
// ---------------------------------------------------------------------------
export async function getPassageAnnotations(passageId: string) {
  await requireAuth();
  const rows = await prisma.passageNote.findMany({
    where: { passageId },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({
    id: r.annotationId ?? r.id,
    type: (r.noteType as PassageAnnotationType) ?? "vocab",
    text: r.content,
    memo: r.memo ?? "",
    from: r.highlightStart ?? 0,
    to: r.highlightEnd ?? 0,
  }));
}

export async function savePassageAnnotations(
  passageId: string,
  annotations: PassageAnnotationInput[],
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);

    // Guard: passage belongs to this academy
    const passage = await prisma.passage.findFirst({
      where: { id: passageId, academyId },
      select: { id: true },
    });
    if (!passage) {
      return { success: false, error: "지문을 찾을 수 없습니다." };
    }

    const rows = annotations.map((a, index) => ({
      passageId,
      annotationId: a.id,
      noteType: a.type,
      content: a.text,
      memo: a.memo ?? "",
      highlightStart: a.from,
      highlightEnd: a.to,
      order: index,
    }));

    await prisma.$transaction([
      prisma.passageNote.deleteMany({ where: { passageId } }),
      ...(rows.length > 0
        ? [prisma.passageNote.createMany({ data: rows })]
        : []),
      // Invalidate analysis cache — next /api/ai/passage-analysis call will
      // recompute with the updated teacher intent injected via buildAnalysisPrompt.
      prisma.passageAnalysis.updateMany({
        where: { passageId },
        data: { contentHash: `stale-${Date.now()}` },
      }),
    ]);

    revalidatePath("/director/workbench/passages");
    revalidatePath(`/director/workbench/passages/${passageId}`);
    return { success: true, id: passageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "마킹 저장 중 오류가 발생했습니다.";
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
  if (filters?.aiGenerated !== undefined) where.aiGenerated = filters.aiGenerated;
  if (filters?.approved !== undefined) where.approved = filters.approved;
  if (filters?.starred !== undefined) where.starred = filters.starred;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  // Build orderBy based on sort param
  const DIFFICULTY_ORDER_DESC = ["KILLER", "INTERMEDIATE", "BASIC"];
  const DIFFICULTY_ORDER_ASC = ["BASIC", "INTERMEDIATE", "KILLER"];
  let orderBy: any = { createdAt: "desc" as const }; // default: newest first
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
    pendingAnalysisCount,
    analyzedPassageCount,
    recentPassages,
    recentQuestions,
    pendingPassages,
  ] = await Promise.all([
    prisma.passage.count({ where: { academyId } }),
    prisma.question.count({ where: { academyId } }),
    prisma.question.count({ where: { academyId, aiGenerated: true } }),
    prisma.question.count({ where: { academyId, approved: true } }),
    // Passages without analysis
    prisma.passage.count({
      where: { academyId, analysis: null },
    }),
    // Passages with analysis
    prisma.passage.count({
      where: { academyId, analysis: { isNot: null } },
    }),
    prisma.passage.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        grade: true,
        createdAt: true,
        analysis: { select: { id: true } },
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
    // Passages awaiting analysis (for action items)
    prisma.passage.findMany({
      where: { academyId, analysis: null },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        grade: true,
        createdAt: true,
      },
    }),
  ]);

  // Learning question counts (내신링고 + 수능링고)
  const [naeshinCount, suneungCount] = await Promise.all([
    prisma.naeshinQuestion.count({ where: { academyId } }),
    prisma.suneungQuestion.count(),
  ]);

  return {
    totalPassages,
    totalQuestions,
    aiGeneratedCount,
    approvedCount,
    pendingAnalysisCount,
    analyzedPassageCount,
    recentPassages,
    recentQuestions,
    pendingPassages,
    unapprovedCount: totalQuestions - approvedCount,
    totalLearningQuestions: naeshinCount + suneungCount,
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
    include: { _count: { select: { items: true, children: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createQuestionCollection(data: {
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
}) {
  const staff = await requireAuth();
  try {
    const collection = await prisma.questionCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        parentId: data.parentId || null,
        color: data.color || null,
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

// ---------------------------------------------------------------------------
// Passage Collections — Folder-like organization for passages
// ---------------------------------------------------------------------------

export async function getPassageCollections(academyId: string) {
  await requireAuth();
  return prisma.passageCollection.findMany({
    where: { academyId },
    include: {
      _count: { select: { items: true, children: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createPassageCollection(data: {
  name: string;
  description?: string;
  color?: string;
  parentId?: string;
}) {
  const staff = await requireAuth();
  try {
    const collection = await prisma.passageCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        color: data.color || null,
        parentId: data.parentId || null,
      },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const, id: collection.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 생성 실패";
    return { success: false as const, error: message };
  }
}

export async function updatePassageCollection(
  collectionId: string,
  data: { name?: string; description?: string; color?: string }
) {
  await requireAuth();
  try {
    await prisma.passageCollection.update({
      where: { id: collectionId },
      data,
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false as const, error: message };
  }
}

export async function deletePassageCollection(collectionId: string) {
  await requireAuth();
  try {
    await prisma.passageCollection.delete({
      where: { id: collectionId },
    });
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
  await requireAuth();
  try {
    const maxItem = await prisma.passageCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.passageCollectionItem.createMany({
      data: passageIds.map((passageId, idx) => ({
        collectionId,
        passageId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/workbench/passages");
    return { success: true as const };
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
  await requireAuth();
  try {
    await prisma.passageCollectionItem.deleteMany({
      where: {
        collectionId,
        passageId: { in: passageIds },
      },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false as const, error: message };
  }
}

export async function getPassageCollectionItems(collectionId: string) {
  await requireAuth();
  const items = await prisma.passageCollectionItem.findMany({
    where: { collectionId },
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

export async function bulkUpdatePassageTags(
  passageIds: string[],
  tags: string[]
) {
  await requireAuth();
  try {
    const tagsJson = JSON.stringify(tags);
    await prisma.passage.updateMany({
      where: { id: { in: passageIds } },
      data: { tags: tagsJson },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "태그 업데이트 실패";
    return { success: false as const, error: message };
  }
}
