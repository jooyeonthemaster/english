// @ts-nocheck — studySeason model not yet in schema (pending migration)
"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { revalidatePath } from "next/cache";
import {
  LEARNING_XP,
  type SessionType,
} from "@/lib/learning-constants";
import type { SessionResult } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

function calculateMastery(sessions: { score: number; sessionType: string }[]): number {
  if (sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + s.score, 0);
  return Math.round(total / sessions.length);
}

function summarizeQuestionText(subType: string | null, raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      if (parsed.question) return parsed.question;
      if (parsed.text) return parsed.text;
      if (parsed.passage) return parsed.passage.substring(0, 60) + "…";
    }
  } catch {}
  if (raw.length > 80) return raw.substring(0, 80) + "…";
  return raw;
}

// ---------------------------------------------------------------------------
// submitSession — 세션 완료 제출
// ---------------------------------------------------------------------------

export async function submitSession(data: {
  passageId: string;
  sessionType: SessionType;
  seasonId?: string;
  answers: { questionId: string; givenAnswer: string; isCorrect: boolean }[];
  startedAt: string;
}): Promise<SessionResult> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const correctCount = data.answers.filter((a) => a.isCorrect).length;
  const totalCount = data.answers.length;
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  // XP 배율 체크 (데일리 미션)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mission = await prisma.studentDailyMission.findUnique({
    where: { studentId_date: { studentId, date: today } },
  });

  let multiplier = 1;
  if (
    mission?.multiplierActive &&
    mission.multiplierExpiresAt &&
    new Date() < mission.multiplierExpiresAt
  ) {
    multiplier = mission.multiplierActive;
  }

  const baseXp =
    data.sessionType === "STORIES"
      ? LEARNING_XP.STORIES_COMPLETE
      : LEARNING_XP.SESSION_COMPLETE;
  const perfectBonus = score === 100 ? LEARNING_XP.PERFECT_SESSION : 0;
  const xpEarned = Math.round((baseXp + perfectBonus) * multiplier);

  // 오답 문제 ID
  const wrongAnswers = data.answers.filter((a) => !a.isCorrect);
  const wrongQuestionIds = wrongAnswers.map((a) => a.questionId);

  // 트랜잭션: 세션 기록 + 오답 로그 (원자적 처리)
  const [sessionRecord] = await prisma.$transaction([
    prisma.sessionRecord.create({
      data: {
        studentId,
        passageId: data.passageId,
        seasonId: data.seasonId,
        sessionType: data.sessionType,
        score,
        correctCount,
        totalCount,
        wrongQuestionIds: JSON.stringify(wrongQuestionIds),
        xpEarned,
        startedAt: new Date(data.startedAt),
        completedAt: new Date(),
      },
    }),
    ...wrongAnswers.map((wa) =>
      prisma.naeshinWrongAnswerLog.upsert({
        where: { studentId_questionId: { studentId, questionId: wa.questionId } },
        create: {
          studentId,
          questionId: wa.questionId,
          givenAnswer: wa.givenAnswer,
          category: undefined,
        },
        update: {
          count: { increment: 1 },
          lastWrongAt: new Date(),
          givenAnswer: wa.givenAnswer,
        },
      })
    ),
  ]);

  // 후속 처리: XP + 레슨 진행도 + 스트릭 + 일별 기록 (병렬)
  const [, lessonProgress] = await Promise.all([
    addXpInternal(studentId, xpEarned),
    updateLessonProgress(studentId, data.passageId, data.sessionType, data.seasonId),
    updateStreak(studentId),
    prisma.studyProgress.upsert({
      where: { studentId_date: { studentId, date: today } },
      create: { studentId, date: today, questionsAnswered: totalCount, xpEarned },
      update: {
        questionsAnswered: { increment: totalCount },
        xpEarned: { increment: xpEarned },
      },
    }),
  ]);

  revalidatePath("/student");

  // 오답 문제 상세 가져오기 (NaeshinQuestion)
  const wrongDetails = wrongQuestionIds.length > 0
    ? await prisma.naeshinQuestion.findMany({
        where: { id: { in: wrongQuestionIds } },
        select: { id: true, subType: true, questionText: true, correctAnswer: true },
      })
    : [];

  const wrongMap = new Map(wrongDetails.map((q) => [q.id, q]));

  return {
    sessionType: data.sessionType,
    score,
    correctCount,
    totalCount,
    xpEarned,
    xpMultiplier: multiplier,
    wrongQuestions: wrongAnswers.map((wa) => {
      const q = wrongMap.get(wa.questionId);
      return {
        questionId: wa.questionId,
        questionText: q ? summarizeQuestionText(q.subType, q.questionText) : "",
        givenAnswer: wa.givenAnswer,
        correctAnswer: q?.correctAnswer ?? "",
      };
    }),
    lessonProgress: {
      session1Done: lessonProgress.session1Done,
      session2Done: lessonProgress.session2Done,
      storiesDone: lessonProgress.storiesDone,
      session3Done: lessonProgress.session3Done,
      session4Done: lessonProgress.session4Done,
      session5Done: lessonProgress.session5Done,
      masteryScore: lessonProgress.masteryScore,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function addXpInternal(studentId: string, amount: number) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { xp: true, level: true },
  });
  if (!student) return;

  let newXp = student.xp + amount;
  let newLevel = student.level;
  while (newXp >= xpForLevel(newLevel)) {
    newXp -= xpForLevel(newLevel);
    newLevel++;
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { xp: newXp, level: newLevel },
  });
}

async function updateLessonProgress(
  studentId: string,
  passageId: string,
  sessionType: SessionType,
  seasonId?: string
) {
  const sessionFieldMap: Record<string, string> = {
    MIX_1: "session1Done",
    MIX_2: "session2Done",
    STORIES: "storiesDone",
    VOCAB_FOCUS: "session3Done",
    GRAMMAR_FOCUS: "session4Done",
    WEAKNESS_FOCUS: "session5Done",
  };

  const field = sessionFieldMap[sessionType];

  const allSessions = await prisma.sessionRecord.findMany({
    where: { studentId, passageId },
    select: { score: true, sessionType: true },
  });
  const mastery = calculateMastery(allSessions);

  const progress = await prisma.lessonProgress.upsert({
    where: {
      studentId_passageId_seasonId: {
        studentId,
        passageId,
        seasonId: seasonId ?? "",
      },
    },
    create: {
      studentId,
      passageId,
      seasonId,
      [field]: true,
      masteryScore: mastery,
    },
    update: {
      [field]: true,
      masteryScore: mastery,
    },
  });

  return progress;
}

async function updateStreak(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { streak: true, lastStudyDate: true, streakFreezeCount: true },
  });
  if (!student) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = student.lastStudyDate
    ? new Date(student.lastStudyDate)
    : null;
  if (lastDate) lastDate.setHours(0, 0, 0, 0);

  if (lastDate && lastDate.getTime() === today.getTime()) return;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreak = student.streak;

  if (lastDate && lastDate.getTime() === yesterday.getTime()) {
    newStreak++;
  } else if (lastDate && lastDate.getTime() < yesterday.getTime()) {
    const daysMissed = Math.floor(
      (yesterday.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysMissed === 1 && student.streakFreezeCount > 0) {
      await prisma.student.update({
        where: { id: studentId },
        data: { streakFreezeCount: { decrement: 1 } },
      });
      newStreak++;
    } else {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  await prisma.student.update({
    where: { id: studentId },
    data: {
      streak: newStreak,
      lastStudyDate: today,
    },
  });
}
