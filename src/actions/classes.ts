"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ScheduleEntry {
  day: string; // "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"
  startTime: string; // "14:00"
  endTime: string; // "16:00"
}

export interface ClassData {
  name: string;
  teacherId?: string | null;
  capacity: number;
  fee: number;
  room?: string | null;
  schedule: ScheduleEntry[];
  isActive?: boolean;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAY_MAP: Record<string, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

// NOTE: formatScheduleLabel moved to @/lib/utils (can't export non-async from "use server")


// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getClasses(academyId: string) {
  const classes = await prisma.class.findMany({
    where: { academyId },
    include: {
      teacher: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
    },
    orderBy: { name: "asc" },
  });

  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    teacherId: c.teacherId,
    teacherName: c.teacher?.name || null,
    teacherAvatar: c.teacher?.avatarUrl || null,
    schedule: c.schedule ? (JSON.parse(c.schedule) as ScheduleEntry[]) : [],
    capacity: c.capacity,
    fee: c.fee,
    room: c.room,
    isActive: c.isActive,
    enrolledCount: c._count.enrollments,
    createdAt: c.createdAt,
  }));
}

export async function getClass(classId: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      teacher: { select: { id: true, name: true, avatarUrl: true, phone: true } },
      enrollments: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
              studentCode: true,
              grade: true,
              phone: true,
              avatarUrl: true,
              status: true,
            },
          },
        },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });

  if (!cls) return null;

  const enrolled = cls.enrollments.filter((e) => e.status === "ENROLLED");
  const waitlisted = cls.enrollments.filter((e) => e.status === "WAITLISTED");

  // Get attendance stats for enrolled students
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const attendanceStats = await prisma.attendance.groupBy({
    by: ["studentId", "status"],
    where: {
      classId,
      date: { gte: thirtyDaysAgo },
    },
    _count: true,
  });

  const statsMap = new Map<string, Record<string, number>>();
  for (const stat of attendanceStats) {
    if (!statsMap.has(stat.studentId)) {
      statsMap.set(stat.studentId, {});
    }
    statsMap.get(stat.studentId)![stat.status] = stat._count;
  }

  return {
    id: cls.id,
    academyId: cls.academyId,
    name: cls.name,
    teacherId: cls.teacherId,
    teacherName: cls.teacher?.name || null,
    teacherAvatar: cls.teacher?.avatarUrl || null,
    teacherPhone: cls.teacher?.phone || null,
    schedule: cls.schedule ? (JSON.parse(cls.schedule) as ScheduleEntry[]) : [],
    capacity: cls.capacity,
    fee: cls.fee,
    room: cls.room,
    isActive: cls.isActive,
    enrolled: enrolled.map((e) => ({
      enrollmentId: e.id,
      enrolledAt: e.enrolledAt,
      student: e.student,
      attendance: statsMap.get(e.studentId) || {},
    })),
    waitlisted: waitlisted.map((e) => ({
      enrollmentId: e.id,
      enrolledAt: e.enrolledAt,
      student: e.student,
    })),
  };
}

export async function createClass(
  academyId: string,
  data: ClassData
): Promise<ActionResult> {
  try {
    await requireStaffAuth("DIRECTOR");
    await prisma.class.create({
      data: {
        academyId,
        name: data.name,
        teacherId: data.teacherId || null,
        capacity: data.capacity,
        fee: data.fee,
        room: data.room || null,
        schedule: JSON.stringify(data.schedule),
        isActive: data.isActive ?? true,
      },
    });
    revalidatePath("/director/classes");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반 생성에 실패했습니다.",
    };
  }
}

export async function updateClass(
  classId: string,
  data: Partial<ClassData>
): Promise<ActionResult> {
  try {
    await requireStaffAuth("DIRECTOR");
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.teacherId !== undefined) updateData.teacherId = data.teacherId || null;
    if (data.capacity !== undefined) updateData.capacity = data.capacity;
    if (data.fee !== undefined) updateData.fee = data.fee;
    if (data.room !== undefined) updateData.room = data.room || null;
    if (data.schedule !== undefined)
      updateData.schedule = JSON.stringify(data.schedule);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    await prisma.class.update({
      where: { id: classId },
      data: updateData,
    });
    revalidatePath("/director/classes");
    revalidatePath(`/director/classes/${classId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반 수정에 실패했습니다.",
    };
  }
}

export async function deleteClass(classId: string): Promise<ActionResult> {
  try {
    await requireStaffAuth("DIRECTOR");
    await prisma.class.delete({ where: { id: classId } });
    revalidatePath("/director/classes");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "반 삭제에 실패했습니다.",
    };
  }
}

export async function enrollStudent(
  classId: string,
  studentId: string,
  status: "ENROLLED" | "WAITLISTED" = "ENROLLED"
): Promise<ActionResult> {
  try {
    await requireStaffAuth("DIRECTOR");

    // Check capacity if enrolling
    if (status === "ENROLLED") {
      const cls = await prisma.class.findUnique({
        where: { id: classId },
        include: {
          _count: {
            select: { enrollments: { where: { status: "ENROLLED" } } },
          },
        },
      });
      if (cls && cls._count.enrollments >= cls.capacity) {
        return { success: false, error: "정원이 초과되었습니다. 대기열에 추가하시겠습니까?" };
      }
    }

    await prisma.classEnrollment.upsert({
      where: { classId_studentId: { classId, studentId } },
      update: { status, droppedAt: null },
      create: { classId, studentId, status },
    });

    revalidatePath(`/director/classes/${classId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수강 등록에 실패했습니다.",
    };
  }
}

export async function removeStudent(
  classId: string,
  studentId: string
): Promise<ActionResult> {
  try {
    await requireStaffAuth("DIRECTOR");
    await prisma.classEnrollment.update({
      where: { classId_studentId: { classId, studentId } },
      data: { status: "DROPPED", droppedAt: new Date() },
    });
    revalidatePath(`/director/classes/${classId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수강 취소에 실패했습니다.",
    };
  }
}

export async function getClassStudents(classId: string) {
  const enrollments = await prisma.classEnrollment.findMany({
    where: { classId, status: "ENROLLED" },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentCode: true,
          grade: true,
          phone: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { student: { name: "asc" } },
  });

  return enrollments.map((e) => e.student);
}

export async function getStaffList(academyId: string) {
  return prisma.staff.findMany({
    where: { academyId, isActive: true },
    select: { id: true, name: true, role: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });
}

export async function searchStudents(academyId: string, query: string) {
  return prisma.student.findMany({
    where: {
      academyId,
      status: "ACTIVE",
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { studentCode: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      studentCode: true,
      grade: true,
      avatarUrl: true,
    },
    take: 20,
    orderBy: { name: "asc" },
  });
}
