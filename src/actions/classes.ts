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
  id?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// NOTE: formatScheduleLabel moved to @/lib/utils (can't export non-async from "use server")

/** True when the class exists and belongs to the given academy. */
async function classBelongsToAcademy(classId: string, academyId: string) {
  const cls = await prisma.class.findFirst({
    where: { id: classId, academyId },
    select: { id: true },
  });
  return !!cls;
}


// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getClasses(academyId: string) {
  const staff = await requireStaffAuth();
  if (academyId !== staff.academyId) throw new Error("권한이 없습니다.");
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
  const staff = await requireStaffAuth();
  const cls = await prisma.class.findFirst({
    where: { id: classId, academyId: staff.academyId },
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
    const staff = await requireStaffAuth("DIRECTOR");
    if (academyId === "__CURRENT__") academyId = staff.academyId;
    if (academyId !== staff.academyId) {
      return { success: false, error: "권한이 없습니다." };
    }
    const cls = await prisma.class.create({
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
    revalidatePath("/director/tutor");
    return { success: true, id: cls.id };
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
    const staff = await requireStaffAuth("DIRECTOR");
    if (!(await classBelongsToAcademy(classId, staff.academyId))) {
      return { success: false, error: "반을 찾을 수 없습니다." };
    }
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
    revalidatePath("/director/tutor");
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
    const staff = await requireStaffAuth("DIRECTOR");
    if (!(await classBelongsToAcademy(classId, staff.academyId))) {
      return { success: false, error: "반을 찾을 수 없습니다." };
    }
    await prisma.class.delete({ where: { id: classId } });
    revalidatePath("/director/tutor");
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
    const staff = await requireStaffAuth("DIRECTOR");

    // Class + student must both belong to the caller's academy.
    const [cls, student] = await Promise.all([
      prisma.class.findFirst({
        where: { id: classId, academyId: staff.academyId },
        include: {
          _count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
        },
      }),
      prisma.student.findFirst({
        where: { id: studentId, academyId: staff.academyId },
        select: { id: true },
      }),
    ]);
    if (!cls || !student) {
      return { success: false, error: "학생 또는 반을 찾을 수 없습니다." };
    }
    if (status === "ENROLLED" && cls._count.enrollments >= cls.capacity) {
      return { success: false, error: "정원이 초과되었습니다. 대기열에 추가하시겠습니까?" };
    }

    await prisma.classEnrollment.upsert({
      where: { classId_studentId: { classId, studentId } },
      update: { status, droppedAt: null },
      create: { classId, studentId, status },
    });

    revalidatePath("/director/tutor");
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
    const staff = await requireStaffAuth("DIRECTOR");
    if (!(await classBelongsToAcademy(classId, staff.academyId))) {
      return { success: false, error: "반을 찾을 수 없습니다." };
    }
    await prisma.classEnrollment.update({
      where: { classId_studentId: { classId, studentId } },
      data: { status: "DROPPED", droppedAt: new Date() },
    });
    revalidatePath("/director/tutor");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수강 취소에 실패했습니다.",
    };
  }
}

export async function getClassStudents(classId: string) {
  const staff = await requireStaffAuth();
  if (!(await classBelongsToAcademy(classId, staff.academyId))) return [];
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

/** academyId arg is accepted for back-compat but ignored — always scoped to session. */
export async function getStaffList(academyId?: string) {
  const staff = await requireStaffAuth();
  void academyId;
  return prisma.staff.findMany({
    where: { academyId: staff.academyId, isActive: true },
    select: { id: true, name: true, role: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Search active students by name/code, always scoped to the caller's academy.
 * The first positional arg is accepted for back-compat but ignored; some callers
 * pass it positionally with the query — the session academy is authoritative.
 */
export async function searchStudents(academyIdOrQuery: string, query?: string) {
  const staff = await requireStaffAuth();
  // Back-compat: enroll-dialog calls (academyId, query); consultation-dialog
  // calls (query). The query wins when present, else the first positional arg.
  const term = (query ?? academyIdOrQuery ?? "").trim();
  if (!term) return [];
  return prisma.student.findMany({
    where: {
      academyId: staff.academyId,
      status: "ACTIVE",
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { studentCode: { contains: term, mode: "insensitive" } },
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
