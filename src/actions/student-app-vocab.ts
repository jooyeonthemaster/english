"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// getVocabListsForStudent — Available vocab lists
// ---------------------------------------------------------------------------
export async function getVocabListsForStudent(filters?: {
  grade?: number;
  semester?: string;
  search?: string;
}) {
  const session = await requireStudent();

  const where: Record<string, unknown> = {
    academyId: session.academyId,
  };

  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.search) {
    where.title = { contains: filters.search };
  }

  const lists = await prisma.vocabularyList.findMany({
    where,
    include: {
      _count: { select: { items: true } },
      testResults: {
        where: { studentId: session.studentId },
        orderBy: { takenAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ grade: "asc" }, { order: "asc" }, { createdAt: "desc" }],
  });

  return lists.map((l) => ({
    id: l.id,
    title: l.title,
    grade: l.grade,
    semester: l.semester,
    unit: l.unit,
    wordCount: l._count.items,
    lastScore: l.testResults[0]?.percent ?? null,
    lastTestDate: l.testResults[0]?.takenAt?.toISOString() ?? null,
  }));
}

// ---------------------------------------------------------------------------
// getVocabListForTest — Get vocab items for testing
// ---------------------------------------------------------------------------
export async function getVocabListForTest(listId: string) {
  const session = await requireStudent();

  const list = await prisma.vocabularyList.findUnique({
    where: { id: listId },
    include: {
      items: { orderBy: { order: "asc" } },
      testResults: {
        where: { studentId: session.studentId },
        orderBy: { takenAt: "desc" },
        take: 5,
      },
    },
  });

  if (!list) throw new Error("단어장을 찾을 수 없습니다.");

  return {
    id: list.id,
    title: list.title,
    grade: list.grade,
    semester: list.semester,
    items: list.items.map((i) => ({
      id: i.id,
      english: i.english,
      korean: i.korean,
      partOfSpeech: i.partOfSpeech,
    })),
    recentScores: list.testResults.map((r) => ({
      percent: r.percent,
      testType: r.testType,
      date: r.takenAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// getWrongVocabWords — Wrong vocab answers
// ---------------------------------------------------------------------------
export async function getWrongVocabWords() {
  const session = await requireStudent();

  const wrongWords = await prisma.wrongVocabAnswer.findMany({
    where: { studentId: session.studentId },
    include: {
      item: {
        include: { list: true },
      },
    },
    orderBy: { count: "desc" },
  });

  return wrongWords.map((w) => ({
    id: w.id,
    itemId: w.itemId,
    english: w.item.english,
    korean: w.item.korean,
    partOfSpeech: w.item.partOfSpeech,
    listTitle: w.item.list.title,
    givenAnswer: w.givenAnswer,
    testType: w.testType,
    count: w.count,
    lastMissedAt: w.lastMissedAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// getWrongQuestions — Wrong question answers
// ---------------------------------------------------------------------------
export async function getWrongQuestions() {
  const session = await requireStudent();

  const wrongQuestions = await prisma.wrongAnswerLog.findMany({
    where: { studentId: session.studentId },
    include: {
      question: {
        include: { explanation: true },
      },
    },
    orderBy: { count: "desc" },
  });

  return wrongQuestions.map((w) => ({
    id: w.id,
    questionId: w.questionId,
    questionText: w.question.questionText,
    questionType: w.question.type,
    options: w.question.options ? JSON.parse(w.question.options) : null,
    correctAnswer: w.question.correctAnswer,
    givenAnswer: w.givenAnswer,
    category: w.category,
    subCategory: w.subCategory,
    count: w.count,
    lastWrongAt: w.lastWrongAt.toISOString(),
    explanation: w.question.explanation?.content ?? null,
    keyPoints: w.question.explanation?.keyPoints
      ? JSON.parse(w.question.explanation.keyPoints)
      : null,
  }));
}
