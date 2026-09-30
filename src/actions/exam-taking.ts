"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getStudentSession } from "@/lib/auth-student";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { isSameObjectiveAnswerForSubtype } from "@/lib/sentence-insert-options";
import { isKoQuestionType } from "@/lib/korean/registry";
import { buildKoStudentExamText } from "@/lib/korean/student-exam-text";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActionResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// 학생 화면용 questionText (KO-LEAK-2 게이트)
// ---------------------------------------------------------------------------
// KO(국어) 문항의 DB questionText 는 지문 미동봉 직렬화라, 응시/결과 화면에는
// Passage 관계 원문으로 마킹 지문·【보기】·【조건】을 재구성해 내려보낸다
// (toRenderModel 경유 — 정답·해설·evidence 절대 미포함, 실패 시 저장본 폴백).
// 영어 문항은 기존 경로(repairGrammarCorrectionQuestionText) byte 불변.
function buildStudentQuestionText(question: {
  subType: string | null;
  questionText: string;
  structuredData: unknown;
  passage?: { content: string | null } | null;
}): string {
  if (isKoQuestionType(question.subType)) {
    return buildKoStudentExamText(question);
  }
  return repairGrammarCorrectionQuestionText({
    subType: question.subType,
    questionText: question.questionText,
    structuredData: question.structuredData,
  });
}

// ---------------------------------------------------------------------------
// Student Exam Actions
//
// 인증·범위(IDOR 수리 26-09-30): 이 액션들은 예전에 인증 없이 클라이언트가 준 studentId·
// submissionId 를 그대로 믿었다(남의 시험 문항·정답·해설을 읽고 답안을 바꿀 수 있었다).
// 이제 학생 세션(student-session 쿠키)의 studentId·academyId 와 맞을 때만 동작한다.
// 호출 화면(/exams)은 localStorage studentId 를 읽는데 그 값을 쓰는 코드가 없어 지금은
// 「로그인이 필요합니다」로 멈춰 있다 — 정상 흐름에는 영향이 없다(운영 SELECT: 응시 12건 전부 같은 학원).
// ---------------------------------------------------------------------------

/** 학생 세션이 있고 그 학생이 요청한 studentId 와 같을 때만 세션을 돌려준다. */
async function studentSessionFor(studentId: unknown) {
  const session = await getStudentSession();
  if (!session || typeof studentId !== "string" || session.studentId !== studentId) {
    return null;
  }
  return session;
}

/** 로그인한 학생 본인의 응시 행 id 인지 확인한다(아니면 null). */
async function ownSubmissionId(submissionId: unknown): Promise<string | null> {
  const session = await getStudentSession();
  if (!session || typeof submissionId !== "string") return null;
  const row = await prisma.examSubmission.findFirst({
    where: { id: submissionId, studentId: session.studentId },
    select: { id: true },
  });
  return row ? row.id : null;
}

export async function getAvailableExams(studentId: string) {
  if (!(await studentSessionFor(studentId))) return [];
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
      // 휴지통 가드 — 학생에게 보이는 문항 수도 삭제된 문제를 빼고 센다.
      _count: { select: { questions: { where: { question: { deletedAt: null } } } } },
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
    const session = await studentSessionFor(studentId);
    if (!session) return { success: false, error: "로그인이 필요합니다." };

    // Check if exam exists and is available — 학생의 학원 시험만.
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: session.academyId },
      include: {
        questions: {
          // 휴지통(soft delete) 가드 — 삭제된 문제는 학생 시험화면에 절대 노출 금지.
          where: { question: { deletedAt: null } },
          include: {
            question: {
              select: {
                id: true,
                type: true,
                subType: true,
                questionText: true,
                structuredData: true,
                questionImage: true,
                options: true,
                points: true,
                // KO 지문 재구성용(KO-LEAK-2) — 학생에게는 조립된 텍스트만 내려간다.
                passage: { select: { content: true } },
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
      subType: eq.question.subType,
      questionText: buildStudentQuestionText(eq.question),
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
    if (!(await ownSubmissionId(submissionId))) {
      return { success: false, error: "답안을 저장할 수 없습니다." };
    }
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
  } catch {
    return { success: false, error: "답안 저장 실패" };
  }
}

export async function submitExam(
  submissionId: string
): Promise<ActionResult> {
  try {
    if (!(await ownSubmissionId(submissionId))) {
      return { success: false, error: "제출을 찾을 수 없습니다." };
    }
    const submission = await prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: {
        exam: {
          include: {
            questions: {
              // 휴지통 가드 — 자동채점은 삭제된 문제를 점수/배점에서 제외(startExam 과 동일 집합).
              where: { question: { deletedAt: null } },
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
          if (isSameObjectiveAnswerForSubtype(q.subType, answerText, q.correctAnswer)) {
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

/**
 * 결과를 볼 수 있는 응시 상태 — 제출(SUBMITTED)·채점(GRADED)뿐. 배정(ASSIGNED)·응시 중(IN_PROGRESS)에
 * 결과를 돌려주면 시험 도중 서버 액션을 직접 불러 정답·해설을 받아 갈 수 있다(IDOR-R4, 26-09-30).
 */
const RESULT_VISIBLE_STATUSES = ["SUBMITTED", "GRADED"];

export async function getExamResult(submissionId: string) {
  // 학생 결과 화면(/exams/[examId]/result) 전용 — 교사 화면은 exam-grading·submission-review 액션을 쓴다.
  // 결과 화면이 꺼져 있으면(SHOW_USER_RESULTS, 화면과 같은 플래그) 서버도 돌려주지 않는다.
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) return null;
  // 정답·해설이 담기므로 로그인한 학생 본인의, 제출을 마친 응시 결과만 돌려준다.
  if (!(await ownSubmissionId(submissionId))) return null;
  const submission = await prisma.examSubmission.findFirst({
    where: { id: submissionId, status: { in: RESULT_VISIBLE_STATUSES } },
    include: {
      exam: {
        include: {
          questions: {
            // 휴지통 가드 — 학생 결과/리뷰 화면에 삭제된 문제(정답·해설 포함)가 노출되면 안 된다.
            where: { question: { deletedAt: null } },
            include: {
              question: {
                include: {
                  explanation: true,
                  // KO 지문 재구성용(KO-LEAK-2) — startExam 과 동일 게이트.
                  passage: { select: { content: true } },
                },
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
        ? isSameObjectiveAnswerForSubtype(q.subType, answerText, q.correctAnswer)
        : null;

    return {
      orderNum: eq.orderNum,
      points: eq.points,
      questionId: q.id,
      type: q.type,
      subType: q.subType,
      questionText: buildStudentQuestionText(q),
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
