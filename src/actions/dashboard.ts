"use server";

import { prisma } from "@/lib/prisma";

// ============================================================================
// Types
// ============================================================================

export interface KPIData {
  totalStudents: number;
  studentDelta: number;
  monthlyRevenue: number;
  collectionRate: number;
  attendanceRate: number;
  presentCount: number;
  totalAttendanceCount: number;
  newRegistrations: number;
  newRegDelta: number;
}

export interface StudentTrendPoint {
  month: string;
  count: number;
}

export interface PaymentSummaryItem {
  status: string;
  label: string;
  amount: number;
  count: number;
  color: string;
}

export interface TodayClassItem {
  id: string;
  name: string;
  time: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  studentCount: number;
  room: string | null;
  status: "in-progress" | "upcoming" | "completed";
}

export interface OverdueInvoiceItem {
  id: string;
  studentName: string;
  amount: number;
  daysOverdue: number;
  title: string;
}

export interface ConsultationItem {
  id: string;
  studentName: string | null;
  type: string;
  typeLabel: string;
  date: string;
  status: string;
  staffName: string | null;
}

// Teacher-specific types
export interface TeacherKPIData {
  myClassesToday: number;
  ungradedExams: number;
  missingAssignments: number;
  myStudents: number;
}

export interface TeacherClassItem {
  id: string;
  name: string;
  time: string;
  startTime: string;
  endTime: string;
  room: string | null;
  studentCount: number;
  attendedCount: number;
  status: "in-progress" | "upcoming" | "completed";
}

export interface RecentExamResult {
  id: string;
  examTitle: string;
  className: string | null;
  avgScore: number | null;
  submissionCount: number;
  totalStudents: number;
  date: string;
}

export interface PendingAssignmentItem {
  id: string;
  title: string;
  className: string | null;
  dueDate: string;
  submittedCount: number;
  totalStudents: number;
}

// ============================================================================
// Helper: Get consultation type label
// ============================================================================

function getConsultationTypeLabel(type: string): string {
  switch (type) {
    case "NEW_INQUIRY": return "신규 문의";
    case "STUDENT": return "학생 상담";
    case "PARENT": return "학부모 상담";
    case "LEVEL_TEST": return "레벨 테스트";
    default: return type;
  }
}

// ============================================================================
// Helper: Parse class schedule JSON to today's times
// ============================================================================

const DAY_MAP: Record<number, string> = {
  0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
};

interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}

function getTodaySchedule(scheduleJson: string | null): ScheduleSlot | null {
  if (!scheduleJson) return null;
  try {
    const slots: ScheduleSlot[] = JSON.parse(scheduleJson);
    const { getDayOfWeekKST } = require("@/lib/date-utils");
    const todayDay = DAY_MAP[getDayOfWeekKST()];
    return slots.find((s) => s.day === todayDay) || null;
  } catch {
    return null;
  }
}

function getClassStatus(
  startTime: string,
  endTime: string
): "in-progress" | "upcoming" | "completed" {
  const now = new Date();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (nowMinutes >= startMinutes && nowMinutes < endMinutes) return "in-progress";
  if (nowMinutes >= endMinutes) return "completed";
  return "upcoming";
}

// ============================================================================
// 1. getDashboardKPIs
// ============================================================================

