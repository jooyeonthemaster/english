"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}


// ---------------------------------------------------------------------------
// checkAndAwardBadges — Check and award new badges
// ---------------------------------------------------------------------------
export async function checkAndAwardBadges() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const [student, allAchievements, earnedAchievements] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
    }),
    prisma.achievement.findMany({
      where: { academyId: session.academyId },
    }),
    prisma.studentAchievement.findMany({
      where: { studentId },
    }),
  ]);
  if (!student) return { newBadges: [] };

  const earnedIds = new Set(earnedAchievements.map((e) => e.achievementId));

  const newBadges: { name: string; icon: string; xp: number }[] = [];

  const unearnedAchievements = allAchievements
    .filter((a) => !earnedIds.has(a.id))
    .map((a) => {
      try {
        const condition = JSON.parse(a.condition) as {
          type: string;
          value?: number;
          min?: number;
          count?: number;
        };
        return { achievement: a, condition };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const needsVocabPerfect = unearnedAchievements.some(
    (a) => a.condition.type === "VOCAB_PERFECT"
  );
  const needsGrammarAccuracy = unearnedAchievements.some(
    (a) => a.condition.type === "GRAMMAR_ACCURACY"
  );

  const [perfectCount, analytics] = await Promise.all([
    needsVocabPerfect
      ? prisma.vocabTestResult.count({
          where: { studentId, percent: 100 },
        })
      : Promise.resolve(0),
    needsGrammarAccuracy
      ? prisma.studentAnalytics.findUnique({
          where: { studentId },
        })
      : Promise.resolve(null),
  ]);

  for (const { achievement, condition } of unearnedAchievements) {
    let isEarned = false;

    if (condition.type === "STREAK" && student.streak >= (condition.value ?? 7)) {
      isEarned = true;
    }

    if (condition.type === "VOCAB_PERFECT") {
      if (perfectCount >= (condition.count ?? 3)) isEarned = true;
    }

    if (condition.type === "GRAMMAR_ACCURACY") {
      if (analytics && analytics.grammarScore >= (condition.min ?? 90)) {
        isEarned = true;
      }
    }

    if (isEarned) {
      await prisma.studentAchievement.create({
        data: { studentId, achievementId: achievement.id },
      });
      if (achievement.xpReward > 0) {
        await addXP(achievement.xpReward, `배지 획득: ${achievement.name}`);
      }
      newBadges.push({
        name: achievement.name,
        icon: achievement.icon,
        xp: achievement.xpReward,
      });
    }
  }

  return { newBadges };
}

// ---------------------------------------------------------------------------
// addXP — Add XP and level up if needed
// ---------------------------------------------------------------------------
export async function addXP(amount: number, reason: string) {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });
  if (!student) return { success: false };

  const newXp = student.xp + amount;

  await prisma.student.update({
    where: { id: studentId },
    data: { xp: newXp },
  });

  const { getTodayKST } = await import("@/lib/date-utils");
  const today = getTodayKST();
  await prisma.studyProgress.upsert({
    where: { studentId_date: { studentId, date: today } },
    create: { studentId, date: today, xpEarned: amount },
    update: { xpEarned: { increment: amount } },
  });

  revalidatePath("/student");

  return { success: true, newXp, reason };
}

// ---------------------------------------------------------------------------
// getStudentProgress — Score trends
// ---------------------------------------------------------------------------
export async function getStudentProgress() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [vocabResults, examResults, dailyProgress] = await Promise.all([
    prisma.vocabTestResult.findMany({
      where: { studentId, takenAt: { gte: threeMonthsAgo } },
      include: { list: true },
      orderBy: { takenAt: "asc" },
    }),
    prisma.examSubmission.findMany({
      where: {
        studentId,
        status: "GRADED",
        submittedAt: { gte: threeMonthsAgo },
      },
      include: { exam: true },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.studyProgress.findMany({
      where: { studentId, date: { gte: threeMonthsAgo } },
      orderBy: { date: "asc" },
    }),
  ]);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { level: true, xp: true },
  });

  return {
    vocabTrend: vocabResults.map((r) => ({
      date: r.takenAt.toISOString().split("T")[0],
      title: r.list.title,
      percent: r.percent,
    })),
    examTrend: examResults.map((s) => ({
      date: (s.submittedAt ?? s.startedAt).toISOString().split("T")[0],
      title: s.exam.title,
      percent: s.percent ?? 0,
    })),
    dailyStudy: dailyProgress.map((p) => ({
      date: p.date.toISOString().split("T")[0],
      minutes: p.studyMinutes,
      vocabTests: p.vocabTests,
      xp: p.xpEarned,
    })),
    currentLevel: 0, // 레벨 시스템 제거됨
    currentXp: student?.xp ?? 0,
    xpForNextLevel: 0,
  };
}
