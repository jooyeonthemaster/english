"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { isSameObjectiveAnswerForSubtype } from "@/lib/sentence-insert-options";
import type { ActionResult, GradeInput } from "./_types";

// ---------------------------------------------------------------------------
// 응시(submission) 조회 / 채점 / 분석
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
  totalScore: number,
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
      error instanceof Error ? error.message : "채점 중 오류가 발생했습니다.";
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
  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
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
    for (const answers of parsedAnswersBySubmission) {
      const answer = answers[eq.questionId];
      if (answer) {
        const answerText =
          typeof answer === "string"
            ? answer
            : (answer as Record<string, string>).answer || "";
        if (isSameObjectiveAnswerForSubtype(eq.question.subType, answerText, eq.question.correctAnswer)) {
          correctCount++;
        }
      }
    }
    return {
      questionId: eq.questionId,
      orderNum: eq.orderNum,
      questionText: repairGrammarCorrectionQuestionText({
        subType: eq.question.subType,
        questionText: eq.question.questionText,
        structuredData: eq.question.structuredData,
      }),
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
