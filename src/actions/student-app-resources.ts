"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { revalidatePath, revalidateTag } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}


// ---------------------------------------------------------------------------
// getStudentAttendanceHistory — 학생 월별 출석 기록
// ---------------------------------------------------------------------------
export async function getStudentAttendanceHistory(year: number, month: number) {
  const session = await requireStudent();
  const studentId = session.studentId;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const records = await prisma.attendance.findMany({
    where: {
      studentId,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: "asc" },
  });

  const total = records.length;
  const present = records.filter((r) => r.status === "PRESENT").length;
  const late = records.filter((r) => r.status === "LATE").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const earlyLeave = records.filter((r) => r.status === "EARLY_LEAVE").length;

  return {
    records: records.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split("T")[0],
      status: r.status,
      checkInTime: r.checkInTime?.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) ?? null,
      checkOutTime: r.checkOutTime?.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) ?? null,
    })),
    stats: {
      total,
      present,
      late,
      absent,
      earlyLeave,
      rate: total > 0 ? Math.round((present / total) * 100) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// studentCheckIn — 학생 자체 출석 체크 (QR/수동)
// ---------------------------------------------------------------------------
export async function studentCheckIn() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      academyId: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
        take: 1,
      },
    },
  });

  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const existing = await prisma.attendance.findFirst({
    where: {
      studentId,
      date: { gte: dayStart, lt: dayEnd },
    },
  });

  if (existing) {
    return { alreadyCheckedIn: true, checkInTime: existing.checkInTime?.toISOString() ?? null };
  }

  const classId = student.classEnrollments[0]?.classId ?? null;

  await prisma.attendance.create({
    data: {
      academyId: student.academyId,
      studentId,
      classId,
      date: dayStart,
      checkInTime: today,
      status: "PRESENT",
      method: "QR",
    },
  });

  revalidatePath("/student/attendance");
  revalidateTag(`student-${studentId}`, "default");
  return { alreadyCheckedIn: false, checkInTime: today.toISOString() };
}

// ---------------------------------------------------------------------------
// getStudentNotices — 학생 대상 공지사항
// ---------------------------------------------------------------------------
export async function getStudentNotices() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      academyId: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
      },
    },
  });

  if (!student) return [];

  const classIds = student.classEnrollments.map((e) => e.classId);

  const notices = await prisma.notice.findMany({
    where: {
      academyId: student.academyId,
      OR: [
        { targetType: "ALL" },
        { targetType: "CLASS", targetId: { in: classIds } },
        { targetType: "INDIVIDUAL", targetId: studentId },
      ],
      publishAt: { lte: new Date() },
    },
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }],
    take: 50,
  });

  const readNoticeIds = new Set(
    (await prisma.noticeRead.findMany({
      where: {
        noticeId: { in: notices.map((n) => n.id) },
        readerId: studentId,
        readerType: "STUDENT",
      },
      select: { noticeId: true },
    })).map((r) => r.noticeId),
  );

  return notices.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    isPinned: n.isPinned,
    publishedAt: n.publishAt?.toISOString() ?? n.createdAt.toISOString(),
    isRead: readNoticeIds.has(n.id),
    targetType: n.targetType,
  }));
}

// ---------------------------------------------------------------------------
// markNoticeAsRead — 공지 읽음 처리
// ---------------------------------------------------------------------------
export async function markNoticeAsRead(noticeId: string) {
  const session = await requireStudent();

  await prisma.noticeRead.upsert({
    where: {
      noticeId_readerId_readerType: {
        noticeId,
        readerId: session.studentId,
        readerType: "STUDENT",
      },
    },
    update: {},
    create: {
      noticeId,
      readerId: session.studentId,
      readerType: "STUDENT",
    },
  });
}

