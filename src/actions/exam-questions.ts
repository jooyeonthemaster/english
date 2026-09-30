"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { isKoQuestionType } from "@/lib/korean/registry";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Exam Question Management
//
// 학원 범위(IDOR 수리 26-09-30): 이 파일은 src/actions/exams/* 의 옛 복제본이다(시험 생성
// 마법사가 getQuestionBank 를 아직 여기서 가져온다). exams/* 에는 이미 걸려 있던 학원 범위를
// 여기에도 똑같이 건다 — 시험·문제·지문·반·학교는 전부 세션 academyId 로만 찾는다.
// ---------------------------------------------------------------------------

export async function addQuestionsToExam(
  examId: string,
  questionIds: string[]
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds }, academyId: staff.academyId, deletedAt: null },
      select: { id: true, points: true, subType: true },
    });
    if (questions.length !== new Set(questionIds).size) {
      return { success: false, error: "일부 문제가 현재 학원에 속하지 않습니다." };
    }
    // Get current max order
    const maxOrder = await prisma.examQuestion.findFirst({
      where: { examId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });

    let nextOrder = (maxOrder?.orderNum || 0) + 1;

    // KO 문항만 저장 배점 승계 (src/actions/exams/questions.ts 와 동일 규약) — 영어는
    // 종전 규약(무조건 1점) 원복. 영어도 points≠1 저장 경로(기출 추출 실배점·편집기
    // 배점 필드)가 있어 무게이트 승계는 영어 시험지 총점을 소리 없이 바꾼다.
    const pointsById = new Map(
      questions.map((q) => [
        q.id,
        isKoQuestionType(q.subType) ? Math.max(1, q.points ?? 1) : 1,
      ]),
    );

    await prisma.examQuestion.createMany({
      data: questionIds.map((qId) => ({
        examId,
        questionId: qId,
        points: pointsById.get(qId) ?? 1,
        orderNum: nextOrder++,
      })),
      skipDuplicates: true,
    });

    revalidatePath(`/director/exams/${examId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 추가 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function removeQuestionFromExam(
  examId: string,
  examQuestionId: string
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // 이 학원 시험에 달린 연결 행만 지운다(exams/questions.ts 와 같은 가드).
    const link = await prisma.examQuestion.findFirst({
      where: { id: examQuestionId, examId, exam: { academyId: staff.academyId } },
      select: { id: true },
    });
    if (!link) return { success: false, error: "문제 연결을 찾을 수 없습니다." };

    await prisma.examQuestion.delete({
      where: { id: examQuestionId },
    });

    revalidatePath(`/director/exams/${examId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 제거 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function reorderExamQuestions(
  examId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // 시험이 이 학원 것이고, 모든 연결 행이 그 시험 것이어야 한다(exams/questions.ts 와 같은 가드).
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (orderedIds.length > 0) {
      const valid = await prisma.examQuestion.findMany({
        where: { id: { in: orderedIds }, examId },
        select: { id: true },
      });
      if (valid.length !== new Set(orderedIds).size) {
        return { success: false, error: "일부 문제 연결이 이 시험에 속하지 않습니다." };
      }
    }

    const updates = orderedIds.map((id, index) =>
      prisma.examQuestion.update({
        where: { id },
        data: { orderNum: index + 1 },
      })
    );

    await prisma.$transaction(updates);

    revalidatePath(`/director/exams/${examId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문제 순서 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Question Bank (for picker)
// ---------------------------------------------------------------------------

export async function getQuestionBank(
  academyId: string,
  filters?: {
    type?: string;
    difficulty?: string;
    search?: string;
  }
) {
  // 학원 범위는 세션이 정한다 — 인자는 호환용(마법사는 자기 학원 id 를 넘긴다).
  const staff = await requireStaffAuth();
  void academyId;

  const where: Record<string, unknown> = { academyId: staff.academyId };
  where.deletedAt = null;

  if (filters?.type && filters.type !== "ALL") where.type = filters.type;
  if (filters?.difficulty && filters.difficulty !== "ALL")
    where.difficulty = filters.difficulty;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  const questions = await prisma.question.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return questions;
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export async function getClassesForFilter(academyId: string) {
  const staff = await requireStaffAuth();
  void academyId;

  const classes = await prisma.class.findMany({
    where: { academyId: staff.academyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return classes;
}

export async function getSchoolsForFilter(academyId: string) {
  const staff = await requireStaffAuth();
  void academyId;

  const schools = await prisma.school.findMany({
    where: { academyId: staff.academyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return schools;
}

// ---------------------------------------------------------------------------
// Backward-compatible stubs for old (admin) routes
// ---------------------------------------------------------------------------

export async function createQuestion(
  examId: string,
  data: {
    questionNumber: number;
    questionText: string;
    correctAnswer: string;
    points?: number;
    passageId?: string;
    explanation?: { content: string; keyPoints?: string; difficulty?: string };
  }
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    // 지문도 이 학원 것이어야 한다(exams/legacy.ts 와 같은 가드).
    if (data.passageId) {
      const passage = await prisma.passage.findFirst({
        where: { id: data.passageId, academyId: staff.academyId },
        select: { id: true },
      });
      if (!passage) return { success: false, error: "지문을 찾을 수 없습니다." };
    }

    const question = await prisma.question.create({
      data: {
        academyId: exam.academyId,
        type: "MULTIPLE_CHOICE",
        questionText: data.questionText,
        correctAnswer: data.correctAnswer,
        points: data.points ?? 1,
        passageId: data.passageId || null,
        approved: true,
      },
    });

    await prisma.examQuestion.create({
      data: {
        examId,
        questionId: question.id,
        orderNum: data.questionNumber,
        points: data.points ?? 1,
      },
    });

    if (data.explanation?.content) {
      await prisma.questionExplanation.create({
        data: {
          questionId: question.id,
          content: data.explanation.content,
          keyPoints: data.explanation.keyPoints,
          difficulty: data.explanation.difficulty,
        },
      });
    }

    revalidatePath(`/admin`);
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "생성 실패",
    };
  }
}

export async function deleteQuestion(
  questionId: string
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    // 이 학원 문제만 지운다(exams/legacy.ts 와 같은 가드).
    const owned = await prisma.question.findFirst({
      where: { id: questionId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "문제를 찾을 수 없습니다." };
    await prisma.examQuestion.deleteMany({ where: { questionId } });
    await prisma.question.delete({ where: { id: questionId } });
    revalidatePath(`/admin`);
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "삭제 실패",
    };
  }
}
