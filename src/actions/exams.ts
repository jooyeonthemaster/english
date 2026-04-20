"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ExamFilters {
  type?: string;
  status?: string;
  classId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface ExamCreateData {
  title: string;
  type: string; // "OFFLINE" | "ONLINE" | "VOCAB" | "MOCK"
  classId?: string | null;
  schoolId?: string | null;
  grade?: number | null;
  semester?: string | null;
  examType?: string | null;
  examDate?: string | null;
  duration?: number | null;
  totalPoints: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResults?: boolean;
  questions?: ExamQuestionInput[];
}

export interface ExamQuestionInput {
  questionId: string;
  points: number;
  orderNum: number;
}

export interface GradeInput {
  questionId: string;
  score: number;
  feedback?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers — tenant isolation guards
// ---------------------------------------------------------------------------
// Every mutating action below must verify that the entity referenced by the
// caller-supplied id is owned by the authenticated staff's academyId. These
// helpers centralise the check so we can audit for misses with `grep`.
// ---------------------------------------------------------------------------

async function assertExamBelongsToAcademy(
  examId: string,
  academyId: string
): Promise<void> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId },
    select: { id: true },
  });
  if (!exam) {
    throw new Error("시험을 찾을 수 없습니다.");
  }
}

async function assertQuestionsBelongToAcademy(
  questionIds: string[],
  academyId: string
): Promise<void> {
  if (questionIds.length === 0) return;
  const valid = await prisma.question.findMany({
    where: { id: { in: questionIds }, academyId },
    select: { id: true },
  });
  if (valid.length !== new Set(questionIds).size) {
    throw new Error("일부 문제가 이 학원에 속하지 않습니다.");
  }
}

async function assertClassBelongsToAcademy(
  classId: string,
  academyId: string
): Promise<void> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, academyId },
    select: { id: true },
  });
  if (!cls) {
    throw new Error("반을 찾을 수 없습니다.");
  }
}

async function assertExamCollectionBelongsToAcademy(
  collectionId: string,
  academyId: string
): Promise<void> {
  const collection = await prisma.examCollection.findFirst({
    where: { id: collectionId, academyId },
    select: { id: true },
  });
  if (!collection) {
    throw new Error("폴더를 찾을 수 없습니다.");
  }
}

async function assertExamsBelongToAcademy(
  examIds: string[],
  academyId: string
): Promise<void> {
  if (examIds.length === 0) return;
  const valid = await prisma.exam.findMany({
    where: { id: { in: examIds }, academyId },
    select: { id: true },
  });
  if (valid.length !== new Set(examIds).size) {
    throw new Error("일부 시험이 이 학원에 속하지 않습니다.");
  }
}

// ---------------------------------------------------------------------------
// Exam CRUD
// ---------------------------------------------------------------------------