// ---------------------------------------------------------------------------
// getStudentAssignmentList — 학생 숙제 목록
// ---------------------------------------------------------------------------
export async function getStudentAssignmentList() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      academyId: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
      },
    },
  });

  if (!student) return [];

  const classIds = student.classEnrollments.map((e) => e.classId);

  const assignments = await prisma.assignment.findMany({
    where: {
      academyId: student.academyId,
      OR: [
        { classId: { in: classIds } },
        { classId: null },
      ],
    },
    include: {
      class: { select: { name: true } },
      submissions: {
        where: { studentId },
        select: {
          id: true,
          status: true,
          score: true,
          feedback: true,
          submittedAt: true,
        },
      },
    },
    orderBy: { dueDate: "desc" },
    take: 30,
  });

  const now = new Date();
  return assignments.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    className: a.class?.name ?? "전체",
    dueDate: a.dueDate.toISOString(),
    maxScore: a.maxScore,
    isOverdue: a.dueDate < now,
    submission: a.submissions[0]
      ? {
          status: a.submissions[0].status,
          score: a.submissions[0].score,
          feedback: a.submissions[0].feedback,
          submittedAt: a.submissions[0].submittedAt?.toISOString() ?? null,
        }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// getNotificationContext — 알림에 필요한 최소 데이터만 조회 (경량)
