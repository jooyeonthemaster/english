"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AttendanceRecord {
  studentId: string;
  classId?: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EARLY_LEAVE" | "MAKEUP";
  note?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Kiosk Check-in / Check-out
// ---------------------------------------------------------------------------

export async function checkIn(
  academyId: string,
  studentCode: string
): Promise<ActionResult> {
  try {
    const student = await prisma.student.findFirst({
      where: { academyId, studentCode, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        grade: true,
        classEnrollments: {
          where: { status: "ENROLLED" },
          select: { classId: true },
        },
      },
    });

    if (!student) {
      return { success: false, error: "학생을 찾을 수 없습니다." };
    }

    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);

    // Check if already checked in today
    const existing = await prisma.attendance.findFirst({
      where: {
        studentId: student.id,
        date: { gte: dayStart, lte: dayEnd },
        checkInTime: { not: null },
      },
    });

    if (existing) {
      return {
        success: false,
        error: "이미 출석 처리되었습니다.",
        data: {
          studentName: student.name,
          studentAvatar: student.avatarUrl,
        },
      };
    }

    // Create attendance record (for primary class or general)
    const classId = student.classEnrollments[0]?.classId || null;

    await prisma.attendance.create({
      data: {
        academyId,
        studentId: student.id,
        classId,
        date: dayStart,
        checkInTime: today,
        status: "PRESENT",
        method: "KIOSK",
      },
    });

    revalidatePath("/director/attendance");
    revalidatePath("/director/attendance/dashboard");

    return {
      success: true,
      data: {
        studentName: student.name,
        studentAvatar: student.avatarUrl,
        studentGrade: student.grade,
        checkInTime: today.toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "출석 처리에 실패했습니다.",
    };
  }
}

export async function checkOut(
  academyId: string,
  studentCode: string
): Promise<ActionResult> {
  try {
    const student = await prisma.student.findFirst({
      where: { academyId, studentCode, status: "ACTIVE" },
      select: { id: true, name: true, avatarUrl: true, grade: true },
    });

    if (!student) {
      return { success: false, error: "학생을 찾을 수 없습니다." };
    }

    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);

    const attendance = await prisma.attendance.findFirst({
      where: {
        studentId: student.id,
        date: { gte: dayStart, lte: dayEnd },
        checkInTime: { not: null },
        checkOutTime: null,
      },
    });

    if (!attendance) {
      return { success: false, error: "출석 기록이 없습니다. 먼저 출석 처리해주세요." };
    }

    await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOutTime: today },
    });

    revalidatePath("/director/attendance");
    revalidatePath("/director/attendance/dashboard");

    return {
      success: true,
      data: {
        studentName: student.name,
        studentAvatar: student.avatarUrl,
        studentGrade: student.grade,
        checkOutTime: today.toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "하원 처리에 실패했습니다.",
    };
  }
}

// ---------------------------------------------------------------------------
// Manual Attendance
// ---------------------------------------------------------------------------

export async function markAttendance(
  academyId: string,
  date: Date,
  records: AttendanceRecord[]
): Promise<ActionResult> {
  try {
    await requireStaffAuth();
    const dayStart = startOfDay(date);

    const operations = records.map((r) =>
      prisma.attendance.upsert({
        where: {
          studentId_classId_date: {
            studentId: r.studentId,
            classId: r.classId || "",
            date: dayStart,
          },
        },
        update: {
          status: r.status,
          note: r.note || null,
          method: "MANUAL",
        },
        create: {
          academyId,
          studentId: r.studentId,
          classId: r.classId || null,
          date: dayStart,
          status: r.status,
          note: r.note || null,
          method: "MANUAL",
          checkInTime: r.status === "PRESENT" || r.status === "LATE" ? new Date() : null,
        },
      })
    );

    await prisma.$transaction(operations);

    revalidatePath("/director/attendance");
    revalidatePath("/director/attendance/dashboard");
    revalidatePath("/teacher/attendance");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "출결 처리에 실패했습니다.",
    };
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getTodayAttendance(academyId: string) {
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const records = await prisma.attendance.findMany({
    where: {
      academyId,
      date: { gte: dayStart, lte: dayEnd },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentCode: true,
          grade: true,
          avatarUrl: true,
        },
      },
      class: { select: { id: true, name: true } },
    },
    orderBy: { checkInTime: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    student: r.student,
    class: r.class,
    status: r.status,
    checkInTime: r.checkInTime?.toISOString() || null,
    checkOutTime: r.checkOutTime?.toISOString() || null,
    method: r.method,
    note: r.note,
  }));
}

