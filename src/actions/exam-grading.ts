"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GradeInput {
  questionId: string;
  score: number;
  feedback?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export async function getExamSubmissions(examId: string) {
  await requireStaffAuth();

  const submissions = await prisma.examSubmission.findMany({
    where: { examId },
    include: {
      student: { select: { id: true, name: true, studentCode: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  return submissions;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export async function gradeSubmission(
  submissionId: string,
  grades: GradeInput[],
  totalScore: number
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    const submission = await prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: { exam: true },
    });

    if (!submission) {
      return { success: false, error: "제출을 찾을 수 없습니다." };
    }

    // Parse existing answers and merge with grades
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

    // StudentAnalytics 자동 갱신 (fire-and-forget)
    import("./learning-analytics")
      .then((mod) => mod.updateStudentAnalytics(submission.studentId))
      .catch(() => {});

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "채점 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function getExamAnalytics(examId: string) {
  await requireStaffAuth();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
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
  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  // Score distribution (0-10, 10-20, ..., 90-100)
  const distribution = Array(10).fill(0);
  for (const s of submissions) {
    if (s.percent != null) {
      const bucket = Math.min(Math.floor(s.percent / 10), 9);
      distribution[bucket]++;
    }
  }

  // Parse all submission answers once
  const parsedAnswersBySubmission = submissions.map((sub) => {
    try {
      return JSON.parse(sub.answers || "{}") as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  });

  // Question-level analysis
  const questionAnalysis = exam.questions.map((eq) => {
    let correctCount = 0;
    const correctAnswerNorm = eq.question.correctAnswer.trim().toLowerCase();
    for (const answers of parsedAnswersBySubmission) {
      const answer = answers[eq.questionId];
      if (answer) {
        const answerText =
          typeof answer === "string"
            ? answer
            : (answer as Record<string, string>).answer || "";
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
