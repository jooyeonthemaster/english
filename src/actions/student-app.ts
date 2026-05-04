"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { revalidatePath, unstable_cache, revalidateTag } from "next/cache";

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


// ---------------------------------------------------------------------------
// 0. getStudentHeaderData — Layout header only (lightweight)
// ---------------------------------------------------------------------------
export async function getStudentHeaderData() {
  const session = await getStudentSession();
  if (!session) return null;

  const cached = unstable_cache(
    async () => {
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
    },
    [`header-${session.studentId}`],
    { revalidate: 300, tags: [`student-${session.studentId}`] }
  );
  return cached();
}

// ---------------------------------------------------------------------------
// 1. getStudentDashboard — Home page data
// ---------------------------------------------------------------------------
export async function getStudentDashboard() {
  const session = await requireStudent();
  const cached = unstable_cache(
    () => _getStudentDashboard(session.studentId, session.academyId),
    [`dashboard-${session.studentId}`],
    { revalidate: 120, tags: [`student-${session.studentId}`] }
  );
  return cached();
}

async function _getStudentDashboard(studentId: string, academyId: string) {
  const { getWeekStartKST, getTodayRangeKST } = await import("@/lib/date-utils");
  const now = new Date();
  const startOfWeek = getWeekStartKST();
  const { today: todayStart, tomorrow: todayEnd } = getTodayRangeKST();

  // Phase 1: student + 8쿼리 + raw SQL 랭킹 — 전부 병렬 (3단계→1단계)
  const [
    student,
    weekProgress,
    upcomingExams,
    pendingAssignments,
    recentResults,
    activeSeason,
    wrongLogs,
    rankingRows,
    todayAttendanceRecord,
  ] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, name: true, grade: true, level: true, xp: true, streak: true, lastStudyDate: true, streakFreezeCount: true,
        academyId: true,
        school: { select: { name: true } },
        academy: { select: { name: true } },
        classEnrollments: {
          where: { status: "ENROLLED" },
          select: { classId: true, class: { select: { id: true, name: true, schedule: true } } },
        },
      },
    }),
    prisma.studyProgress.findMany({
      where: { studentId, date: { gte: startOfWeek } },
    }),
    prisma.exam.findMany({
      where: {
        status: { in: ["PUBLISHED", "IN_PROGRESS"] },
        class: { enrollments: { some: { studentId, status: "ENROLLED" } } },
      },
      orderBy: { examDate: "asc" },
      take: 3,
    }),
    prisma.assignment.findMany({
      where: {
        dueDate: { gte: todayStart },
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
    prisma.studySeason.findFirst({
      where: { academyId, isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { startDate: "desc" },
    }),
    prisma.wrongAnswerLog.findMany({
      where: { studentId },
      select: { category: true, subCategory: true, count: true },
      orderBy: { count: "desc" },
      take: 5,
    }),
    // Raw SQL: 랭킹 + 이름 1쿼리로 (기존 groupBy + findMany 2쿼리 제거)
    prisma.$queryRaw<{ studentId: string; name: string; total_xp: number }[]>`
      SELECT s.id as "studentId", s.name, COALESCE(SUM(sr."xpEarned"), 0)::int as total_xp
      FROM students s
      LEFT JOIN session_records sr ON sr."studentId" = s.id AND sr."completedAt" >= ${startOfWeek}
      WHERE s."academyId" = ${academyId}
      GROUP BY s.id, s.name
      HAVING COALESCE(SUM(sr."xpEarned"), 0) > 0
      ORDER BY total_xp DESC
      LIMIT 10
    `,
    prisma.attendance.findFirst({
      where: { studentId, date: { gte: todayStart, lt: todayEnd } },
      select: { status: true, checkInTime: true },
    }),
  ]);

  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  // 스트릭 만료 체크
  let streak = student.streak;
  if (!student.lastStudyDate) {
    streak = 0;
  } else {
    const { normalizeToKSTMidnight } = await import("@/lib/date-utils");
    const lastDate = normalizeToKSTMidnight(new Date(student.lastStudyDate));
    const diffDays = Math.round((todayStart.getTime() - lastDate.getTime()) / 86400000);
    if (diffDays > 1 && !(diffDays === 2 && student.streakFreezeCount > 0)) {
      streak = 0;
    }
  }
  const weekStudyDays = weekProgress.length;
  const weekVocabTests = weekProgress.reduce((s, p) => s + p.vocabTests, 0);

  // 공지 (classEnrollments 필요하므로 student 이후) — 가볍고 빠름
  const classIds = student.classEnrollments.map((e) => e.classId);
  const recentNotices = await prisma.notice.findMany({
    where: {
      academyId: student.academyId,
      publishAt: { lte: now },
      OR: [
        { targetType: "ALL" },
        { targetType: "INDIVIDUAL", targetId: studentId },
        ...(classIds.length > 0 ? [{ targetType: "CLASS", targetId: { in: classIds } }] : []),
      ],
    },
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }],
    take: 3,
    select: { id: true, title: true, isPinned: true, publishAt: true },
  });

  // Phase 2: 시즌 의존 쿼리만 (activeSeason 있을 때)
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
        select: { passageId: true, vocabDone: true, interpDone: true, grammarDone: true, compDone: true, masteryPassed: true },
      }),
    ]);
    const progressMap = new Map(lessonProgressList.map((p) => [p.passageId, p]));

    for (const sp of seasonPassages) {
      const prog = progressMap.get(sp.passageId);
      const completedCount =
        (prog?.vocabDone ?? 0) + (prog?.interpDone ?? 0) +
        (prog?.grammarDone ?? 0) + (prog?.compDone ?? 0) +
        (prog?.masteryPassed ? 1 : 0);

      if (completedCount < 21) {
        const catProgress = {
          VOCAB: prog?.vocabDone ?? 0,
          INTERPRETATION: prog?.interpDone ?? 0,
          GRAMMAR: prog?.grammarDone ?? 0,
          COMPREHENSION: prog?.compDone ?? 0,
        };
        const next = (Object.entries(catProgress) as [string, number][])
          .filter(([, v]) => v < 5)
          .sort((a, b) => a[1] - b[1])[0]?.[0] ?? "VOCAB";

        todayLesson = {
          passageId: sp.passageId,
          passageTitle: sp.passage.title,
          nextSession: next,
          completedSessions: completedCount,
          totalSessions: 21,
        };
        break;
      }
    }
  }

  // --- 주간 학습 캘린더 ---
  const weekDays: boolean[] = Array(7).fill(false);
  for (const p of weekProgress) weekDays[new Date(p.date).getDay()] = true;
  const weekSessionCount = weekProgress.reduce((s, p) => s + p.questionsAnswered, 0);

  // --- 랭킹 (raw SQL 결과 매핑) ---
  const myWeeklyXp = rankingRows.find((r) => r.studentId === studentId)?.total_xp ?? 0;
  const ranking = rankingRows.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    studentId: r.studentId,
    name: r.name,
    xp: r.total_xp,
    isMe: r.studentId === studentId,
  }));

  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      level: student.level,
      xp: student.xp,
      xpForNextLevel: 0, // 레벨 시스템 제거됨
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
      weekly: myWeeklyXp,
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
    recentActivity: [] as { id: string; type: string; title: string; score: number; total: number; percent: number; date: string; scoreColor: string }[],
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
  const cached = unstable_cache(
    () => _getStudentInbadi(session.studentId),
    [`inbadi-${session.studentId}`],
    { revalidate: 180, tags: [`student-${session.studentId}`] }
  );
  return cached();
}