export async function getDashboardKPIs(academyId: string): Promise<KPIData> {
  try {
    const { getMonthStartKST, getLastMonthStartKST, getTodayRangeKST } = require("@/lib/date-utils");
    const startOfMonth = getMonthStartKST();
    const startOfLastMonth = getLastMonthStartKST();
    const endOfLastMonth = new Date(startOfMonth.getTime() - 1);
    const { today: todayStart, tomorrow: todayEnd } = getTodayRangeKST();

    // All 7 queries are independent — run in parallel
    const [
      totalStudents,
      lastMonthStudents,
      paidInvoices,
      totalInvoiced,
      todayAttendances,
      presentToday,
      newRegistrations,
      lastMonthNewReg,
    ] = await Promise.all([
      // Total active students
      prisma.student.count({
        where: { academyId, status: "ACTIVE" },
      }),
      // Last month active students
      prisma.student.count({
        where: {
          academyId,
          status: { in: ["ACTIVE", "PAUSED"] },
          enrollDate: { lte: endOfLastMonth },
          OR: [
            { withdrawDate: null },
            { withdrawDate: { gt: endOfLastMonth } },
          ],
        },
      }),
      // Monthly revenue (PAID invoices this month)
      prisma.invoice.aggregate({
        where: {
          academyId,
          status: "PAID",
          paidDate: { gte: startOfMonth },
        },
        _sum: { finalAmount: true },
      }),
      // Total invoiced this month
      prisma.invoice.aggregate({
        where: {
          academyId,
          dueDate: { gte: startOfMonth },
          status: { not: "CANCELLED" },
        },
        _sum: { finalAmount: true },
      }),
      // Today's attendance (total)
      prisma.attendance.count({
        where: {
          academyId,
          date: { gte: todayStart, lt: todayEnd },
        },
      }),
      // Today's attendance (present + late)
      prisma.attendance.count({
        where: {
          academyId,
          date: { gte: todayStart, lt: todayEnd },
          status: { in: ["PRESENT", "LATE"] },
        },
      }),
      // New registrations this month
      prisma.student.count({
        where: {
          academyId,
          enrollDate: { gte: startOfMonth },
        },
      }),
      // New registrations last month
      prisma.student.count({
        where: {
          academyId,
          enrollDate: { gte: startOfLastMonth, lt: startOfMonth },
        },
      }),
    ]);

    const studentDelta = totalStudents - lastMonthStudents;
    const monthlyRevenue = paidInvoices._sum.finalAmount || 0;
    const totalDue = totalInvoiced._sum.finalAmount || 1;
    const collectionRate = totalDue > 0 ? Math.round((monthlyRevenue / totalDue) * 100) : 0;
    const attendanceRate = todayAttendances > 0
      ? Math.round((presentToday / todayAttendances) * 100)
      : 0;
    const newRegDelta = newRegistrations - lastMonthNewReg;

    return {
      totalStudents,
      studentDelta,
      monthlyRevenue,
      collectionRate,
      attendanceRate,
      presentCount: presentToday,
      totalAttendanceCount: todayAttendances,
      newRegistrations,
      newRegDelta,
    };
  } catch (error) {
    console.error("getDashboardKPIs error:", error);
    return {
      totalStudents: 0,
      studentDelta: 0,
      monthlyRevenue: 0,
      collectionRate: 0,
      attendanceRate: 0,
      presentCount: 0,
      totalAttendanceCount: 0,
      newRegistrations: 0,
      newRegDelta: 0,
    };
  }
}

// ============================================================================
// 2. getStudentTrend
// ============================================================================

export async function getStudentTrend(academyId: string): Promise<StudentTrendPoint[]> {
  try {
    const KST = 9 * 60 * 60 * 1000;
    const kstNow = new Date(Date.now() + KST);

    // Build month descriptors for the last 6 months (KST 기준)
    const months = Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const y = kstNow.getUTCFullYear();
      const m = kstNow.getUTCMonth() - i;
      const startDate = new Date(Date.UTC(y, m, 1) - KST);
      const endDate = new Date(Date.UTC(y, m + 1, 1) - KST);
      return { monthLabel: `${((m % 12) + 12) % 12 + 1}월`, startDate, endDate };
    });

    // All 6 count queries are independent — run in parallel
    const counts = await Promise.all(
      months.map((m) =>
        prisma.student.count({
          where: {
            academyId,
            enrollDate: { lte: m.endDate },
            OR: [
              { withdrawDate: null },
              { withdrawDate: { gt: m.endDate } },
            ],
          },
        })
      )
    );

    const points: StudentTrendPoint[] = months.map((m, idx) => ({
      month: m.monthLabel,
      count: counts[idx],
    }));

    return points;
  } catch (error) {
    console.error("getStudentTrend error:", error);
    return [];
  }
}

// ============================================================================
// 3. getPaymentSummary
// ============================================================================