export async function getAttendanceReport(academyId: string, month: Date) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const records = await prisma.attendance.findMany({
    where: {
      academyId,
      date: { gte: monthStart, lte: monthEnd },
    },
    select: {
      date: true,
      status: true,
      studentId: true,
    },
  });

  // Group by date
  const byDate = new Map<string, { present: number; absent: number; late: number; total: number }>();

  for (const r of records) {
    const dateKey = r.date.toISOString().split("T")[0];
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { present: 0, absent: 0, late: 0, total: 0 });
    }
    const day = byDate.get(dateKey)!;
    day.total++;
    if (r.status === "PRESENT" || r.status === "MAKEUP") day.present++;
    else if (r.status === "ABSENT") day.absent++;
    else if (r.status === "LATE") day.late++;
  }

  // Overall stats
  const totalStudents = await prisma.student.count({
    where: { academyId, status: "ACTIVE" },
  });

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const todayRecords = await prisma.attendance.findMany({
    where: {
      academyId,
      date: { gte: todayStart, lte: todayEnd },
    },
    select: { status: true },
  });

  const todayPresent = todayRecords.filter(
    (r) => r.status === "PRESENT" || r.status === "MAKEUP"
  ).length;
  const todayLate = todayRecords.filter((r) => r.status === "LATE").length;
  const todayAbsent = todayRecords.filter((r) => r.status === "ABSENT").length;

  return {
    totalStudents,
    todayPresent,
    todayAbsent,
    todayLate,
    todayTotal: todayRecords.length,
    dailyData: Object.fromEntries(byDate),
  };
}

export async function getClassAttendance(classId: string, date: Date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const enrollments = await prisma.classEnrollment.findMany({
    where: { classId, status: "ENROLLED" },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentCode: true,
          grade: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { student: { name: "asc" } },
  });

  const attendances = await prisma.attendance.findMany({
    where: {
      classId,
      date: { gte: dayStart, lte: dayEnd },
    },
  });

  const attendanceMap = new Map(
    attendances.map((a) => [a.studentId, a])
  );

  return enrollments.map((e) => {
    const att = attendanceMap.get(e.studentId);
    return {
      student: e.student,
      status: att?.status || null,
      checkInTime: att?.checkInTime?.toISOString() || null,
      checkOutTime: att?.checkOutTime?.toISOString() || null,
      note: att?.note || null,
      attendanceId: att?.id || null,
    };
  });
}

export async function getMissingStudents(academyId: string) {
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  // Get all active students with enrollments
  const activeStudents = await prisma.student.findMany({
    where: {
      academyId,
      status: "ACTIVE",
      classEnrollments: { some: { status: "ENROLLED" } },
    },
    select: {
      id: true,
      name: true,
      studentCode: true,
      grade: true,
      avatarUrl: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        include: {
          class: { select: { id: true, name: true, schedule: true } },
        },
      },
    },
  });

  // Get today's attendance
  const todayAttendance = await prisma.attendance.findMany({
    where: {
      academyId,
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { studentId: true },
  });

  const checkedInIds = new Set(todayAttendance.map((a) => a.studentId));

  // Filter to students expected today but not checked in
  const dayOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    today.getDay()
  ];

  return activeStudents
    .filter((s) => {
      if (checkedInIds.has(s.id)) return false;
      // Check if student has a class scheduled today
      return s.classEnrollments.some((ce) => {
        if (!ce.class.schedule) return false;
        try {
          const schedule = JSON.parse(ce.class.schedule) as Array<{
            day: string;
          }>;
          return schedule.some((entry) => entry.day === dayOfWeek);
        } catch {
          return false;
        }
      });
    })
    .map((s) => ({
      id: s.id,
      name: s.name,
      studentCode: s.studentCode,
      grade: s.grade,
      avatarUrl: s.avatarUrl,
      classes: s.classEnrollments.map((ce) => ce.class.name),
    }));
}

export async function getClassesForAttendance(academyId: string) {
  return prisma.class.findMany({
    where: { academyId, isActive: true },
    select: { id: true, name: true, schedule: true },
    orderBy: { name: "asc" },
  });
}

export async function getTeacherClasses(teacherId: string) {
  return prisma.class.findMany({
    where: { teacherId, isActive: true },
    select: { id: true, name: true, schedule: true },
    orderBy: { name: "asc" },
  });
}
