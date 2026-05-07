"use server";
import { prisma } from "@/lib/prisma";
import { requireStudent, getScoreColor, xpForLevel, parseClassScheduleSlots } from "./_helpers";

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
  const weeklyXp = weekProgress.reduce((s, p) => s + p.xpEarned, 0);

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
      enrolledClasses: student.classEnrollments.map((e) => ({
        id: e.class.id,
        name: e.class.name,
        schedule: parseClassScheduleSlots(e.class.schedule),
      })),
    },
    analytics: {
      overallScore: student.studentAnalytics?.overallScore ?? 0,
      level: (student.studentAnalytics?.level as string) ?? "D",
    },
    stats: {
      streak,
      weekStudyDays,
      weekVocabTests,
    },
    xp: {
      weekly: weeklyXp,
      total: student.xp,
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
