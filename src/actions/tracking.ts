"use server";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";

export async function updateStudyProgress(data: {
  vocabTests?: number;
  vocabScore?: number;
  questionsViewed?: number;
  aiQuestionsAsked?: number;
}) {
  const session = await getStudentSession();
  if (!session) return { error: "Not authenticated" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.studyProgress.findUnique({
    where: {
      studentId_date: {
        studentId: session.studentId,
        date: today,
      },
    },
  });

  if (existing) {
    await prisma.studyProgress.update({
      where: { id: existing.id },
      data: {
        vocabTests: { increment: data.vocabTests || 0 },
        vocabScore: data.vocabScore ?? existing.vocabScore,
        questionsViewed: { increment: data.questionsViewed || 0 },
        aiQuestionsAsked: { increment: data.aiQuestionsAsked || 0 },
      },
    });
  } else {
    await prisma.studyProgress.create({
      data: {
        studentId: session.studentId,
        date: today,
        vocabTests: data.vocabTests || 0,
        vocabScore: data.vocabScore || 0,
        questionsViewed: data.questionsViewed || 0,
        aiQuestionsAsked: data.aiQuestionsAsked || 0,
      },
    });
  }

  return { success: true };
}

export async function getStudentStats(studentId: string) {
  const [testResults, wrongAnswers, progress] = await Promise.all([
    prisma.vocabTestResult.aggregate({
      where: { studentId },
      _count: true,
      _avg: { percent: true },
    }),
    prisma.wrongVocabAnswer.count({ where: { studentId } }),
    prisma.studyProgress.findMany({
      where: { studentId },
      orderBy: { date: "desc" },
      take: 90,
    }),
  ]);

  // Calculate streak
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sortedDates = progress
    .map((p) => {
      const d = new Date(p.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })
    .sort((a, b) => b - a);

  for (let i = 0; i < sortedDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    expected.setHours(0, 0, 0, 0);
    if (sortedDates[i] === expected.getTime()) {
      streak++;
    } else {
      break;
    }
  }

  return {
    totalTests: testResults._count,
    avgScore: Math.round(testResults._avg.percent || 0),
    wrongAnswerCount: wrongAnswers,
    streakDays: streak,
  };
}
