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

function getScoreColor(percent: number): string {
  if (percent >= 90) return "emerald";
  if (percent >= 70) return "blue";
  if (percent >= 50) return "amber";
  return "red";
}

function getLevelGrade(score: number): "S" | "A" | "B" | "C" | "D" {
  if (score >= 90) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50; // Level 1: 100XP, Level 2: 150XP, etc.
}

// ---------------------------------------------------------------------------
// 1. getStudentDashboard — Home page data
// ---------------------------------------------------------------------------
export async function getStudentDashboard() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        include: { class: true },
      },
    },
  });

  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  // Streak
  const streak = student.streak;

  // This week's study count
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // All 4 queries are independent — run in parallel
  const [weekProgress, upcomingExams, pendingAssignments, recentResults] =
    await Promise.all([
      prisma.studyProgress.findMany({
        where: {
          studentId,
          date: { gte: startOfWeek },
        },
      }),
      // Today's tasks: upcoming exams
      prisma.exam.findMany({
        where: {
          status: { in: ["PUBLISHED", "IN_PROGRESS"] },
          class: {
            enrollments: {
              some: { studentId, status: "ENROLLED" },
            },
          },
        },
        orderBy: { examDate: "asc" },
        take: 3,
      }),
      // Due assignments
      prisma.assignmentSubmission.findMany({
        where: {
          studentId,
          status: { in: ["PENDING"] },
        },
        include: {
          assignment: true,
        },
        orderBy: { assignment: { dueDate: "asc" } },
        take: 3,
      }),
      // Recent vocab test results
      prisma.vocabTestResult.findMany({
        where: { studentId },
        include: { list: true },
        orderBy: { takenAt: "desc" },
        take: 5,
      }),
    ]);

  const weekStudyDays = weekProgress.length;
  const weekVocabTests = weekProgress.reduce((s, p) => s + p.vocabTests, 0);

  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      level: student.level,
      xp: student.xp,
      xpForNextLevel: xpForLevel(student.level),
      streak,
      schoolName: student.school?.name ?? null,
    },
    stats: {
      streak,
      weekStudyDays,
      weekVocabTests,
    },
    upcomingExams: upcomingExams.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      examDate: e.examDate?.toISOString() ?? null,
    })),
    pendingAssignments: pendingAssignments.map((s) => ({
      id: s.assignmentId,
      title: s.assignment.title,
      dueDate: s.assignment.dueDate.toISOString(),
    })),
    recentActivity: recentResults.map((r) => ({
      id: r.id,
      type: "VOCAB_TEST" as const,
      title: r.list.title,
      score: r.score,
      total: r.total,
      percent: r.percent,
      date: r.takenAt.toISOString(),
      scoreColor: getScoreColor(r.percent),
    })),
  };
}

