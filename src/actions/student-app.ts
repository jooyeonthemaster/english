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
// 0. getStudentHeaderData — Layout header only (lightweight)
// ---------------------------------------------------------------------------
export async function getStudentHeaderData() {
  const session = await getStudentSession();
  if (!session) return null;

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: {
      name: true,
      grade: true,
      streak: true,
      school: { select: { name: true } },
      academy: { select: { name: true } },
    },
  });

  if (!student) return null;

  return {
    studentName: student.name,
    schoolName: student.school?.name ?? "",
    grade: student.grade,
    academyName: student.academy?.name ?? "",
    streak: student.streak,
  };
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
      academy: true,
      studentAnalytics: true,
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

  // All queries are independent — run in parallel
  const [
    weekProgress,
    upcomingExams,
    pendingAssignments,
    recentResults,
    activeSeason,
    wrongLogs,
    weeklyRanking,
    todayAttendanceRecord,
    recentNotices,
  ] = await Promise.all([
    prisma.studyProgress.findMany({
      where: { studentId, date: { gte: startOfWeek } },
    }),
    prisma.exam.findMany({
      where: {
        status: { in: ["PUBLISHED", "IN_PROGRESS"] },
        class: {
          enrollments: { some: { studentId, status: "ENROLLED" } },
        },
      },
      orderBy: { examDate: "asc" },
      take: 3,
    }),
    prisma.assignment.findMany({
      where: {
        dueDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        OR: [
          { targetType: "CLASS", class: { enrollments: { some: { studentId, status: "ENROLLED" } } } },
          { targetType: "INDIVIDUAL", submissions: { some: { studentId } } },
        ],
      },
      orderBy: { dueDate: "asc" },
      take: 3,
      select: { id: true, title: true, dueDate: true },
    }),
    prisma.vocabTestResult.findMany({
      where: { studentId },
      include: { list: true },
      orderBy: { takenAt: "desc" },
      take: 5,
    }),
    // Active season for "오늘의 학습" CTA
    prisma.studySeason.findFirst({
      where: {
        academyId: student.academyId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: "desc" },
    }),
    // Top weak points
    prisma.wrongAnswerLog.findMany({
      where: { studentId },
      select: { category: true, subCategory: true, count: true },
      orderBy: { count: "desc" },
      take: 5,
    }),
    // Weekly XP ranking (same academy students)
    prisma.sessionRecord.groupBy({
      by: ["studentId"],
      where: {
        student: { academyId: student.academyId },
        completedAt: { gte: startOfWeek },
      },
      _sum: { xpEarned: true },
      orderBy: { _sum: { xpEarned: "desc" } },
      take: 10,
    }),
    // Today's attendance
    prisma.attendance.findFirst({
      where: {
        studentId,
        date: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
      },
      select: { status: true, checkInTime: true },
    }),
    // Recent notices for home page
    prisma.notice.findMany({
      where: {
        academyId: student.academyId,
        publishAt: { lte: now },
        OR: [
          { targetType: "ALL" },
          { targetType: "INDIVIDUAL", targetId: studentId },
          ...(student.classEnrollments.length > 0
            ? [{ targetType: "CLASS", targetId: { in: student.classEnrollments.map((e) => e.classId) } }]
            : []),
        ],
      },
      orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }],
      take: 3,
      select: { id: true, title: true, isPinned: true, publishAt: true },
    }),
  ]);

  const weekStudyDays = weekProgress.length;
  const weekVocabTests = weekProgress.reduce((s, p) => s + p.vocabTests, 0);

  // --- 오늘의 학습 추천 (다음 해야 할 세션 자동 계산) ---
  let todayLesson: {
    passageId: string;
    passageTitle: string;
    nextSession: string;
    completedSessions: number;
    totalSessions: number;
  } | null = null;

  if (activeSeason) {
    const [seasonPassages, lessonProgressList] = await Promise.all([
      prisma.seasonPassage.findMany({
        where: { seasonId: activeSeason.id },
        include: { passage: { select: { id: true, title: true } } },
        orderBy: { order: "asc" },
      }),
      prisma.lessonProgress.findMany({
        where: { studentId, seasonId: activeSeason.id },
      }),
    ]);

    const progressMap = new Map(
      lessonProgressList.map((p) => [p.passageId, p]),
    );

    for (const sp of seasonPassages) {
      const prog = progressMap.get(sp.passageId);
      const done = [
        prog?.session1Done,
        prog?.session2Done,
        prog?.storiesDone,
        prog?.session3Done,
        prog?.session4Done,
        prog?.session5Done,
      ];
      const completedCount = done.filter(Boolean).length;

      if (completedCount < 6) {
        let next = "MIX_1";
        if (!prog?.session1Done) next = "MIX_1";
        else if (!prog?.session2Done) next = "MIX_2";
        else if (!prog?.storiesDone) next = "STORIES";
        else if (!prog?.session3Done) next = "VOCAB_FOCUS";
        else if (!prog?.session4Done) next = "GRAMMAR_FOCUS";
        else next = "WEAKNESS_FOCUS";

        todayLesson = {
          passageId: sp.passageId,
          passageTitle: sp.passage.title,
          nextSession: next,
          completedSessions: completedCount,
          totalSessions: 6,
        };
        break;
      }
    }
  }

  // --- 주간 학습 캘린더 (요일별 학습 여부) ---
  const weekDays: boolean[] = Array(7).fill(false);
  for (const p of weekProgress) {
    const day = new Date(p.date).getDay(); // 0=Sun
    weekDays[day] = true;
  }
  const weekSessionCount = weekProgress.reduce(
    (s, p) => s + p.questionsAnswered,
    0,
  );

  // --- 미니 랭킹 (상위 3명) ---
  const rankStudentIds = weeklyRanking.map((r) => r.studentId);
  const rankStudents =
    rankStudentIds.length > 0
      ? await prisma.student.findMany({
          where: { id: { in: rankStudentIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameMap = new Map(rankStudents.map((s) => [s.id, s.name]));

  const ranking = weeklyRanking.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    studentId: r.studentId,
    name: nameMap.get(r.studentId) ?? "???",
    xp: r._sum.xpEarned ?? 0,
    isMe: r.studentId === studentId,
  }));

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
      academyName: student.academy?.name ?? null,
      enrolledClasses: student.classEnrollments.map((e) => {
        let scheduleSlots: { day: string; startTime: string; endTime: string }[] = [];
        try {
          const s = typeof e.class.schedule === "string"
            ? JSON.parse(e.class.schedule)
            : e.class.schedule;
          if (Array.isArray(s)) {
            scheduleSlots = s.map((slot: { day?: string; startTime?: string; endTime?: string }) => ({
              day: slot.day ?? "",
              startTime: slot.startTime ?? "",
              endTime: slot.endTime ?? "",
            }));
          }
        } catch {}
        return { id: e.class.id, name: e.class.name, schedule: scheduleSlots };
      }),
    },
    xp: {
      total: student.xp,
      weekly: weeklyRanking.find((r) => r.studentId === studentId)?._sum?.xpEarned ?? 0,
    },
    stats: {
      streak,
      weekStudyDays,
      weekVocabTests,
    },
    todayLesson,
    weekCalendar: {
      days: weekDays,
      sessionCount: weekSessionCount,
    },
    upcomingExams: upcomingExams.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      examDate: e.examDate?.toISOString() ?? null,
    })),
    pendingAssignments: pendingAssignments.map((a) => ({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate.toISOString(),
    })),
    weakPoints: wrongLogs
      .filter((w) => w.category)
      .map((w) => ({
        category: w.category ?? "",
        subCategory: w.subCategory ?? "",
        wrongCount: w.count,
      })),
    ranking,
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
    todayAttendance: todayAttendanceRecord
      ? {
          status: todayAttendanceRecord.status,
          checkIn: todayAttendanceRecord.checkInTime
            ?.toTimeString()
            .slice(0, 5) ?? null,
        }
      : null,
    recentNotices: recentNotices.map((n) => ({
      id: n.id,
      title: n.title,
      isPinned: n.isPinned,
      publishAt: n.publishAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// 2. getStudentInbadi — 성적 분석 데이터
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
      where: { academyId: session.academyId },
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
// 4-1. getStudentAttendance — 월별 출결 기록
// ---------------------------------------------------------------------------
export async function getStudentAttendance(year: number, month: number) {
  const session = await requireStudent();
  const studentId = session.studentId;

  const records = await prisma.attendance.findMany({
    where: {
      studentId,
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    select: { date: true, status: true, checkInTime: true, checkOutTime: true },
    orderBy: { date: "asc" },
  });

  const present = records.filter((r) => r.status === "PRESENT").length;
  const late = records.filter((r) => r.status === "LATE").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const earlyLeave = records.filter((r) => r.status === "EARLY_LEAVE").length;
  const total = records.length;
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  return {
    records: records.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      status: r.status as string,
      checkIn: r.checkInTime?.toTimeString().slice(0, 5) ?? null,
      checkOut: r.checkOutTime?.toTimeString().slice(0, 5) ?? null,
    })),
    stats: { present, late, absent, earlyLeave, total, rate },
  };
}

