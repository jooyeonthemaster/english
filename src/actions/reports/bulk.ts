"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { generateWeeklyReport } from "./generate-weekly";
import { generateMonthlyReport } from "./generate-monthly";

export async function bulkGenerateReports(
  type: "WEEKLY" | "MONTHLY",
  classId?: string
) {
  const staff = await requireStaffAuth("DIRECTOR");

  let studentIds: string[];

  if (classId) {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId, status: "ENROLLED" },
      select: { studentId: true },
    });
    studentIds = enrollments.map((e) => e.studentId);
  } else {
    const students = await prisma.student.findMany({
      where: { academyId: staff.academyId, status: "ACTIVE" },
      select: { id: true },
    });
    studentIds = students.map((s) => s.id);
  }

  let totalGenerated = 0;

  // Process students in batches of 5 to avoid overwhelming the DB
  const BATCH_SIZE = 5;
  for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
    const batch = studentIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((studentId) =>
        type === "WEEKLY"
          ? generateWeeklyReport(studentId)
          : generateMonthlyReport(studentId)
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        totalGenerated += result.value.count;
      } else {
        console.error("Report generation failed:", result.reason);
      }
    }
  }

  revalidatePath("/director/reports");
  return { success: true, totalGenerated, studentCount: studentIds.length };
}

export async function bulkSendReports(reportIds: string[]) {
  await requireStaffAuth("DIRECTOR");

  await prisma.parentReport.updateMany({
    where: {
      id: { in: reportIds },
      status: "DRAFT",
    },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath("/director/reports");
  return { success: true };
}
