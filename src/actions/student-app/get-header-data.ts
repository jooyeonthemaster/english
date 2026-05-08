"use server";

import { prisma } from "@/lib/prisma";
import { requireStudent } from "./_helpers";

export async function getStudentHeaderData() {
  const session = await requireStudent();

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: {
      name: true,
      grade: true,
      academy: { select: { name: true } },
      school: { select: { name: true } },
    },
  });

  if (!student) {
    throw new Error("Student not found");
  }

  return {
    studentName: student.name,
    grade: student.grade,
    academyName: student.academy.name,
    schoolName: student.school?.name ?? null,
  };
}