// ---------------------------------------------------------------------------
async function getNotificationContext() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      streak: true,
      academyId: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
      },
    },
  });
  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  // 6개 쿼리 병렬 실행 (기존 19+ → 6)
  const [
    weekProgress,
    upcomingExams,
    todayAttendanceRecord,
    activeSeason,
    weeklyRanking,
  ] = await Promise.all([
    prisma.studyProgress.findMany({
      where: { studentId, date: { gte: startOfWeek } },
      select: { date: true },
    }),
    prisma.exam.findMany({
      where: {
        status: { in: ["PUBLISHED", "IN_PROGRESS"] },
        class: { enrollments: { some: { studentId, status: "ENROLLED" } } },
      },
      orderBy: { examDate: "asc" },
      take: 3,
      select: { id: true, title: true, examDate: true },
    }),
    prisma.attendance.findFirst({
      where: { studentId, date: { gte: todayStart, lt: todayEnd } },
      select: { status: true, checkInTime: true },
    }),
    prisma.studySeason.findFirst({
      where: {
        academyId: student.academyId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: "desc" },
      select: { id: true },
    }),
    prisma.sessionRecord.groupBy({
      by: ["studentId"],
      where: {
        student: { academyId: student.academyId },
        completedAt: { gte: startOfWeek },
      },
      _sum: { xpEarned: true },
      orderBy: { _sum: { xpEarned: "desc" } },
      take: 5,
    }),
  ]);

  // 오늘의 학습 추천 (시즌 있을 때만 2쿼리 추가)
  let todayLesson: { passageTitle: string } | null = null;
  if (activeSeason) {
    const [seasonPassages, lessonProgressList] = await Promise.all([
      prisma.seasonPassage.findMany({
        where: { seasonId: activeSeason.id },
        include: { passage: { select: { title: true } } },
        orderBy: { order: "asc" },
        take: 5,
      }),
      prisma.lessonProgress.findMany({
        where: { studentId, seasonId: activeSeason.id },
        select: { passageId: true, vocabDone: true, interpDone: true, grammarDone: true, compDone: true, masteryPassed: true },
      }),
    ]);
    const progressMap = new Map(lessonProgressList.map((p) => [p.passageId, p]));
    for (const sp of seasonPassages) {
      const prog = progressMap.get(sp.passageId);
      const done = (prog?.vocabDone ?? 0) + (prog?.interpDone ?? 0) + (prog?.grammarDone ?? 0) + (prog?.compDone ?? 0) + (prog?.masteryPassed ? 1 : 0);
      if (done < 21) {
        todayLesson = { passageTitle: sp.passage.title };
        break;
      }
    }
  }

  // 주간 캘린더
  const weekDays: boolean[] = Array(7).fill(false);
  for (const p of weekProgress) weekDays[new Date(p.date).getDay()] = true;

  // 랭킹 이름 조회
  const rankIds = weeklyRanking.map((r) => r.studentId);
  const rankStudents = rankIds.length > 0
    ? await prisma.student.findMany({ where: { id: { in: rankIds } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(rankStudents.map((s) => [s.id, s.name]));
  const ranking = weeklyRanking.map((r, i) => ({
    rank: i + 1,
    name: nameMap.get(r.studentId) ?? "???",
    xp: r._sum.xpEarned ?? 0,
    isMe: r.studentId === studentId,
  }));

  return {
    student: { streak: student.streak },
    upcomingExams: upcomingExams.map((e) => ({
      id: e.id,
      title: e.title,
      examDate: e.examDate?.toISOString() ?? null,
    })),
    todayAttendance: todayAttendanceRecord
      ? { status: todayAttendanceRecord.status, checkIn: todayAttendanceRecord.checkInTime?.toTimeString().slice(0, 5) ?? null }
      : null,
    weekCalendar: { days: weekDays },
    todayLesson,
    ranking,
  };
}

// ---------------------------------------------------------------------------
// getNotificationsData — 알림 페이지 통합 로드
// ---------------------------------------------------------------------------
export async function getNotificationsData() {
  const [dashboard, notices, assignments] = await Promise.all([
    getNotificationContext(),
    getStudentNotices(),
    getStudentAssignmentList(),
  ]);

  return { dashboard, notices, assignments };
}

// ---------------------------------------------------------------------------
// getStudentEnrollments — 수강 중인 반 목록
// ---------------------------------------------------------------------------
export async function getStudentEnrollments() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const enrollments = await prisma.classEnrollment.findMany({
    where: { studentId },
    include: {
      class: {
        include: {
          teacher: { select: { name: true } },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  return enrollments.map((e) => ({
    id: e.id,
    classId: e.class.id,
    className: e.class.name,
    teacherName: e.class.teacher?.name ?? null,
    schedule: e.class.schedule,
    status: e.status,
    enrolledAt: e.enrolledAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// getPassageTranslations — 지문 문장별 해석 (Stories 모드용)
// ---------------------------------------------------------------------------
export async function getPassageTranslations(passageId: string): Promise<Record<number, string>> {
  await requireStudent();

  const analysis = await prisma.passageAnalysis.findUnique({
    where: { passageId },
    select: { analysisData: true },
  });

  if (!analysis?.analysisData) return {};

  try {
    const parsed = JSON.parse(analysis.analysisData);
    // analysisData.sentences 배열에서 translation 추출
    if (parsed.sentences && Array.isArray(parsed.sentences)) {
      const translations: Record<number, string> = {};
      parsed.sentences.forEach((s: { index?: number; translation?: string }, i: number) => {
        const idx = s.index ?? i;
        if (s.translation) translations[idx] = s.translation;
      });
      return translations;
    }
  } catch {}

  return {};
}

// ---------------------------------------------------------------------------
// getStudentExamResults — 시험 예정 + 채점 결과
// ---------------------------------------------------------------------------
export async function getStudentExamResults() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
      },
    },
  });

  if (!student) return { upcoming: [], graded: [] };
  const classIds = student.classEnrollments.map((e) => e.classId);

  const [upcoming, submissions] = await Promise.all([
    prisma.exam.findMany({
      where: {
        status: { in: ["PUBLISHED", "IN_PROGRESS"] },
        classId: { in: classIds },
      },
      orderBy: { examDate: "asc" },
      take: 10,
      select: { id: true, title: true, type: true, examDate: true },
    }),
    prisma.examSubmission.findMany({
      where: { studentId, status: "GRADED" },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            type: true,
            examDate: true,
            totalPoints: true,
          },
        },
      },
      orderBy: { gradedAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    upcoming: upcoming.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      examDate: e.examDate?.toISOString() ?? null,
    })),
    graded: submissions.map((s) => ({
      id: s.id,
      examId: s.exam.id,
      title: s.exam.title,
      type: s.exam.type,
      score: s.score ?? 0,
      maxScore: s.maxScore ?? s.exam.totalPoints,
      percent: s.percent ?? 0,
      gradedAt: s.gradedAt?.toISOString() ?? null,
      examDate: s.exam.examDate?.toISOString() ?? null,
    })),
  };
}

