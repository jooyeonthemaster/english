"use server";

import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { SUBTYPE_TO_CATEGORY } from "@/lib/learning-constants";
import {
  wordMeaningItemSchema,
  wordMeaningReverseItemSchema,
  wordFillItemSchema,
  wordMatchItemSchema,
  wordSpellItemSchema,
  vocabSynonymItemSchema,
  vocabDefinitionItemSchema,
  vocabCollocationItemSchema,
  vocabConfusableItemSchema,
  sentenceInterpretItemSchema,
  sentenceCompleteItemSchema,
  wordArrangeItemSchema,
  keyExpressionItemSchema,
  sentChunkOrderItemSchema,
  grammarSelectItemSchema,
  errorFindItemSchema,
  errorCorrectItemSchema,
  gramTransformItemSchema,
  gramBinaryItemSchema,
  trueFalseItemSchema,
  contentQuestionItemSchema,
  passageFillItemSchema,
  connectorFillItemSchema,
} from "@/lib/learning-question-schemas";

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

/** subType별 Zod 스키마 맵 — questionText JSON 검증용 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SUBTYPE_SCHEMA_MAP: Record<string, any> = {
  WORD_MEANING: wordMeaningItemSchema,
  WORD_MEANING_REVERSE: wordMeaningReverseItemSchema,
  WORD_FILL: wordFillItemSchema,
  WORD_MATCH: wordMatchItemSchema,
  WORD_SPELL: wordSpellItemSchema,
  VOCAB_SYNONYM: vocabSynonymItemSchema,
  VOCAB_DEFINITION: vocabDefinitionItemSchema,
  VOCAB_COLLOCATION: vocabCollocationItemSchema,
  VOCAB_CONFUSABLE: vocabConfusableItemSchema,
  SENTENCE_INTERPRET: sentenceInterpretItemSchema,
  SENTENCE_COMPLETE: sentenceCompleteItemSchema,
  WORD_ARRANGE: wordArrangeItemSchema,
  KEY_EXPRESSION: keyExpressionItemSchema,
  SENT_CHUNK_ORDER: sentChunkOrderItemSchema,
  GRAMMAR_SELECT: grammarSelectItemSchema,
  ERROR_FIND: errorFindItemSchema,
  ERROR_CORRECT: errorCorrectItemSchema,
  GRAM_TRANSFORM: gramTransformItemSchema,
  GRAM_BINARY: gramBinaryItemSchema,
  TRUE_FALSE: trueFalseItemSchema,
  CONTENT_QUESTION: contentQuestionItemSchema,
  PASSAGE_FILL: passageFillItemSchema,
  CONNECTOR_FILL: connectorFillItemSchema,
};

/** questionText JSON 기본 검증 — JSON 파싱 가능하고 최소 1개 이상의 필드가 있으면 통과
 *  AI 생성 출력이 매번 미세하게 다를 수 있으므로 너무 엄격하면 정상 문제도 탈락함 */
