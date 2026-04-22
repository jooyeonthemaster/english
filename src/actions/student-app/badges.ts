"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStudent, xpForLevel } from "./_helpers";

// ---------------------------------------------------------------------------
// 3. getStudentBadges — Earned + available badges
// ---------------------------------------------------------------------------
export async function getStudentBadges() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const [earned, allBadges] = await Promise.all([
    prisma.studentAchievement.findMany({
      where: { studentId },
      include: { achievement: true },
      orderBy: { earnedAt: "desc" },
    }),
    prisma.achievement.findMany({
      where: { academy: { students: { some: { id: studentId } } } },
    }),
  ]);

  const earnedIds = new Set(earned.map((e) => e.achievementId));

  return {
    earned: earned.map((e) => ({
      id: e.achievementId,
      name: e.achievement.name,
      description: e.achievement.description,
      icon: e.achievement.icon,
      category: e.achievement.category,
      earnedAt: e.earnedAt.toISOString(),
    })),
    locked: allBadges
      .filter((b) => !earnedIds.has(b.id))
      .map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        category: b.category,
      })),
  };
}

// ---------------------------------------------------------------------------
// 9. checkAndAwardBadges — Check and award new badges
// ---------------------------------------------------------------------------
export async function checkAndAwardBadges() {
  const session = await requireStudent();
  const studentId = session.studentId;

  // All 3 initial queries are independent — run in parallel
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

  // Parse conditions and filter out unparseable ones
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

  // Pre-fetch data needed for condition checks in parallel
  // Only query if there are achievements needing that data type
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

  // Evaluate conditions using pre-fetched data (no more sequential queries)
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
      // Award XP (must be sequential since addXP modifies student state)
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
// 10. addXP — Add XP and level up if needed
// ---------------------------------------------------------------------------
export async function addXP(amount: number, reason: string) {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });
  if (!student) return { success: false };

  let newXp = student.xp + amount;
  let newLevel = student.level;
  let leveledUp = false;

  // Check for level up
  while (newXp >= xpForLevel(newLevel)) {
    newXp -= xpForLevel(newLevel);
    newLevel++;
    leveledUp = true;
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { xp: newXp, level: newLevel },
  });

  // Update today's study progress XP
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.studyProgress.upsert({
    where: { studentId_date: { studentId, date: today } },
    create: { studentId, date: today, xpEarned: amount },
    update: { xpEarned: { increment: amount } },
  });

  revalidatePath("/student");

  return { success: true, newXp, newLevel, leveledUp, reason };
}
