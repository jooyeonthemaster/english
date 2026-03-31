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
// getNotificationsData — 알림 페이지 통합 로드
// ---------------------------------------------------------------------------
export async function getNotificationsData() {
  const { getStudentDashboard } = await import("./student-app");

  const [dashboard, notices, assignments] = await Promise.all([
    getStudentDashboard(),
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