function validateQuestionText(subType: string | null | undefined, questionText: string): boolean {
  if (!subType) return true;
  try {
    const data = JSON.parse(questionText);
    if (typeof data !== "object" || data === null) return false;
    // WORD_MATCH는 pairs 1개만 있어도 정상
    if (subType === "WORD_MATCH") return Array.isArray(data.pairs) && data.pairs.length > 0;
    // 나머지는 최소 2개 이상의 키
    return Object.keys(data).length >= 2;
  } catch {
    return false;
  }
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

    // 기본 검증 — 불량 문제 필터링
    const validQuestions = questions.filter((q) => validateQuestionText(q.subType, q.questionText));
    const skippedCount = questions.length - validQuestions.length;
    if (skippedCount > 0) {
      console.warn(`[saveNaeshinQuestions] 검증 실패로 ${skippedCount}개 문제 제외`);
    }

    // explanation이 없는 문제는 questionText JSON 내부에서 추출 시도
    for (const q of validQuestions) {
      if (!q.explanation && q.questionText) {
        try {
          const data = JSON.parse(q.questionText);
          if (typeof data.explanation === "string" && data.explanation) {
            q.explanation = data.explanation;
          } else if (typeof data.errorExplanation === "string" && data.errorExplanation) {
            q.explanation = data.errorExplanation;
          } else if (typeof data.grammarPoint === "string" && data.grammarPoint) {
            q.explanation = `문법 포인트: ${data.grammarPoint}`;
          }
        } catch {}
      }
    }

    // 벌크 INSERT — 문제 (속도 우선)
    await prisma.naeshinQuestion.createMany({
      data: validQuestions.map((q) => ({
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

    // 해설 매칭 — questionText 내용으로 매칭 (순서 의존 제거)
    const questionsWithExplanation = validQuestions.filter((q) => q.explanation);
    if (questionsWithExplanation.length > 0 && learningSetId) {
      const created = await prisma.naeshinQuestion.findMany({
        where: { learningSetId },
        select: { id: true, questionText: true },
      });

      // questionText → ID[] 맵 (동일 텍스트가 여러 문제일 수 있음)
      const createdByText = new Map<string, string[]>();
      for (const c of created) {
        const arr = createdByText.get(c.questionText) || [];
        arr.push(c.id);
        createdByText.set(c.questionText, arr);
      }

      const usedIds = new Set<string>();
      const explanationData: { questionId: string; content: string; keyPoints: string | null; wrongOptionExplanations: string | null }[] = [];
      for (const q of questionsWithExplanation) {
        const candidates = createdByText.get(q.questionText || "") || [];
        // 아직 사용 안 된 ID 찾기
        const questionId = candidates.find((id) => !usedIds.has(id));
        if (questionId) {
          usedIds.add(questionId);
          explanationData.push({
            questionId,
            content: q.explanation!,
            keyPoints: toJsonString(q.keyPoints),
            wrongOptionExplanations: toJsonString(q.wrongOptionExplanations),
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

  const [sets, publishers] = await Promise.all([
    prisma.learningSet.findMany({
      where,
      include: {
        passage: { select: { id: true, title: true, content: true, grade: true, school: { select: { id: true, name: true } } } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.learningSet.findMany({
      where: { academyId },
      select: { publisher: true },
      distinct: ["publisher"],
      orderBy: { publisher: "asc" },
    }),
  ]);

  // 학교 목록 추출 (세트의 passage에서)
  const schoolMap = new Map<string, string>();
  const gradeSet = new Set<number>();
  for (const s of sets) {
    if (s.passage.school) schoolMap.set(s.passage.school.id, s.passage.school.name);
    if (s.passage.grade) gradeSet.add(s.passage.grade);
  }
  const schools = Array.from(schoolMap.entries()).map(([id, name]) => ({ id, name }));
  const grades = Array.from(gradeSet).sort();

  return { sets, publishers: publishers.map((p) => p.publisher), schools, grades };
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

// ---------------------------------------------------------------------------
// 세트별 카테고리 통계 (category dashboard용)
// ---------------------------------------------------------------------------

export async function getSetCategoryStats(setId: string) {
  await requireAuth();

  const questions = await prisma.naeshinQuestion.findMany({
    where: { learningSetId: setId },
    select: { learningCategory: true, subType: true, difficulty: true, approved: true },
  });

  // 카테고리별 집계
  const categories: Record<
    string,
    {
      total: number;
      approved: number;
      subtypes: Record<string, number>;
      difficulties: Record<string, number>;
    }
  > = {};

  for (const q of questions) {
    const cat = q.learningCategory;
    if (!categories[cat]) {
      categories[cat] = { total: 0, approved: 0, subtypes: {}, difficulties: {} };
    }
    categories[cat].total++;
    if (q.approved) categories[cat].approved++;
    if (q.subType) {
      categories[cat].subtypes[q.subType] = (categories[cat].subtypes[q.subType] ?? 0) + 1;
    }
    categories[cat].difficulties[q.difficulty] = (categories[cat].difficulties[q.difficulty] ?? 0) + 1;
  }

  return {
    total: questions.length,
    approved: questions.filter((q) => q.approved).length,
    categories,
  };
}

// ---------------------------------------------------------------------------
// 카테고리 단위 일괄 승인
// ---------------------------------------------------------------------------

export async function approveCategoryQuestions(
  setId: string,
  category: string
): Promise<ActionResult> {
  try {
    await requireAuth();
    await prisma.naeshinQuestion.updateMany({
      where: { learningSetId: setId, learningCategory: category, approved: false },
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
