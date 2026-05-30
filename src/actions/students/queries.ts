"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "./_helpers";
import type { StudentFilters } from "./types";

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
  if (filters?.classId) {
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