async function _getStudentInbadi(studentId: string) {

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      grade: true,
      level: true,
      xp: true,
      streak: true,
      school: { select: { name: true } },
      studentAnalytics: {
        select: {
          overallScore: true,
          grammarScore: true,
          vocabScore: true,
          readingScore: true,
          writingScore: true,
          listeningScore: true,
          level: true,
          grammarDetail: true,
          weakPoints: true,
        },
      },
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

  // All queries are independent — run in parallel
  const [recentTests, recentExams, assignmentGrades] = await Promise.all([
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
    // Assignment grades
    prisma.assignmentSubmission.findMany({
      where: { studentId, status: "GRADED" },
      include: {
        assignment: {
          select: {
            title: true,
            maxScore: true,
            dueDate: true,
            class: { select: { name: true } },
          },
        },
      },
      orderBy: { gradedAt: "desc" },
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
      xpForNextLevel: 0, // 레벨 시스템 제거됨
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
    assignmentGrades: assignmentGrades.map((s) => ({
      id: s.id,
      title: s.assignment.title,
      className: s.assignment.class?.name ?? "",
      score: s.score ?? 0,
      maxScore: s.assignment.maxScore ?? 100,
      feedback: s.feedback,
      date: s.gradedAt?.toISOString() ?? "",
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

