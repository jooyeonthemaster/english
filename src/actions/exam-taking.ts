"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActionResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Student Exam Actions
// ---------------------------------------------------------------------------

export async function getAvailableExams(studentId: string) {
  // Get student's class enrollments
  const enrollments = await prisma.classEnrollment.findMany({
    where: { studentId, status: "ENROLLED" },
    select: { classId: true },
  });

  const classIds = enrollments.map((e) => e.classId);

  // Get published or in-progress exams for student's classes + exams with no class (academy-wide)
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { academyId: true },
  });

  if (!student) return [];

  const exams = await prisma.exam.findMany({
    where: {
      academyId: student.academyId,
      status: { in: ["PUBLISHED", "IN_PROGRESS"] },
      OR: [
        { classId: { in: classIds } },
        { classId: null },
      ],
    },
    include: {
      class: { select: { id: true, name: true } },
      _count: { select: { questions: true } },
      submissions: {
        where: { studentId },
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          percent: true,
          submittedAt: true,
        },
      },
    },
    orderBy: { examDate: "desc" },
  });

  return exams.map((exam) => ({
    id: exam.id,
    title: exam.title,
    type: exam.type,
    examDate: exam.examDate,
    duration: exam.duration,
    totalPoints: exam.totalPoints,
    questionCount: exam._count.questions,
    className: exam.class?.name || "전체",
    submission: exam.submissions[0] || null,
  }));
}

