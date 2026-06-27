"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";

/**
 * Fetch all passages for a given academy, with question count and analysis info.
 */
export async function getAcademyPassages(academyId: string) {
  await requireAdminAuth();

  const passages = await prisma.passage.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    include: {
      school: { select: { id: true, name: true } },
      analysis: { select: { id: true } },
      // 휴지통 가드 — 삭제된 문제는 지문의 문항 수에서 제외.
      _count: {
        select: { questions: { where: { deletedAt: null } }, notes: true },
      },
    },
  });

  return passages.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    source: p.source,
    grade: p.grade,
    semester: p.semester,
    unit: p.unit,
    publisher: p.publisher,
    difficulty: p.difficulty,
    tags: p.tags,
    order: p.order,
    createdAt: p.createdAt,
    school: p.school,
    hasAnalysis: !!p.analysis,
    questionCount: p._count.questions,
    noteCount: p._count.notes,
  }));
}

/**
 * Fetch a single passage with full analysis, connected questions, and notes.
 */
export async function getAcademyPassageDetail(
  academyId: string,
  passageId: string,
) {
  await requireAdminAuth();

  const passage = await prisma.passage.findFirst({
    where: { id: passageId, academyId },
    include: {
      school: { select: { id: true, name: true } },
      analysis: true,
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          noteType: true,
          highlightStart: true,
          highlightEnd: true,
          createdAt: true,
        },
      },
      questions: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          explanation: true,
          _count: { select: { examLinks: true } },
        },
      },
    },
  });

  if (!passage) return null;

  return {
    id: passage.id,
    title: passage.title,
    content: passage.content,
    source: passage.source,
    grade: passage.grade,
    semester: passage.semester,
    unit: passage.unit,
    publisher: passage.publisher,
    difficulty: passage.difficulty,
    tags: passage.tags,
    createdAt: passage.createdAt,
    school: passage.school,
    analysis: passage.analysis
      ? {
          id: passage.analysis.id,
          analysisData: passage.analysis.analysisData,
          version: passage.analysis.version,
          createdAt: passage.analysis.createdAt,
        }
      : null,
    notes: passage.notes,
    questions: passage.questions.map((q) => ({
      id: q.id,
      type: q.type,
      subType: q.subType,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: q.points,
      difficulty: q.difficulty,
      tags: q.tags,
      aiGenerated: q.aiGenerated,
      approved: q.approved,
      starred: q.starred,
      createdAt: q.createdAt,
      explanation: q.explanation
        ? {
            id: q.explanation.id,
            content: q.explanation.content,
            keyPoints: q.explanation.keyPoints,
            wrongOptionExplanations: q.explanation.wrongOptionExplanations,
          }
        : null,
      _count: { examLinks: q._count.examLinks },
    })),
  };
}

/**
 * Fetch all questions for a given academy with passage info and explanations.
 */
export async function getAcademyQuestions(academyId: string) {
  await requireAdminAuth();

  const questions = await prisma.question.findMany({
    where: { academyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      passage: {
        select: {
          id: true,
          title: true,
          content: true,
          grade: true,
          semester: true,
          publisher: true,
          school: { select: { id: true, name: true } },
        },
      },
      explanation: {
        select: {
          id: true,
          content: true,
          keyPoints: true,
          wrongOptionExplanations: true,
        },
      },
      _count: { select: { examLinks: true } },
    },
  });

  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    subType: q.subType,
    questionText: q.questionText,
    options: q.options,
    correctAnswer: q.correctAnswer,
    points: q.points,
    difficulty: q.difficulty,
    tags: q.tags,
    aiGenerated: q.aiGenerated,
    approved: q.approved,
    starred: q.starred,
    createdAt: q.createdAt,
    passage: q.passage,
    explanation: q.explanation,
    _count: { examLinks: q._count.examLinks },
  }));
}

/**
 * Fetch all exams for a given academy with class, school, question and submission counts.
 */
export async function getAcademyExams(academyId: string) {
  await requireAdminAuth();

  const exams = await prisma.exam.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      // 휴지통 가드 — 삭제된 문제는 시험지 문항 수에서 제외.
      _count: {
        select: {
          questions: { where: { question: { deletedAt: null } } },
          submissions: true,
        },
      },
    },
  });

  return exams.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    status: e.status,
    grade: e.grade,
    semester: e.semester,
    examDate: e.examDate,
    totalPoints: e.totalPoints,
    createdAt: e.createdAt,
    class: e.class,
    school: e.school,
    _count: { questions: e._count.questions, submissions: e._count.submissions },
  }));
}
