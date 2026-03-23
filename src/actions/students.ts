"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { generateStudentCode } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface StudentFilters {
  status?: string;
  schoolId?: string;
  grade?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

interface CreateStudentData {
  name: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  schoolId?: string;
  grade: number;
  memo?: string;
  parentName?: string;
  parentPhone?: string;
  parentRelation?: string;
  emergencyContact?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("인증이 필요합니다.");
  const user = session.user as unknown as Record<string, unknown>;
  return {
    id: user.id as string,
    role: user.role as string,
    academyId: user.academyId as string,
  };
}

// ---------------------------------------------------------------------------
// Student CRUD
// ---------------------------------------------------------------------------

/** Paginated student list with filters */
export async function getStudents(academyId: string, filters?: StudentFilters) {
  await requireAuth();

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { academyId };

  if (filters?.status && filters.status !== "ALL") {
    where.status = filters.status;
  }
  if (filters?.schoolId) {
    where.schoolId = filters.schoolId;
  }
  if (filters?.grade) {
    where.grade = filters.grade;
  }
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { studentCode: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        school: { select: { id: true, name: true, type: true } },
        classEnrollments: {
          where: { status: "ENROLLED" },
          include: {
            class: { select: { id: true, name: true } },
          },
        },
        parentLinks: {
          include: {
            parent: { select: { id: true, name: true, phone: true, relation: true, emergencyContact: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return {
    students,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Full student detail with all relations */
export async function getStudent(studentId: string) {
  await requireAuth();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: true,
      classEnrollments: {
        include: {
          class: {
            include: {
              teacher: { select: { id: true, name: true } },
            },
          },
        },
      },
      parentLinks: {
        include: {
          parent: true,
        },
      },
    },
  });

  return student;
}

/** Create student with auto-generated code and optional parent */
export async function createStudent(
  academyId: string,
  data: CreateStudentData
): Promise<ActionResult & { studentId?: string }> {
  try {
    const staff = await requireAuth();
    // Allow passing "__CURRENT__" to use the session's academyId
    if (academyId === "__CURRENT__") {
      academyId = staff.academyId;
    }

    // Generate unique student code
    let code = generateStudentCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.student.findUnique({
        where: { studentCode: code },
      });
      if (!existing) break;
      code = generateStudentCode();
      attempts++;
    }

    const student = await prisma.student.create({
      data: {
        academyId,
        name: data.name,
        studentCode: code,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender || null,
        phone: data.phone || null,
        schoolId: data.schoolId || null,
        grade: data.grade,
        memo: data.memo || null,
        status: "ACTIVE",
      },
    });

    // Create parent if parent info provided
    if (data.parentName && data.parentPhone) {
      const parent = await prisma.parent.create({
        data: {
          academyId,
          name: data.parentName,
          phone: data.parentPhone,
          relation: data.parentRelation || null,
          emergencyContact: data.emergencyContact || null,
        },
      });

      await prisma.parentStudent.create({
        data: {
          parentId: parent.id,
          studentId: student.id,
        },
      });
    }

    revalidatePath("/director/students");
    return { success: true, studentId: student.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "학생 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Update student info */
export async function updateStudent(
  studentId: string,
  data: Partial<CreateStudentData>
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.student.update({
      where: { id: studentId },
      data: {
        name: data.name,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        gender: data.gender,
        phone: data.phone,
        schoolId: data.schoolId || null,
        grade: data.grade,
        memo: data.memo,
      },
    });

    // Update parent if provided
    if (data.parentName || data.parentPhone) {
      const existingLink = await prisma.parentStudent.findFirst({
        where: { studentId },
        include: { parent: true },
      });

      if (existingLink) {
        await prisma.parent.update({
          where: { id: existingLink.parentId },
          data: {
            name: data.parentName || existingLink.parent.name,
            phone: data.parentPhone || existingLink.parent.phone,
            relation: data.parentRelation ?? existingLink.parent.relation,
            emergencyContact: data.emergencyContact ?? existingLink.parent.emergencyContact,
          },
        });
      } else if (data.parentName && data.parentPhone) {
        const student = await prisma.student.findUnique({
          where: { id: studentId },
          select: { academyId: true },
        });
        if (student) {
          const parent = await prisma.parent.create({
            data: {
              academyId: student.academyId,
              name: data.parentName,
              phone: data.parentPhone,
              relation: data.parentRelation || null,
              emergencyContact: data.emergencyContact || null,
            },
          });
          await prisma.parentStudent.create({
            data: { parentId: parent.id, studentId },
          });
        }
      }
    }

    revalidatePath("/director/students");
    revalidatePath(`/director/students/${studentId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "학생 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Change student status */
export async function updateStudentStatus(
  studentId: string,
  status: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const updateData: Record<string, unknown> = { status };

    if (status === "WITHDRAWN") {
      updateData.withdrawDate = new Date();
    } else if (status === "PAUSED") {
      updateData.pauseDate = new Date();
    } else if (status === "ACTIVE") {
      updateData.withdrawDate = null;
      updateData.pauseDate = null;
    }

    await prisma.student.update({
      where: { id: studentId },
      data: updateData,
    });

    revalidatePath("/director/students");
    revalidatePath(`/director/students/${studentId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "상태 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Assign student to a class */
export async function assignStudentToClass(
  studentId: string,
  classId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.classEnrollment.upsert({
      where: {
        classId_studentId: { classId, studentId },
      },
      update: {
        status: "ENROLLED",
        droppedAt: null,
      },
      create: {
        classId,
        studentId,
        status: "ENROLLED",
      },
    });

    revalidatePath("/director/students");
    revalidatePath(`/director/students/${studentId}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "반 배정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Get comprehensive student stats */
export async function getStudentStats(studentId: string) {
  await requireAuth();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    attendances,
    totalAttendances,
    examSubmissions,
    invoices,
    consultations,
    student,
  ] = await Promise.all([
    // Recent attendance (30 days)
    prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: "desc" },
    }),
    // Total attendance count
    prisma.attendance.count({
      where: { studentId },
    }),
    // Exam submissions with scores
    prisma.examSubmission.findMany({
      where: { studentId },
      include: {
        exam: { select: { title: true, grade: true, examType: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 10,
    }),
    // Invoices
    prisma.invoice.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { dueDate: "desc" },
      take: 10,
    }),
    // Consultations
    prisma.consultation.findMany({
      where: { studentId },
      include: {
        staff: { select: { name: true } },
      },
      orderBy: { date: "desc" },
      take: 10,
    }),
    // Student XP/level
    prisma.student.findUnique({
      where: { id: studentId },
      select: { xp: true, level: true, streak: true },
    }),
  ]);

  // Calculate attendance rate
  const presentCount = attendances.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;
  const attendanceRate =
    attendances.length > 0
      ? Math.round((presentCount / attendances.length) * 100)
      : 0;

  // Calculate average exam score
  const scoredExams = examSubmissions.filter((e) => e.score !== null);
  const averageScore =
    scoredExams.length > 0
      ? Math.round(
          scoredExams.reduce((sum, e) => sum + (e.score ?? 0), 0) /
            scoredExams.length
        )
      : 0;

  return {
    attendanceRate,
    totalAttendances,
    recentAttendances: attendances,
    averageScore,
    examSubmissions,
    invoices,
    consultations,
    xp: student?.xp ?? 0,
    level: student?.level ?? 1,
    streak: student?.streak ?? 0,
  };
}

/** Soft delete student (set WITHDRAWN status) */
export async function deleteStudent(studentId: string): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.student.update({
      where: { id: studentId },
      data: {
        status: "WITHDRAWN",
        withdrawDate: new Date(),
      },
    });

    revalidatePath("/director/students");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "학생 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Get schools for the academy (for dropdown) */
export async function getSchools(academyId: string) {
  await requireAuth();

  return prisma.school.findMany({
    where: { academyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
}

/** Get classes for the academy (for dropdown) */
export async function getClasses(academyId: string) {
  await requireAuth();

  return prisma.class.findMany({
    where: { academyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Bulk update student status */
export async function bulkUpdateStudentStatus(
  studentIds: string[],
  status: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const updateData: Record<string, unknown> = { status };
    if (status === "WITHDRAWN") updateData.withdrawDate = new Date();
    if (status === "PAUSED") updateData.pauseDate = new Date();

    await prisma.student.updateMany({
      where: { id: { in: studentIds } },
      data: updateData,
    });

    revalidatePath("/director/students");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "일괄 상태 변경 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/** Get students by teacher's classes */
export async function getStudentsByTeacher(staffId: string, filters?: StudentFilters) {
  await requireAuth();

  // Find classes taught by this teacher
  const classes = await prisma.class.findMany({
    where: { teacherId: staffId, isActive: true },
    select: { id: true },
  });

  const classIds = classes.map((c) => c.id);

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const enrollmentWhere: Record<string, unknown> = {
    classId: { in: classIds },
    status: "ENROLLED",
  };

  // Build student-level filters
  const studentWhere: Record<string, unknown> = {};
  if (filters?.status && filters.status !== "ALL") {
    studentWhere.status = filters.status;
  }
  if (filters?.schoolId) {
    studentWhere.schoolId = filters.schoolId;
  }
  if (filters?.grade) {
    studentWhere.grade = filters.grade;
  }
  if (filters?.search) {
    studentWhere.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { studentCode: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (Object.keys(studentWhere).length > 0) {
    enrollmentWhere.student = studentWhere;
  }

  const [enrollments, total] = await Promise.all([
    prisma.classEnrollment.findMany({
      where: enrollmentWhere,
      include: {
        student: {
          include: {
            school: { select: { id: true, name: true, type: true } },
            classEnrollments: {
              where: { status: "ENROLLED" },
              include: {
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
        class: { select: { id: true, name: true } },
      },
      skip,
      take: pageSize,
    }),
    prisma.classEnrollment.count({ where: enrollmentWhere }),
  ]);

  // Deduplicate students (one student can be in multiple classes)
  const studentMap = new Map<string, typeof enrollments[0]["student"]>();
  for (const enrollment of enrollments) {
    if (!studentMap.has(enrollment.student.id)) {
      studentMap.set(enrollment.student.id, enrollment.student);
    }
  }

  return {
    students: Array.from(studentMap.values()),
    total: studentMap.size,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
