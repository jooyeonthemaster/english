"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";
import type { ParentReportDetail, ParentReportSummary } from "./types";

export async function getParentReports(): Promise<ParentReportSummary[]> {
  const session = await requireParentAuth();

  const reports = await prisma.parentReport.findMany({
    where: {
      parentId: session.parentId,
      status: { in: ["SENT", "VIEWED"] },
    },
    include: {
      student: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return reports.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    studentName: r.student.name,
    studentId: r.studentId,
  }));
}

export async function getParentReport(
  reportId: string
): Promise<ParentReportDetail> {
  const session = await requireParentAuth();

  const report = await prisma.parentReport.findUnique({
    where: { id: reportId },
    include: {
      student: {
        include: {
          school: { select: { name: true } },
          academy: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });

  if (!report) throw new Error("리포트를 찾을 수 없습니다.");
  if (report.parentId !== session.parentId) {
    throw new Error("접근 권한이 없습니다.");
  }

  // Mark as viewed
  if (report.status === "SENT") {
    await prisma.parentReport.update({
      where: { id: reportId },
      data: { status: "VIEWED", viewedAt: new Date() },
    });
  }

  let reportData;
  try {
    reportData = JSON.parse(report.reportData);
  } catch {
    reportData = {
      period: "",
      attendance: { present: 0, absent: 0, late: 0, total: 0, rate: 0 },
      exams: [],
      scoreTrend: [],
      categoryScores: [],
      vocabSummary: { testsCompleted: 0, averageScore: 0, totalWords: 0 },
      strengths: [],
      weaknesses: [],
      teacherComment: null,
      recommendations: [],
    };
  }

  return {
    id: report.id,
    type: report.type,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    studentName: report.student.name,
    studentGrade: report.student.grade,
    schoolName: report.student.school?.name || null,
    academyName: report.student.academy.name,
    academyLogoUrl: report.student.academy.logoUrl || null,
    reportData,
  };
}
