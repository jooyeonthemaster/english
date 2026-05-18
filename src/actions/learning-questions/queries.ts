"use server";

import { prisma } from "@/lib/prisma";
import {
  getQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { requireAuth, type LearningQuestionFilters } from "./_helpers";

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
  if (filters?.generationPlan) {
    where.tags = {
      contains: getQuestionGenerationPlanTag(
        normalizeQuestionGenerationPlan(filters.generationPlan),
      ),
    };
  }
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
