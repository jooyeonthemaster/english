"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ReportFilters, ReportListItem } from "./types";

export async function sendReport(reportId: string) {
  await requireStaffAuth();

  await prisma.parentReport.update({
    where: { id: reportId },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath("/director/reports");
  return { success: true };
}

export async function getReportsList(
  filters: ReportFilters = {}
): Promise<ReportListItem[]> {
  const staff = await requireStaffAuth();

  const where: Record<string, unknown> = {
    student: { academyId: staff.academyId },
  };

  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.search) {
    where.student = {
      ...((where.student as object) || {}),
      name: { contains: filters.search, mode: "insensitive" },
    };
  }

  const reports = await prisma.parentReport.findMany({
    where,
    include: {
      student: { select: { name: true } },
      parent: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return reports.map((r) => ({
    id: r.id,
    studentName: r.student.name,
    studentId: r.studentId,
    parentName: r.parent?.name || null,
    type: r.type,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() || null,
    viewedAt: r.viewedAt?.toISOString() || null,
  }));
}

export async function updateReportComment(
  reportId: string,
  comment: string
) {
  await requireStaffAuth();

  const report = await prisma.parentReport.findUnique({
    where: { id: reportId },
  });
  if (!report) throw new Error("리포트를 찾을 수 없습니다.");

  let reportData;
  try {
    reportData = JSON.parse(report.reportData);
  } catch {
    throw new Error("리포트 데이터를 파싱할 수 없습니다.");
  }

  reportData.teacherComment = comment;

  await prisma.parentReport.update({
    where: { id: reportId },
    data: { reportData: JSON.stringify(reportData) },
  });

  revalidatePath("/director/reports");
  return { success: true };
}

export async function deleteReport(reportId: string) {
  await requireStaffAuth("DIRECTOR");

  await prisma.parentReport.delete({
    where: { id: reportId },
  });

  revalidatePath("/director/reports");
  return { success: true };
}