export async function startExam(
  examId: string,
  studentId: string
): Promise<ActionResult> {
  try {
    // Check if exam exists and is available
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                questionText: true,
                questionImage: true,
                options: true,
                points: true,
              },
            },
          },
          orderBy: { orderNum: "asc" },
        },
      },
    });

    if (!exam) {
      return { success: false, error: "시험을 찾을 수 없습니다." };
    }

    if (!["PUBLISHED", "IN_PROGRESS"].includes(exam.status)) {
      return { success: false, error: "현재 응시할 수 없는 시험입니다." };
    }

    // Check for existing submission
    const existing = await prisma.examSubmission.findUnique({
      where: { examId_studentId: { examId, studentId } },
    });

    if (existing && existing.status === "SUBMITTED") {
      return { success: false, error: "이미 제출한 시험입니다." };
    }

    if (existing && existing.status === "GRADED") {
      return { success: false, error: "이미 채점이 완료된 시험입니다." };
    }

    // Create or get submission
    let submission;
    if (existing && existing.status === "IN_PROGRESS") {
      submission = existing;
    } else {
      submission = await prisma.examSubmission.create({
        data: {
          examId,
          studentId,
          answers: "{}",
          status: "IN_PROGRESS",
        },
      });

      // Update exam status to IN_PROGRESS if it was PUBLISHED
      if (exam.status === "PUBLISHED") {
        await prisma.exam.update({
          where: { id: examId },
          data: { status: "IN_PROGRESS" },
        });
      }
    }

    // Prepare questions (potentially shuffled)
    let questions = exam.questions.map((eq) => ({
      examQuestionId: eq.id,
      questionId: eq.question.id,
      orderNum: eq.orderNum,
      points: eq.points,
      type: eq.question.type,
      questionText: eq.question.questionText,
      questionImage: eq.question.questionImage,
      options: eq.question.options ? JSON.parse(eq.question.options) : null,
    }));

    if (exam.shuffleQuestions) {
      questions = questions.sort(() => Math.random() - 0.5);
    }

    // Parse existing answers
    const savedAnswers = JSON.parse(submission.answers || "{}");

    return {
      success: true,
      data: {
        submissionId: submission.id,
        examTitle: exam.title,
        duration: exam.duration,
        startedAt: submission.startedAt,
        totalPoints: exam.totalPoints,
        shuffleOptions: exam.shuffleOptions,
        questions,
        savedAnswers,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 시작 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function saveAnswer(
  submissionId: string,
  questionId: string,
  answer: string
): Promise<ActionResult> {
  try {
    const submission = await prisma.examSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission || submission.status !== "IN_PROGRESS") {
      return { success: false, error: "답안을 저장할 수 없습니다." };
    }

    const answers = JSON.parse(submission.answers || "{}");
    answers[questionId] = answer;

    await prisma.examSubmission.update({
      where: { id: submissionId },
      data: { answers: JSON.stringify(answers) },
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: "답안 저장 실패" };
  }
}

export async function submitExam(
  submissionId: string
): Promise<ActionResult> {
  try {
    const submission = await prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: {
        exam: {
          include: {
            questions: {
              include: {
                question: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      return { success: false, error: "제출을 찾을 수 없습니다." };
    }

    if (submission.status !== "IN_PROGRESS") {
      return { success: false, error: "이미 제출된 시험입니다." };
    }

    const answers = JSON.parse(submission.answers || "{}");

    // Auto-grade multiple choice questions
    let autoScore = 0;
    let maxAutoScore = 0;
    let hasManualGrading = false;

    for (const eq of submission.exam.questions) {
      const q = eq.question;
      const studentAnswer = answers[q.id];

      if (q.type === "MULTIPLE_CHOICE" || q.type === "VOCAB") {
        maxAutoScore += eq.points;
        if (studentAnswer) {
          const answerText =
            typeof studentAnswer === "string"
              ? studentAnswer
              : studentAnswer?.answer || "";
          if (
            answerText.trim().toLowerCase() ===
            q.correctAnswer.trim().toLowerCase()
          ) {
            autoScore += eq.points;
          }
        }
      } else {
        // SHORT_ANSWER, ESSAY, FILL_BLANK need manual grading
        hasManualGrading = true;
      }
    }

    const totalPoints = submission.exam.totalPoints;
    const finalStatus = hasManualGrading ? "SUBMITTED" : "GRADED";

    await prisma.examSubmission.update({
      where: { id: submissionId },
      data: {
        status: finalStatus,
        score: hasManualGrading ? null : autoScore,
        maxScore: totalPoints,
        percent: hasManualGrading
          ? null
          : totalPoints > 0
            ? (autoScore / totalPoints) * 100
            : 0,
        submittedAt: new Date(),
        gradedAt: hasManualGrading ? null : new Date(),
      },
    });

    revalidatePath("/exams");
    return {
      success: true,
      data: {
        autoScore,
        maxAutoScore,
        hasManualGrading,
        status: finalStatus,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 제출 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function getExamResult(submissionId: string) {
  const submission = await prisma.examSubmission.findUnique({
    where: { id: submissionId },
    include: {
      exam: {
        include: {
          questions: {
            include: {
              question: {
                include: { explanation: true },
              },
            },
            orderBy: { orderNum: "asc" },
          },
        },
      },
      student: { select: { id: true, name: true } },
    },
  });

  if (!submission) return null;

  const answers = JSON.parse(submission.answers || "{}");

  const questions = submission.exam.questions.map((eq) => {
    const q = eq.question;
    const studentAnswer = answers[q.id];
    const answerText =
      typeof studentAnswer === "string"
        ? studentAnswer
        : studentAnswer?.answer || "";
    const isCorrect =
      q.type === "MULTIPLE_CHOICE" || q.type === "VOCAB"
        ? answerText.trim().toLowerCase() ===
          q.correctAnswer.trim().toLowerCase()
        : null;

    return {
      orderNum: eq.orderNum,
      points: eq.points,
      questionId: q.id,
      type: q.type,
      questionText: q.questionText,
      options: q.options ? JSON.parse(q.options) : null,
      correctAnswer: q.correctAnswer,
      studentAnswer: answerText,
      isCorrect,
      manualScore:
        typeof studentAnswer === "object"
          ? studentAnswer?.manualScore
          : undefined,
      feedback:
        typeof studentAnswer === "object"
          ? studentAnswer?.feedback
          : undefined,
      explanation: q.explanation?.content || null,
    };
  });

  return {
    id: submission.id,
    examId: submission.examId,
    examTitle: submission.exam.title,
    examType: submission.exam.type,
    studentName: submission.student.name,
    score: submission.score,
    maxScore: submission.maxScore,
    percent: submission.percent,
    status: submission.status,
    startedAt: submission.startedAt,
    submittedAt: submission.submittedAt,
    gradedAt: submission.gradedAt,
    questions,
  };
}
