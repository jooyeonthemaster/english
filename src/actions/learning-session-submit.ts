"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  LEARNING_XP,
  MASTERY_FAIL_THRESHOLD,
  type SessionType,
} from "@/lib/learning-constants";
import type { SessionResult, QuestProgressUpdate } from "@/lib/learning-types";
import { getActiveMultiplier, updateQuestProgress } from "./learning-gamification";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

function summarizeQuestionText(subType: string | null, raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      if (parsed.question) return parsed.question;
      if (parsed.word) return `단어: ${parsed.word}`;
      if (parsed.englishSentence) return parsed.englishSentence.slice(0, 80);
      if (parsed.statement) return parsed.statement.slice(0, 80);
      if (parsed.sentence) return parsed.sentence.slice(0, 80);
      if (parsed.text) return parsed.text;
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
  sessionSeq: number;
  seasonId?: string;
  answers: { questionId: string; givenAnswer: string; isCorrect: boolean }[];
  startedAt: string;
}): Promise<SessionResult> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const correctCount = data.answers.filter((a) => a.isCorrect).length;
  const totalCount = data.answers.length;
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  // 마스터리 실패 판정
  const isMastery = data.sessionType === "MASTERY";
  const wrongCount = data.answers.filter((a) => !a.isCorrect).length;
  const masteryFailed = isMastery && wrongCount >= MASTERY_FAIL_THRESHOLD;
  const masteryPassed = isMastery && !masteryFailed;

  // XP 계산
  const multiplier = await getActiveMultiplier(studentId);
  const baseXp = isMastery
    ? (masteryPassed ? LEARNING_XP.MASTERY_COMPLETE : 0)
    : LEARNING_XP.SESSION_COMPLETE;
  const perfectBonus = score === 100 ? LEARNING_XP.PERFECT_SESSION : 0;
  const xpEarned = masteryFailed ? 0 : Math.round((baseXp + perfectBonus) * multiplier);

  // 오답 처리
  const wrongAnswers = data.answers.filter((a) => !a.isCorrect);
  const wrongQuestionIds = wrongAnswers.map((a) => a.questionId);

  // 카테고리별 정답 집계
  const allQuestionIds = data.answers.map((a) => a.questionId);
  const questions = allQuestionIds.length > 0
    ? await prisma.naeshinQuestion.findMany({
        where: { id: { in: allQuestionIds } },
        select: { id: true, learningCategory: true, subType: true },
      })
    : [];
  const categoryMap = new Map(questions.map((q) => [q.id, q.learningCategory]));
  const subTypeMap = new Map(questions.map((q) => [q.id, q.subType ?? ""]));

  const catStats = {
    VOCAB: { correct: 0, total: 0 },
    INTERPRETATION: { correct: 0, total: 0 },
    GRAMMAR: { correct: 0, total: 0 },
    COMPREHENSION: { correct: 0, total: 0 },
  };
  for (const ans of data.answers) {
    const cat = categoryMap.get(ans.questionId);
    if (cat && cat in catStats) {
      const s = catStats[cat as keyof typeof catStats];
      s.total++;
      if (ans.isCorrect) s.correct++;
    }
  }

  // 트랜잭션: 세션 기록 + 오답 로그
  await prisma.$transaction([
    prisma.sessionRecord.create({
      data: {
        studentId,
        passageId: data.passageId,
        seasonId: data.seasonId,
        sessionType: data.sessionType,
        sessionSeq: data.sessionSeq,
        score,
        correctCount,
        totalCount,
        wrongQuestionIds: JSON.stringify(wrongQuestionIds),
        xpEarned,
        isMasteryFail: masteryFailed,
        vocabCorrect: catStats.VOCAB.correct,
        vocabTotal: catStats.VOCAB.total,
        grammarCorrect: catStats.GRAMMAR.correct,
        grammarTotal: catStats.GRAMMAR.total,
        interpretCorrect: catStats.INTERPRETATION.correct,
        interpretTotal: catStats.INTERPRETATION.total,
        compCorrect: catStats.COMPREHENSION.correct,
        compTotal: catStats.COMPREHENSION.total,
        startedAt: new Date(data.startedAt),
        completedAt: new Date(),
      },
    }),
    ...wrongAnswers.map((wa) =>
      prisma.naeshinWrongAnswerLog.upsert({
        where: { studentId_questionId: { studentId, questionId: wa.questionId } },
        create: { studentId, questionId: wa.questionId, givenAnswer: wa.givenAnswer },
        update: {
          count: { increment: 1 },
          lastWrongAt: new Date(),
          givenAnswer: wa.givenAnswer,
        },
      })
    ),
  ]);

  // 후속 처리: XP + 레슨 진행도 + 스트릭 + 일별 기록
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [, updatedProgress] = await Promise.all([
    xpEarned > 0
      ? prisma.student.update({ where: { id: studentId }, data: { xp: { increment: xpEarned } } })
      : Promise.resolve(),
    updateLessonProgress(studentId, data.passageId, data.sessionType, data.sessionSeq, data.seasonId, masteryPassed, score),
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
  revalidateTag(`student-${studentId}`, "default");

  // 퀘스트 진행도
  const questUpdates = await updateQuestProgress(score, xpEarned, data.sessionType);

  // 오답 상세
  const wrongDetails = wrongQuestionIds.length > 0
    ? await prisma.naeshinQuestion.findMany({
        where: { id: { in: wrongQuestionIds } },
        select: { id: true, subType: true, questionText: true, correctAnswer: true },
      })
    : [];
  const wrongMap = new Map(wrongDetails.map((q) => [q.id, q]));

  return {
    sessionType: data.sessionType,
    sessionSeq: data.sessionSeq,
    score,
    correctCount,
    totalCount,
    xpEarned,
    xpMultiplier: multiplier,
    wrongQuestions: wrongAnswers.map((wa) => {
      const q = wrongMap.get(wa.questionId);
      return {
        questionId: wa.questionId,
        subType: subTypeMap.get(wa.questionId) || "",
        questionText: q ? summarizeQuestionText(q.subType, q.questionText) : "",
        givenAnswer: wa.givenAnswer,
        correctAnswer: q?.correctAnswer ?? "",
      };
    }),
    categoryProgress: {
      VOCAB: updatedProgress?.vocabDone ?? 0,
      INTERPRETATION: updatedProgress?.interpDone ?? 0,
      GRAMMAR: updatedProgress?.grammarDone ?? 0,
      COMPREHENSION: updatedProgress?.compDone ?? 0,
    },
    masteryFailed: isMastery ? masteryFailed : undefined,
    masteryPassed: isMastery ? masteryPassed : undefined,
    questUpdates,
  };
}

// ---------------------------------------------------------------------------
// updateLessonProgress — 카테고리별 진행도 업데이트
// ---------------------------------------------------------------------------

async function updateLessonProgress(
  studentId: string,
  passageId: string,
  sessionType: SessionType,
  sessionSeq: number,
  seasonId?: string,
  masteryPassed?: boolean,
  score?: number
) {
  const categoryFieldMap: Record<string, string> = {
    VOCAB: "vocabDone",
    INTERPRETATION: "interpDone",
    GRAMMAR: "grammarDone",
    COMPREHENSION: "compDone",
  };

  const uniqueWhere = {
    studentId_passageId_seasonId: {
      studentId,
      passageId,
      seasonId: seasonId ?? "",
    },
  };

  if (sessionType === "MASTERY") {
    return prisma.lessonProgress.upsert({
      where: uniqueWhere,
      create: {
        studentId,
        passageId,
        seasonId,
        masteryPassed: masteryPassed ?? false,
        masteryAttempts: 1,
        masteryScore: score ?? 0,
      },
      update: {
        masteryAttempts: { increment: 1 },
        ...(masteryPassed ? { masteryPassed: true } : {}),
        ...(score !== undefined ? { masteryScore: Math.max(score, 0) } : {}),
      },
    });
  }

  const field = categoryFieldMap[sessionType];
  if (!field) return null;

  // 현재 진행도 확인 → sessionSeq가 현재 완료 수+1인 경우에만 증가
  const existing = await prisma.lessonProgress.findFirst({
    where: { studentId, passageId, seasonId },
  });
  const currentDone = existing ? (existing as Record<string, unknown>)[field] as number ?? 0 : 0;

  if (sessionSeq !== currentDone + 1) {
    return existing; // 이미 완료했거나 순서가 맞지 않음
  }

  return prisma.lessonProgress.upsert({
    where: uniqueWhere,
    create: {
      studentId,
      passageId,
      seasonId,
      [field]: 1,
    },
    update: {
      [field]: { increment: 1 },
    },
  });
}

// ---------------------------------------------------------------------------
// updateStreak — 스트릭 업데이트
// ---------------------------------------------------------------------------

async function updateStreak(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { streak: true, lastStudyDate: true, streakFreezeCount: true },
  });
  if (!student) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = student.lastStudyDate ? new Date(student.lastStudyDate) : null;
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
    data: { streak: newStreak, lastStudyDate: today },
  });
}