// ---------------------------------------------------------------------------
// 2. getStudentInbadi — Full 영어 인바디 analytics
// ---------------------------------------------------------------------------
export async function getStudentInbadi() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: true,
      studentAnalytics: true,
    },
  });

  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  const analytics = student.studentAnalytics;

  // Parse grammar detail
  let grammarDetail: Record<string, number> = {};
  if (analytics?.grammarDetail) {
    try {
      grammarDetail = JSON.parse(analytics.grammarDetail);
    } catch {
      grammarDetail = {};
    }
  }

  // Parse weak points
  let weakPoints: string[] = [];
  if (analytics?.weakPoints) {
    try {
      weakPoints = JSON.parse(analytics.weakPoints);
    } catch {
      weakPoints = [];
    }
  }

  // Both queries are independent — run in parallel
  const [recentTests, recentExams] = await Promise.all([
    // Recent test history
    prisma.vocabTestResult.findMany({
      where: { studentId },
      include: { list: true },
      orderBy: { takenAt: "desc" },
      take: 10,
    }),
    // Exam submissions
    prisma.examSubmission.findMany({
      where: { studentId, status: "GRADED" },
      include: { exam: true },
      orderBy: { submittedAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      level: student.level,
      xp: student.xp,
      xpForNextLevel: xpForLevel(student.level),
      streak: student.streak,
      schoolName: student.school?.name ?? null,
    },
    analytics: {
      overallScore: analytics?.overallScore ?? 0,
      grammarScore: analytics?.grammarScore ?? 0,
      vocabScore: analytics?.vocabScore ?? 0,
      readingScore: analytics?.readingScore ?? 0,
      writingScore: analytics?.writingScore ?? 0,
      listeningScore: analytics?.listeningScore ?? 0,
      level: analytics?.level ?? "D",
      grammarDetail,
      weakPoints,
    },
    recentTests: recentTests.map((r) => ({
      id: r.id,
      title: r.list.title,
      testType: r.testType,
      score: r.score,
      total: r.total,
      percent: r.percent,
      date: r.takenAt.toISOString(),
    })),
    recentExams: recentExams.map((s) => ({
      id: s.id,
      title: s.exam.title,
      score: s.score ?? 0,
      maxScore: s.maxScore ?? 100,
      percent: s.percent ?? 0,
      date: s.submittedAt?.toISOString() ?? s.startedAt.toISOString(),
    })),
  };
}

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
// 4. getStudentHeatmap — Daily activity for last 90 days
// ---------------------------------------------------------------------------
export async function getStudentHeatmap() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  ninetyDaysAgo.setHours(0, 0, 0, 0);

  const progress = await prisma.studyProgress.findMany({
    where: {
      studentId,
      date: { gte: ninetyDaysAgo },
    },
    orderBy: { date: "asc" },
  });

  return progress.map((p) => ({
    date: p.date.toISOString().split("T")[0],
    vocabTests: p.vocabTests,
    questionsAnswered: p.questionsAnswered,
    studyMinutes: p.studyMinutes,
    xpEarned: p.xpEarned,
    // Activity level: 0-3
    level: Math.min(
      3,
      (p.vocabTests > 0 ? 1 : 0) +
        (p.questionsAnswered > 2 ? 1 : 0) +
        (p.studyMinutes > 30 ? 1 : 0)
    ),
  }));
}

// ---------------------------------------------------------------------------
// 5. getVocabListsForStudent — Available vocab lists
// ---------------------------------------------------------------------------
export async function getVocabListsForStudent(filters?: {
  grade?: number;
  semester?: string;
  search?: string;
}) {
  const session = await requireStudent();

  const where: Record<string, unknown> = {
    academyId: session.academyId,
  };

  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.search) {
    where.title = { contains: filters.search };
  }

  const lists = await prisma.vocabularyList.findMany({
    where,
    include: {
      _count: { select: { items: true } },
      testResults: {
        where: { studentId: session.studentId },
        orderBy: { takenAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ grade: "asc" }, { order: "asc" }, { createdAt: "desc" }],
  });

  return lists.map((l) => ({
    id: l.id,
    title: l.title,
    grade: l.grade,
    semester: l.semester,
    unit: l.unit,
    wordCount: l._count.items,
    lastScore: l.testResults[0]?.percent ?? null,
    lastTestDate: l.testResults[0]?.takenAt?.toISOString() ?? null,
  }));
}

// ---------------------------------------------------------------------------
// 6. getVocabListForTest — Get vocab items for testing
// ---------------------------------------------------------------------------
export async function getVocabListForTest(listId: string) {
  const session = await requireStudent();

  const list = await prisma.vocabularyList.findUnique({
    where: { id: listId },
    include: {
      items: { orderBy: { order: "asc" } },
      testResults: {
        where: { studentId: session.studentId },
        orderBy: { takenAt: "desc" },
        take: 5,
      },
    },
  });

  if (!list) throw new Error("단어장을 찾을 수 없습니다.");

  return {
    id: list.id,
    title: list.title,
    grade: list.grade,
    semester: list.semester,
    items: list.items.map((i) => ({
      id: i.id,
      english: i.english,
      korean: i.korean,
      partOfSpeech: i.partOfSpeech,
    })),
    recentScores: list.testResults.map((r) => ({
      percent: r.percent,
      testType: r.testType,
      date: r.takenAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// 7. getWrongVocabWords — Wrong vocab answers
// ---------------------------------------------------------------------------
export async function getWrongVocabWords() {
  const session = await requireStudent();

  const wrongWords = await prisma.wrongVocabAnswer.findMany({
    where: { studentId: session.studentId },
    include: {
      item: {
        include: { list: true },
      },
    },
    orderBy: { count: "desc" },
  });

  return wrongWords.map((w) => ({
    id: w.id,
    itemId: w.itemId,
    english: w.item.english,
    korean: w.item.korean,
    partOfSpeech: w.item.partOfSpeech,
    listTitle: w.item.list.title,
    testType: w.testType,
    givenAnswer: w.givenAnswer,
    count: w.count,
    lastMissedAt: w.lastMissedAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// 8. getWrongQuestions — Wrong question answers
// ---------------------------------------------------------------------------
export async function getWrongQuestions() {
  const session = await requireStudent();

  const wrongQuestions = await prisma.wrongAnswerLog.findMany({
    where: { studentId: session.studentId },
    include: {
      question: {
        include: { explanation: true },
      },
    },
    orderBy: { count: "desc" },
  });

  return wrongQuestions.map((w) => ({
    id: w.id,
    questionId: w.questionId,
    questionText: w.question.questionText,
    questionType: w.question.type,
    options: w.question.options ? JSON.parse(w.question.options) : null,
    correctAnswer: w.question.correctAnswer,
    givenAnswer: w.givenAnswer,
    category: w.category,
    subCategory: w.subCategory,
    count: w.count,
    lastWrongAt: w.lastWrongAt.toISOString(),
    explanation: w.question.explanation?.content ?? null,
    keyPoints: w.question.explanation?.keyPoints
      ? JSON.parse(w.question.explanation.keyPoints)
      : null,
  }));
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

// ---------------------------------------------------------------------------
// 11. getStudentProgress — Score trends
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
    currentLevel: student?.level ?? 1,
    currentXp: student?.xp ?? 0,
    xpForNextLevel: xpForLevel(student?.level ?? 1),
  };
}
