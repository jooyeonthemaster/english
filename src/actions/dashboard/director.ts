"use server";

import { prisma } from "@/lib/prisma";
import { getConsultationTypeLabel, getTodaySchedule, getClassStatus } from "./_helpers";
import type {
  KPIData,
  StudentTrendPoint,
  PaymentSummaryItem,
  TodayClassItem,
  OverdueInvoiceItem,
  ConsultationItem,
} from "./types";

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
