"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SubmitTestResultData {
  listId: string;
  testType: "EN_TO_KR" | "KR_TO_EN" | "SPELLING";
  score: number;
  total: number;
  percent: number;
  duration: number; // seconds
}

interface WrongAnswerItem {
  itemId: string;
  testType: "EN_TO_KR" | "KR_TO_EN" | "SPELLING";
  givenAnswer: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Submit test result
// ---------------------------------------------------------------------------
export async function submitTestResult(
  data: SubmitTestResultData
): Promise<ActionResult> {
  try {
    const session = await getStudentSession();
    if (!session) {
      return { success: false, error: "인증이 필요합니다." };
    }

    const result = await prisma.vocabTestResult.create({
      data: {
        studentId: session.studentId,
        listId: data.listId,
        testType: data.testType,
        score: data.score,
        total: data.total,
        percent: data.percent,
        duration: data.duration,
      },
    });

    // Update daily study progress
    await updateStudyProgress(session.studentId, data.percent);

    return { success: true, id: result.id };
  } catch (error) {
    console.error("submitTestResult error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "테스트 결과 저장 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Record wrong answers
// ---------------------------------------------------------------------------
export async function recordWrongAnswers(
  wrongItems: WrongAnswerItem[]
): Promise<ActionResult> {
  try {
    const session = await getStudentSession();
    if (!session) {
      return { success: false, error: "인증이 필요합니다." };
    }

    // Upsert each wrong answer (increment count if exists)
    for (const item of wrongItems) {
      await prisma.wrongVocabAnswer.upsert({
        where: {
          studentId_itemId_testType: {
            studentId: session.studentId,
            itemId: item.itemId,
            testType: item.testType,
          },
        },
        create: {
          studentId: session.studentId,
          itemId: item.itemId,
          testType: item.testType,
          givenAnswer: item.givenAnswer,
          count: 1,
          lastMissedAt: new Date(),
        },
        update: {
          givenAnswer: item.givenAnswer,
          count: { increment: 1 },
          lastMissedAt: new Date(),
        },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("recordWrongAnswers error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "오답 기록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Update daily study progress
// ---------------------------------------------------------------------------
async function updateStudyProgress(
  studentId: string,
  latestPercent: number
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.studyProgress.upsert({
    where: {
      studentId_date: {
        studentId,
        date: today,
      },
    },
    create: {
      studentId,
      date: today,
      vocabTests: 1,
      vocabScore: latestPercent,
    },
    update: {
      vocabTests: { increment: 1 },
      vocabScore: latestPercent,
    },
  });
}
