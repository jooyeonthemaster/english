"use server";

import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { SUBTYPE_TO_CATEGORY } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean;
  error?: string;
}

interface LearningQuestionData {
  passageId: string;
  type: string;
  subType?: string | null;
  questionText: string;
  options?: string | null;
  correctAnswer: string;
  difficulty?: string;
  tags?: string | null;
  explanation?: string | null;
  keyPoints?: string | null;
  wrongOptionExplanations?: string | null;
}

interface LearningSetData {
  passageId: string;
  publisher: string;
  textbook?: string;
  grade?: number;
  unit?: string;
  title: string;
}

interface SuneungPassageData {
  title: string;
  content: string;
  source?: string;
  grade: number;
  year?: number;
  examType?: string;
  difficulty?: string;
  tags?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAuth() {
  const staff = await getStaffSession();
  if (!staff) throw new Error("인증이 필요합니다.");
  return staff;
}

function resolveCategory(subType?: string | null): string {
  if (!subType) return "VOCAB";
  return SUBTYPE_TO_CATEGORY[subType] || "VOCAB";
}

function toJsonString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// 내신링고 문제 저장
// ---------------------------------------------------------------------------

export async function saveNaeshinQuestions(
  questions: LearningQuestionData[],
  setData?: LearningSetData,
): Promise<ActionResult & { setId?: string }> {
  try {
    const staff = await requireAuth();
    const academyId = staff.academyId;

    // 학습 세트 생성
    let learningSetId: string | null = null;
    if (setData) {
      const set = await prisma.learningSet.create({
        data: {
          academyId,
          passageId: setData.passageId,
          publisher: setData.publisher,
          textbook: setData.textbook || null,
          grade: setData.grade || null,
          unit: setData.unit || null,
          title: setData.title,
          questionCount: questions.length,
        },
      });
      learningSetId = set.id;
    }

    // 벌크 INSERT — 문제
    await prisma.naeshinQuestion.createMany({
      data: questions.map((q) => ({
        academyId,
        passageId: q.passageId,
        learningSetId,
        learningCategory: resolveCategory(q.subType),
        type: q.type,
        subType: q.subType || null,
        questionText: q.questionText || "",
        options: toJsonString(q.options),
        correctAnswer: q.correctAnswer || "",
        difficulty: q.difficulty || "INTERMEDIATE",
        tags: toJsonString(q.tags),
        aiGenerated: true,
        approved: false,
      })),
    });

    // 벌크 INSERT — explanation (questionId 매칭 필요)
    const questionsWithExplanation = questions.filter((q) => q.explanation);
    if (questionsWithExplanation.length > 0 && learningSetId) {
      const created = await prisma.naeshinQuestion.findMany({
        where: { learningSetId },
        select: { id: true, subType: true, questionText: true },
        orderBy: { createdAt: "asc" },
      });

      // questions 배열 순서와 created 순서 매칭
      const explanationData: { questionId: string; content: string; keyPoints: string | null; wrongOptionExplanations: string | null }[] = [];
      for (let i = 0; i < questions.length; i++) {
        if (questions[i].explanation && created[i]) {
          explanationData.push({
            questionId: created[i].id,
            content: questions[i].explanation!,
            keyPoints: toJsonString(questions[i].keyPoints),
            wrongOptionExplanations: toJsonString(questions[i].wrongOptionExplanations),
          });
        }
      }

      if (explanationData.length > 0) {
        await prisma.naeshinQuestionExplanation.createMany({
          data: explanationData,
        });
      }
    }

    revalidatePath("/director/workbench");
    revalidatePath("/director/learning-questions");
    return { success: true, setId: learningSetId || undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장 실패";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 수능링고 문제 저장
// ---------------------------------------------------------------------------

export async function saveSuneungQuestions(
  questions: LearningQuestionData[],
  grade: number
): Promise<ActionResult> {
  try {
    await requireAuth();

    for (const q of questions) {
      const question = await prisma.suneungQuestion.create({
        data: {
          passageId: q.passageId,
          learningCategory: resolveCategory(q.subType),
          type: q.type,
          subType: q.subType || null,
          questionText: q.questionText || "",
          options: toJsonString(q.options),
          correctAnswer: q.correctAnswer || "",
          difficulty: q.difficulty || "INTERMEDIATE",
          grade,
          tags: toJsonString(q.tags),
          aiGenerated: true,
          approved: false,
        },
      });

      if (q.explanation) {
        await prisma.suneungQuestionExplanation.create({
          data: {
            questionId: question.id,
            content: q.explanation,
            keyPoints: toJsonString(q.keyPoints),
            wrongOptionExplanations: toJsonString(q.wrongOptionExplanations),
          },
        });
      }
    }

    revalidatePath("/director/workbench");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장 실패";
    return { success: false, error: message };
  }
}

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

// ---------------------------------------------------------------------------
// 학습 문제 통계 (워크벤치 허브용)
// ---------------------------------------------------------------------------

export async function getLearningQuestionStats(academyId: string) {
  const [naeshinCount, suneungCount] = await Promise.all([
    prisma.naeshinQuestion.count({ where: { academyId } }),
    prisma.suneungQuestion.count(),
  ]);

  return {
    naeshin: naeshinCount,
    suneung: suneungCount,
    total: naeshinCount + suneungCount,
  };
}

// ---------------------------------------------------------------------------
// 학습 세트 조회 (문제 은행 메인)
// ---------------------------------------------------------------------------

export async function getLearningSets(academyId: string, filters?: {
  publisher?: string;
  grade?: number;
}) {
  await requireAuth();

  const where: Record<string, unknown> = { academyId };
  if (filters?.publisher) where.publisher = filters.publisher;
  if (filters?.grade) where.grade = filters.grade;

  const sets = await prisma.learningSet.findMany({
    where,
    include: {
      passage: { select: { id: true, title: true } },
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // 출판사 목록 (필터용)
  const publishers = await prisma.learningSet.findMany({
    where: { academyId },
    select: { publisher: true },
    distinct: ["publisher"],
    orderBy: { publisher: "asc" },
  });

  return { sets, publishers: publishers.map((p) => p.publisher) };
}

// ---------------------------------------------------------------------------
// 학습 세트 내 문제 조회
// ---------------------------------------------------------------------------

export interface LearningQuestionFilters {
  learningSetId?: string;
  learningCategory?: string;
  subType?: string;
  difficulty?: string;
  passageId?: string;
  approved?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function getNaeshinQuestions(
  academyId: string,
  filters?: LearningQuestionFilters
) {
  await requireAuth();

  const take = filters?.limit || 50;
  const skip = ((filters?.page || 1) - 1) * take;

  const where: Record<string, unknown> = { academyId };
  if (filters?.learningSetId) where.learningSetId = filters.learningSetId;
  if (filters?.learningCategory) where.learningCategory = filters.learningCategory;
  if (filters?.subType) where.subType = filters.subType;
  if (filters?.difficulty) where.difficulty = filters.difficulty;
  if (filters?.passageId) where.passageId = filters.passageId;
  if (filters?.approved !== undefined) where.approved = filters.approved;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  const [questions, total] = await Promise.all([
    prisma.naeshinQuestion.findMany({
      where,
      include: {
        passage: { select: { id: true, title: true } },
        explanation: true,
      },
      orderBy: [{ learningCategory: "asc" }, { subType: "asc" }],
      skip,
      take,
    }),
    prisma.naeshinQuestion.count({ where }),
  ]);

  return {
    questions,
    total,
    page: filters?.page || 1,
    totalPages: Math.ceil(total / take),
  };
}

// ---------------------------------------------------------------------------
// 학습 문제 은행 — 승인/삭제
// ---------------------------------------------------------------------------

export async function approveNaeshinQuestion(questionId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.update({
      where: { id: questionId },
      data: { approved: true },
    });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "승인 실패" };
  }
}

export async function deleteNaeshinQuestion(questionId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.delete({ where: { id: questionId } });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "삭제 실패" };
  }
}

export async function bulkApproveNaeshinQuestions(ids: string[]): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.updateMany({
      where: { id: { in: ids } },
      data: { approved: true },
    });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "승인 실패" };
  }
}

export async function bulkDeleteNaeshinQuestions(ids: string[]): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.deleteMany({
      where: { id: { in: ids } },
    });
    revalidatePath("/director/learning-questions");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "삭제 실패" };
  }
}
