"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "./_helpers";
import type { StudentDeviceItem, StudentFilters } from "./types";

/** Paginated student list with filters */
export async function getStudents(academyId: string, filters?: StudentFilters) {
  const staff = await requireAuth();
  // Server-action endpoint: never trust the caller-supplied academyId.
  if (academyId !== staff.academyId) throw new Error("권한이 없습니다.");

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
  if (filters?.classId === "__unassigned__") {
    // Virtual filter: active students belonging to no class.
    where.classEnrollments = { none: { status: "ENROLLED" } };
  } else if (filters?.classId) {
    where.classEnrollments = {
      some: {
        classId: filters.classId,
        status: "ENROLLED",
      },
    };
  }
  if (filters?.grade) {
    where.grade = filters.grade;
  }
  if (filters?.billing === "unpaid") {
    where.invoices = { some: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } };
  }
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { studentCode: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

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
          orderBy: { parent: { createdAt: "desc" } },
          include: {
            parent: { select: { id: true, name: true, phone: true, relation: true, emergencyContact: true } },
          },
        },
        // Current-month invoice (+ payment amounts) for the 원비 column.
        invoices: {
          where: { dueDate: { gte: monthStart, lte: monthEnd } },
          include: { payments: { select: { amount: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        // Active (non-revoked, non-expired) device sessions → "N/2" column.
        _count: {
          select: {
            tutorStudentSessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
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

/** Full student detail with all relations (scoped to the caller's academy). */
export async function getStudent(studentId: string) {
  const staff = await requireAuth();

  const student = await prisma.student.findFirst({
    where: { id: studentId, academyId: staff.academyId },
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
        orderBy: { parent: { createdAt: "desc" } },
        include: {
          parent: true,
        },
      },
    },
  });

  return student;
}

/** Get students by teacher's classes */
export async function getStudentsByTeacher(staffId: string, filters?: StudentFilters) {
  const staff = await requireAuth();

  // Find classes taught by this teacher — scoped to the caller's academy so a
  // foreign staffId can't enumerate another academy's classes/students.
  const classes = await prisma.class.findMany({
    where: { teacherId: staffId, academyId: staff.academyId, isActive: true },
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

  const [enrollments, distinctStudents] = await Promise.all([
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
    // Distinct student count — a student in N classes must count once, so
    // totalPages matches the de-duplicated rows we actually return.
    prisma.classEnrollment.findMany({
      where: enrollmentWhere,
      select: { studentId: true },
      distinct: ["studentId"],
    }),
  ]);
  const total = distinctStudents.length;

  // Deduplicate students (one student can be in multiple classes)
  const studentMap = new Map<string, typeof enrollments[0]["student"]>();
  for (const enrollment of enrollments) {
    if (!studentMap.has(enrollment.student.id)) {
      studentMap.set(enrollment.student.id, enrollment.student);
    }
  }

  return {
    students: Array.from(studentMap.values()),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Aggregate counts for the tutor operations hub KPI bar + onboarding stepper. */
export async function getTutorHubStats(academyId: string) {
  const staff = await requireAuth();
  if (academyId !== staff.academyId) throw new Error("권한이 없습니다.");
  const now = new Date();

  const [
    totalStudents,
    activeStudents,
    unassignedActive,
    unpaidStudents,
    pausedWaiting,
    assignedActive,
    loggedInStudents,
  ] = await Promise.all([
    prisma.student.count({ where: { academyId } }),
    prisma.student.count({ where: { academyId, status: "ACTIVE" } }),
    prisma.student.count({
      where: { academyId, status: "ACTIVE", classEnrollments: { none: { status: "ENROLLED" } } },
    }),
    prisma.student.count({
      where: {
        academyId,
        status: { not: "WITHDRAWN" },
        invoices: { some: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } },
      },
    }),
    prisma.student.count({ where: { academyId, status: { in: ["PAUSED", "WAITING"] } } }),
    prisma.student.count({
      where: { academyId, status: "ACTIVE", classEnrollments: { some: { status: "ENROLLED" } } },
    }),
    prisma.student.count({
      where: {
        academyId,
        tutorStudentSessions: { some: { revokedAt: null, expiresAt: { gt: now } } },
      },
    }),
  ]);

  return {
    totalStudents,
    activeStudents,
    unassignedCount: unassignedActive,
    unpaidCount: unpaidStudents,
    pausedWaitingCount: pausedWaiting,
    onboarding: {
      hasStudents: totalStudents > 0,
      hasAssignment: assignedActive > 0,
      hasLoggedIn: loggedInStudents > 0,
      unassignedCount: unassignedActive,
    },
  };
}

/** Active (non-revoked, non-expired) login devices for a student, deduped by fingerprint. */
export async function getStudentRegisteredDevices(
  studentId: string
): Promise<StudentDeviceItem[]> {
  const staff = await requireAuth();
  const now = new Date();

  const sessions = await prisma.tutorStudentSession.findMany({
    where: { studentId, academyId: staff.academyId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      deviceFingerprint: true,
      userAgent: true,
      ip: true,
      issuedAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });

  const seen = new Set<string>();
  const devices: StudentDeviceItem[] = [];
  for (const s of sessions) {
    if (seen.has(s.deviceFingerprint)) continue;
    seen.add(s.deviceFingerprint);
    devices.push(s);
  }
  return devices;
}
