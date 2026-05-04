"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStudent } from "./_helpers";

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

// ---------------------------------------------------------------------------
// 13. getStudentAttendanceHistory — 학생 월별 출석 기록 (ERP)
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
// 14. studentCheckIn — 학생 자체 출석 체크 (QR/수동)
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