export async function getExams(academyId: string, filters?: ExamFilters) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const where: Record<string, unknown> = { academyId };

  if (filters?.type && filters.type !== "ALL") where.type = filters.type;
  if (filters?.status && filters.status !== "ALL") where.status = filters.status;
  if (filters?.classId) where.classId = filters.classId;
  if (filters?.search) {
    where.title = { contains: filters.search, mode: "insensitive" };
  }
  if (filters?.dateFrom || filters?.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters?.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters?.dateTo) dateFilter.lte = new Date(filters.dateTo);
    where.examDate = dateFilter;
  }

  const exams = await prisma.exam.findMany({
    where,
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      _count: { select: { questions: true, submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return exams;
}

export async function getExam(examId: string) {
  const staff = await requireStaffAuth();

  // Scope lookup to the caller's academy so a manipulated examId can't
  // read another tenant's exam (including its full question bodies).
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: staff.academyId },
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      questions: {
        include: {
          question: {
            include: {
              explanation: true,
            },
          },
        },
        orderBy: { orderNum: "asc" },
      },
      submissions: {
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
        },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  return exam;
}

export async function createExam(
  academyId: string,
  data: ExamCreateData
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0 guard: caller must not be able to forge the academyId argument.
    // The session's academyId is the source of truth.
    if (staff.academyId !== academyId) {
      return { success: false, error: "학원 정보가 일치하지 않습니다." };
    }

    // If caller passed a classId, verify it belongs to this academy.
    if (data.classId) {
      await assertClassBelongsToAcademy(data.classId, staff.academyId);
    }

    // If caller pre-populated questions, each questionId must be owned
    // by this academy — otherwise we'd let them attach another tenant's
    // question rows to our new exam.
    if (data.questions && data.questions.length > 0) {
      await assertQuestionsBelongToAcademy(
        data.questions.map((q) => q.questionId),
        staff.academyId
      );
    }

    const exam = await prisma.exam.create({
      data: {
        academyId: staff.academyId,
        title: data.title,
        type: data.type,
        classId: data.classId || null,
        schoolId: data.schoolId || null,
        grade: data.grade || null,
        semester: data.semester || null,
        examType: data.examType || null,
        examDate: data.examDate ? new Date(data.examDate) : null,
        duration: data.duration || null,
        totalPoints: data.totalPoints,
        shuffleQuestions: data.shuffleQuestions || false,
        shuffleOptions: data.shuffleOptions || false,
        showResults: data.showResults ?? true,
        status: "DRAFT",
      },
    });

    if (data.questions && data.questions.length > 0) {
      await prisma.examQuestion.createMany({
        data: data.questions.map((q) => ({
          examId: exam.id,
          questionId: q.questionId,
          points: q.points,
          orderNum: q.orderNum,
        })),
      });
    }

    revalidatePath("/director/exams");
    return { success: true, id: exam.id };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 생성 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateExam(
  examId: string,
  data: Partial<ExamCreateData>
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0 guard: the exam must belong to the caller's academy before any
    // update touches its row. Without this, any staff of any academy
    // could overwrite this exam.
    await assertExamBelongsToAcademy(examId, staff.academyId);

    if (data.classId) {
      await assertClassBelongsToAcademy(data.classId, staff.academyId);
    }

    await prisma.exam.update({
      where: { id: examId },
      data: {
        title: data.title,
        type: data.type,
        classId: data.classId,
        schoolId: data.schoolId,
        grade: data.grade,
        semester: data.semester,
        examType: data.examType,
        examDate: data.examDate ? new Date(data.examDate) : undefined,
        duration: data.duration,
        totalPoints: data.totalPoints,
        shuffleQuestions: data.shuffleQuestions,
        shuffleOptions: data.shuffleOptions,
        showResults: data.showResults,
      },
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteExam(examId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Scope the existence check to the caller's academy. Previously we
    // did findUnique(id) which would happily return a cross-tenant exam
    // and then delete it.
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true, status: true },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam.status !== "DRAFT") {
      return { success: false, error: "초안 상태의 시험만 삭제할 수 있습니다." };
    }

    await prisma.exam.delete({ where: { id: examId } });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function publishExam(examId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      include: { _count: { select: { questions: true } } },
    });

    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam._count.questions === 0) {
      return { success: false, error: "문제가 없는 시험은 배포할 수 없습니다." };
    }

    await prisma.exam.update({
      where: { id: examId },
      data: { status: "PUBLISHED" },
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 배포 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Exam Questions
// ---------------------------------------------------------------------------

export async function addQuestionsToExam(
  examId: string,
  questionIds: string[]
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0-1 guard: both the target exam and every question being attached
    // must live in the caller's academy. Previously, a crafted payload
    // could graft this academy's questions onto another tenant's exam,
    // or vice-versa.
    await assertExamBelongsToAcademy(examId, staff.academyId);
    await assertQuestionsBelongToAcademy(questionIds, staff.academyId);

    const maxOrder = await prisma.examQuestion.findFirst({
      where: { examId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });

    let nextOrder = (maxOrder?.orderNum || 0) + 1;

    await prisma.examQuestion.createMany({
      data: questionIds.map((qId) => ({
        examId,
        questionId: qId,
        points: 1,
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

    // Verify the examQuestion row actually belongs to an exam owned by
    // this academy. Without this, an attacker could delete any
    // ExamQuestion row they know the id of.
    const link = await prisma.examQuestion.findFirst({
      where: {
        id: examQuestionId,
        examId,
        exam: { academyId: staff.academyId },
      },
      select: { id: true },
    });
    if (!link) {
      return { success: false, error: "문제 연결을 찾을 수 없습니다." };
    }

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

    // Every ExamQuestion id must belong to an exam in this academy, and
    // to the specific exam being reordered. Otherwise a payload could
    // re-number unrelated ExamQuestion rows across tenants.
    await assertExamBelongsToAcademy(examId, staff.academyId);
    if (orderedIds.length > 0) {
      const valid = await prisma.examQuestion.findMany({
        where: {
          id: { in: orderedIds },
          examId,
        },
        select: { id: true },
      });
      if (valid.length !== new Set(orderedIds).size) {
        return {
          success: false,
          error: "일부 문제 연결이 이 시험에 속하지 않습니다.",
        };
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
// Submissions & Grading
// ---------------------------------------------------------------------------

export async function getExamSubmissions(examId: string) {
  const staff = await requireStaffAuth();

  // Only return submissions when the exam belongs to this academy.
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: staff.academyId },
    select: { id: true },
  });
  if (!exam) return [];

  const submissions = await prisma.examSubmission.findMany({
    where: { examId },
    include: {
      student: { select: { id: true, name: true, studentCode: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  return submissions;
}

export async function gradeSubmission(
  submissionId: string,
  grades: GradeInput[],
  totalScore: number
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Scope the submission to the caller's academy. Previously any staff
    // could grade any submission across tenants given its id.
    const submission = await prisma.examSubmission.findFirst({
      where: { id: submissionId, exam: { academyId: staff.academyId } },
      include: { exam: true },
    });

    if (!submission) {
      return { success: false, error: "제출을 찾을 수 없습니다." };
    }

    const existingAnswers = JSON.parse(submission.answers || "{}");
    const gradedAnswers = { ...existingAnswers };

    for (const grade of grades) {
      if (!gradedAnswers[grade.questionId]) {
        gradedAnswers[grade.questionId] = {};
      }
      if (typeof gradedAnswers[grade.questionId] === "string") {
        gradedAnswers[grade.questionId] = {
          answer: gradedAnswers[grade.questionId],
        };
      }
      gradedAnswers[grade.questionId].manualScore = grade.score;
      gradedAnswers[grade.questionId].feedback = grade.feedback || "";
    }

    await prisma.examSubmission.update({
      where: { id: submissionId },
      data: {
        answers: JSON.stringify(gradedAnswers),
        score: totalScore,
        maxScore: submission.exam.totalPoints,
        percent:
          submission.exam.totalPoints > 0
            ? (totalScore / submission.exam.totalPoints) * 100
            : 0,
        status: "GRADED",
        gradedAt: new Date(),
        gradedBy: staff.id,
      },
    });

    revalidatePath(`/director/exams/${submission.examId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "채점 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function getExamAnalytics(examId: string) {
  const staff = await requireStaffAuth();

  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: staff.academyId },
    include: {
      questions: {
        include: { question: true },
        orderBy: { orderNum: "asc" },
      },
      submissions: {
        where: { status: "GRADED" },
      },
    },
  });

  if (!exam) return null;

  const submissions = exam.submissions;
  const scores = submissions
    .map((s) => s.score)
    .filter((s): s is number => s !== null);

  const totalStudents = submissions.length;
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  const distribution = Array(10).fill(0);
  for (const s of submissions) {
    if (s.percent != null) {
      const bucket = Math.min(Math.floor(s.percent / 10), 9);
      distribution[bucket]++;
    }
  }

  const parsedAnswersBySubmission = submissions.map((sub) => {
    try {
      return JSON.parse(sub.answers || "{}") as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  });

  const questionAnalysis = exam.questions.map((eq) => {
    let correctCount = 0;
    const correctAnswerNorm = eq.question.correctAnswer.trim().toLowerCase();
    for (const answers of parsedAnswersBySubmission) {
      const answer = answers[eq.questionId];
      if (answer) {
        const answerText =
          typeof answer === "string" ? answer : (answer as Record<string, string>).answer || "";
        if (answerText.trim().toLowerCase() === correctAnswerNorm) {
          correctCount++;
        }
      }
    }
    return {
      questionId: eq.questionId,
      orderNum: eq.orderNum,
      questionText: eq.question.questionText,
      correctRate:
        totalStudents > 0
          ? Math.round((correctCount / totalStudents) * 100)
          : 0,
    };
  });

  return {
    totalStudents,
    avgScore: Math.round(avgScore * 10) / 10,
    maxScore,
    minScore,
    distribution,
    questionAnalysis,
  };
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
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const where: Record<string, unknown> = { academyId };

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
// Classes helper (for filters)
// ---------------------------------------------------------------------------

export async function getClassesForFilter(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const classes = await prisma.class.findMany({
    where: { academyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return classes;
}

export async function getSchoolsForFilter(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const schools = await prisma.school.findMany({
    where: { academyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return schools;
}

// ---------------------------------------------------------------------------
// Exam Collections — Folder-like organization for exams
// ---------------------------------------------------------------------------

export async function getExamCollections(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];
  const collections = await prisma.examCollection.findMany({
    where: { academyId },
    include: {
      _count: { select: { items: true, children: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return collections.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    description: c.description,
    color: c.color,
    _count: { items: c._count.items, children: c._count.children },
  }));
}

export async function getExamCollectionMembership(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return {};
  const items = await prisma.examCollectionItem.findMany({
    where: { collection: { academyId } },
    select: { collectionId: true, examId: true },
  });
  const membership: Record<string, string[]> = {};
  for (const item of items) {
    if (!membership[item.collectionId]) membership[item.collectionId] = [];
    membership[item.collectionId].push(item.examId);
  }
  return membership;
}

export async function createExamCollection(data: {
  name: string;
  description?: string;
  parentId?: string;
  color?: string;
}): Promise<ActionResult> {
  const staff = await requireStaffAuth();
  try {
    // If a parent folder is provided, make sure it's also in this academy —
    // otherwise the caller could nest a folder under another tenant's tree.
    if (data.parentId) {
      await assertExamCollectionBelongsToAcademy(data.parentId, staff.academyId);
    }

    const collection = await prisma.examCollection.create({
      data: {
        academyId: staff.academyId,
        name: data.name,
        description: data.description || null,
        parentId: data.parentId || null,
        color: data.color || null,
      },
    });
    revalidatePath("/director/exams");
    return { success: true, id: collection.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 생성 실패";
    return { success: false, error: message };
  }
}

export async function updateExamCollection(
  collectionId: string,
  data: { name?: string; description?: string }
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);

    await prisma.examCollection.update({ where: { id: collectionId }, data });
    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 수정 실패";
    return { success: false, error: message };
  }
}

export async function deleteExamCollection(collectionId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);

    await prisma.examCollection.delete({ where: { id: collectionId } });
    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 삭제 실패";
    return { success: false, error: message };
  }
}

export async function addExamsToCollection(
  collectionId: string,
  examIds: string[]
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);
    await assertExamsBelongToAcademy(examIds, staff.academyId);

    const maxItem = await prisma.examCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { orderNum: "desc" },
      select: { orderNum: true },
    });
    const startOrder = (maxItem?.orderNum ?? -1) + 1;

    await prisma.examCollectionItem.createMany({
      data: examIds.map((examId, idx) => ({
        collectionId,
        examId,
        orderNum: startOrder + idx,
      })),
      skipDuplicates: true,
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더 추가 실패";
    return { success: false, error: message };
  }
}

export async function removeExamsFromCollection(
  collectionId: string,
  examIds: string[]
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();
    await assertExamCollectionBelongsToAcademy(collectionId, staff.academyId);
    // examIds don't need academy verification here because deleteMany is
    // scoped by { collectionId, examId in: ... } and the collection itself
    // has already been proven to belong to this academy. Rows referencing
    // foreign examIds simply won't match and will no-op.

    await prisma.examCollectionItem.deleteMany({
      where: { collectionId, examId: { in: examIds } },
    });
    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "폴더에서 제거 실패";
    return { success: false, error: message };
  }
}

// ── Backward-compatible stubs for old (admin) routes ──

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

    // Scope the exam lookup to this academy so we cannot plant a question
    // in someone else's exam (and thereby inherit their academyId).
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true, academyId: true },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };

    if (data.passageId) {
      const passage = await prisma.passage.findFirst({
        where: { id: data.passageId, academyId: staff.academyId },
        select: { id: true },
      });
      if (!passage) {
        return { success: false, error: "지문을 찾을 수 없습니다." };
      }
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
      data: { examId, questionId: question.id, orderNum: data.questionNumber, points: data.points ?? 1 },
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
    return { success: false, error: e instanceof Error ? e.message : "생성 실패" };
  }
}

export async function deleteQuestion(questionId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Scope the question to this academy — otherwise any id leaks let
    // anyone delete any other tenant's question row.
    const question = await prisma.question.findFirst({
      where: { id: questionId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!question) {
      return { success: false, error: "문제를 찾을 수 없습니다." };
    }

    await prisma.examQuestion.deleteMany({ where: { questionId } });
    await prisma.question.delete({ where: { id: questionId } });
    revalidatePath(`/admin`);
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "삭제 실패" };
  }
}