export async function getPaymentSummary(academyId: string): Promise<PaymentSummaryItem[]> {
  try {
    const { getMonthStartKST } = require("@/lib/date-utils");
    const startOfMonth = getMonthStartKST();
    const KST2 = 9 * 60 * 60 * 1000;
    const kst2 = new Date(Date.now() + KST2);
    const endOfMonth = new Date(Date.UTC(kst2.getUTCFullYear(), kst2.getUTCMonth() + 1, 1) - KST2);

    const statuses = ["PAID", "PENDING", "OVERDUE"] as const;
    const labels: Record<string, string> = {
      PAID: "수납 완료",
      PENDING: "미수납",
      OVERDUE: "연체",
    };
    const colors: Record<string, string> = {
      PAID: "#10B981",
      PENDING: "#F59E0B",
      OVERDUE: "#EF4444",
    };

    // All 3 aggregate queries are independent — run in parallel
    const aggregates = await Promise.all(
      statuses.map((status) =>
        prisma.invoice.aggregate({
          where: {
            academyId,
            status,
            dueDate: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { finalAmount: true },
          _count: true,
        })
      )
    );

    const results: PaymentSummaryItem[] = statuses.map((status, idx) => ({
      status,
      label: labels[status],
      amount: aggregates[idx]._sum.finalAmount || 0,
      count: aggregates[idx]._count,
      color: colors[status],
    }));

    return results;
  } catch (error) {
    console.error("getPaymentSummary error:", error);
    return [
      { status: "PAID", label: "수납 완료", amount: 0, count: 0, color: "#10B981" },
      { status: "PENDING", label: "미수납", amount: 0, count: 0, color: "#F59E0B" },
      { status: "OVERDUE", label: "연체", amount: 0, count: 0, color: "#EF4444" },
    ];
  }
}

// ============================================================================
// 4. getTodayClasses
// ============================================================================

export async function getTodayClasses(academyId: string): Promise<TodayClassItem[]> {
  try {
    const classes = await prisma.class.findMany({
      where: { academyId, isActive: true },
      include: {
        teacher: { select: { name: true } },
        enrollments: { where: { status: "ENROLLED" }, select: { id: true } },
      },
    });

    const todayClasses: TodayClassItem[] = [];

    for (const cls of classes) {
      const slot = getTodaySchedule(cls.schedule);
      if (!slot) continue;

      todayClasses.push({
        id: cls.id,
        name: cls.name,
        time: `${slot.startTime} - ${slot.endTime}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        teacherName: cls.teacher?.name || "미배정",
        studentCount: cls.enrollments.length,
        room: cls.room,
        status: getClassStatus(slot.startTime, slot.endTime),
      });
    }

    // Sort by start time
    todayClasses.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return todayClasses;
  } catch (error) {
    console.error("getTodayClasses error:", error);
    return [];
  }
}

// ============================================================================
// 5. getOverdueInvoices
// ============================================================================

export async function getOverdueInvoices(academyId: string): Promise<OverdueInvoiceItem[]> {
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        academyId,
        status: "OVERDUE",
      },
      include: {
        student: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    });

    const now = new Date();
    return invoices.map((inv) => ({
      id: inv.id,
      studentName: inv.student.name,
      amount: inv.finalAmount,
      daysOverdue: Math.floor(
        (now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      ),
      title: inv.title,
    }));
  } catch (error) {
    console.error("getOverdueInvoices error:", error);
    return [];
  }
}

// ============================================================================
// 6. getRecentConsultations
// ============================================================================

export async function getRecentConsultations(
  academyId: string
): Promise<ConsultationItem[]> {
  try {
    const consultations = await prisma.consultation.findMany({
      where: { academyId },
      include: {
        student: { select: { name: true } },
        staff: { select: { name: true } },
      },
      orderBy: { date: "desc" },
      take: 8,
    });

    return consultations.map((c) => ({
      id: c.id,
      studentName: c.student?.name || null,
      type: c.type,
      typeLabel: getConsultationTypeLabel(c.type),
      date: c.date.toISOString(),
      status: c.status,
      staffName: c.staff?.name || null,
    }));
  } catch (error) {
    console.error("getRecentConsultations error:", error);
    return [];
  }
}

// ============================================================================
// 7. Teacher Dashboard Actions
// ============================================================================

export async function getTeacherKPIs(
  academyId: string,
  staffId: string
): Promise<TeacherKPIData> {
  try {
    // My classes (all active)
    const myClasses = await prisma.class.findMany({
      where: { academyId, teacherId: staffId, isActive: true },
      include: {
        enrollments: { where: { status: "ENROLLED" }, select: { id: true } },
      },
    });

    // Count today's classes
    let myClassesToday = 0;
    for (const cls of myClasses) {
      const slot = getTodaySchedule(cls.schedule);
      if (slot) myClassesToday++;
    }

    // Total students across my classes
    const myStudents = myClasses.reduce((sum, cls) => sum + cls.enrollments.length, 0);

    // Ungraded exams: submissions with status SUBMITTED (not yet GRADED)
    const myClassIds = myClasses.map((c) => c.id);

    // Both count queries depend on myClassIds but are independent of each other
    const now = new Date();
    const [ungradedExams, missingAssignments] = await Promise.all([
      prisma.examSubmission.count({
        where: {
          status: "SUBMITTED",
          exam: {
            academyId,
            classId: { in: myClassIds.length > 0 ? myClassIds : ["__none__"] },
          },
        },
      }),
      // Missing assignments: submissions not yet submitted past due date
      prisma.assignmentSubmission.count({
        where: {
          status: "PENDING",
          assignment: {
            academyId,
            classId: { in: myClassIds.length > 0 ? myClassIds : ["__none__"] },
            dueDate: { lt: now },
          },
        },
      }),
    ]);

    return {
      myClassesToday,
      ungradedExams,
      missingAssignments,
      myStudents,
    };
  } catch (error) {
    console.error("getTeacherKPIs error:", error);
    return {
      myClassesToday: 0,
      ungradedExams: 0,
      missingAssignments: 0,
      myStudents: 0,
    };
  }
}

export async function getTeacherTodayClasses(
  academyId: string,
  staffId: string
): Promise<TeacherClassItem[]> {
  try {
    const { getTodayRangeKST } = require("@/lib/date-utils");
    const { today: todayStart, tomorrow: todayEnd } = getTodayRangeKST();

    const classes = await prisma.class.findMany({
      where: { academyId, teacherId: staffId, isActive: true },
      include: {
        enrollments: { where: { status: "ENROLLED" }, select: { studentId: true } },
        attendances: {
          where: {
            date: { gte: todayStart, lt: todayEnd },
            status: { in: ["PRESENT", "LATE"] },
          },
          select: { id: true },
        },
      },
    });

    const result: TeacherClassItem[] = [];

    for (const cls of classes) {
      const slot = getTodaySchedule(cls.schedule);
      if (!slot) continue;

      result.push({
        id: cls.id,
        name: cls.name,
        time: `${slot.startTime} - ${slot.endTime}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: cls.room,
        studentCount: cls.enrollments.length,
        attendedCount: cls.attendances.length,
        status: getClassStatus(slot.startTime, slot.endTime),
      });
    }

    result.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return result;
  } catch (error) {
    console.error("getTeacherTodayClasses error:", error);
    return [];
  }
}

export async function getTeacherRecentExams(
  academyId: string,
  staffId: string
): Promise<RecentExamResult[]> {
  try {
    const myClassIds = (
      await prisma.class.findMany({
        where: { academyId, teacherId: staffId, isActive: true },
        select: { id: true },
      })
    ).map((c) => c.id);

    if (myClassIds.length === 0) return [];

    const exams = await prisma.exam.findMany({
      where: {
        academyId,
        classId: { in: myClassIds },
        status: { in: ["COMPLETED", "IN_PROGRESS", "PUBLISHED"] },
      },
      include: {
        class: { select: { name: true, enrollments: { where: { status: "ENROLLED" }, select: { id: true } } } },
        submissions: {
          where: { status: "GRADED" },
          select: { score: true, maxScore: true },
        },
      },
      orderBy: { examDate: "desc" },
      take: 5,
    });

    return exams.map((exam) => {
      const scores = exam.submissions
        .filter((s) => s.score !== null && s.maxScore !== null)
        .map((s) => ((s.score! / s.maxScore!) * 100));
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

      return {
        id: exam.id,
        examTitle: exam.title,
        className: exam.class?.name || null,
        avgScore,
        submissionCount: exam.submissions.length,
        totalStudents: exam.class?.enrollments.length || 0,
        date: (exam.examDate || exam.createdAt).toISOString(),
      };
    });
  } catch (error) {
    console.error("getTeacherRecentExams error:", error);
    return [];
  }
}

export async function getTeacherPendingAssignments(
  academyId: string,
  staffId: string
): Promise<PendingAssignmentItem[]> {
  try {
    const myClassIds = (
      await prisma.class.findMany({
        where: { academyId, teacherId: staffId, isActive: true },
        select: { id: true },
      })
    ).map((c) => c.id);

    if (myClassIds.length === 0) return [];

    const assignments = await prisma.assignment.findMany({
      where: {
        academyId,
        classId: { in: myClassIds },
      },
      include: {
        class: {
          select: {
            name: true,
            enrollments: { where: { status: "ENROLLED" }, select: { id: true } },
          },
        },
        submissions: {
          where: { status: { in: ["SUBMITTED", "GRADED"] } },
          select: { id: true },
        },
      },
      orderBy: { dueDate: "desc" },
      take: 5,
    });

    return assignments.map((a) => ({
      id: a.id,
      title: a.title,
      className: a.class?.name || null,
      dueDate: a.dueDate.toISOString(),
      submittedCount: a.submissions.length,
      totalStudents: a.class?.enrollments.length || 0,
    }));
  } catch (error) {
    console.error("getTeacherPendingAssignments error:", error);
    return [];
  }
}
