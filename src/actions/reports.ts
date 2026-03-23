"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ============================================================================
// Types
// ============================================================================

export interface ReportListItem {
  id: string;
  studentName: string;
  studentId: string;
  parentName: string | null;
  type: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
}

export interface ReportFilters {
  type?: string;
  status?: string;
  search?: string;
}

// ============================================================================
// 1. generateWeeklyReport
// ============================================================================

export async function generateWeeklyReport(studentId: string) {
  const staff = await requireStaffAuth();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: { select: { name: true } },
      parentLinks: { include: { parent: true } },
      academy: { select: { name: true, logoUrl: true } },
    },
  });

  if (!student) throw new Error("학생을 찾을 수 없습니다.");

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // All 5 data-gathering queries are independent — run in parallel
  const [attendances, examSubs, allExamSubs, analytics, vocabResults] =
    await Promise.all([
      // Attendance this week
      prisma.attendance.findMany({
        where: { studentId, date: { gte: weekAgo, lte: now } },
      }),
      // Exams graded this week
      prisma.examSubmission.findMany({
        where: {
          studentId,
          status: "GRADED",
          gradedAt: { gte: weekAgo },
        },
        include: { exam: { select: { title: true, examDate: true } } },
      }),
      // Score trend (last 6 exams)
      prisma.examSubmission.findMany({
        where: { studentId, status: "GRADED" },
        include: { exam: { select: { title: true } } },
        orderBy: { gradedAt: "desc" },
        take: 6,
      }),
      // Category scores from analytics
      prisma.studentAnalytics.findUnique({
        where: { studentId },
      }),
      // Vocab summary this week
      prisma.vocabTestResult.findMany({
        where: { studentId, takenAt: { gte: weekAgo } },
      }),
    ]);

  const present = attendances.filter((a) => a.status === "PRESENT").length;
  const late = attendances.filter((a) => a.status === "LATE").length;
  const absent = attendances.filter((a) => a.status === "ABSENT").length;
  const attendanceRate =
    attendances.length > 0
      ? Math.round(((present + late) / attendances.length) * 100)
      : 0;

  const exams = examSubs.map((s) => ({
    title: s.exam.title,
    date: (s.exam.examDate || s.gradedAt)?.toISOString() || "",
    score: s.score || 0,
    maxScore: s.maxScore || 100,
    percent: Math.round(s.percent || 0),
  }));

  const scoreTrend = allExamSubs
    .reverse()
    .map((s) => ({
      label:
        s.exam.title.length > 6 ? s.exam.title.slice(0, 6) : s.exam.title,
      score: Math.round(s.percent || 0),
    }));

  const categoryScores = analytics
    ? [
        { category: "문법", score: Math.round(analytics.grammarScore) },
        { category: "어휘", score: Math.round(analytics.vocabScore) },
        { category: "독해", score: Math.round(analytics.readingScore) },
        { category: "작문", score: Math.round(analytics.writingScore) },
      ]
    : [];
  const vocabAvg =
    vocabResults.length > 0
      ? Math.round(
          vocabResults.reduce((sum, v) => sum + v.percent, 0) /
            vocabResults.length
        )
      : 0;

  // Weak points from analytics
  let weaknesses: string[] = [];
  let strengths: string[] = [];

  if (analytics?.weakPoints) {
    try {
      weaknesses = JSON.parse(analytics.weakPoints);
    } catch {
      // ignore
    }
  }

  // Derive strengths from high category scores
  if (categoryScores.length > 0) {
    strengths = categoryScores
      .filter((c) => c.score >= 70)
      .map((c) => `${c.category} 영역 우수`);
    if (weaknesses.length === 0) {
      weaknesses = categoryScores
        .filter((c) => c.score < 60)
        .map((c) => `${c.category} 영역 보완 필요`);
    }
  }

  // Recommendations
  const recommendations: string[] = [];
  if (attendanceRate < 80) {
    recommendations.push("출석률 향상이 필요합니다. 정시 등원을 권장합니다.");
  }
  if (vocabAvg < 70) {
    recommendations.push("단어 학습 복습을 통해 어휘력 강화가 필요합니다.");
  }
  if (weaknesses.length > 0) {
    recommendations.push(
      `${weaknesses[0]}에 대한 추가 학습을 추천합니다.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push("전반적으로 양호합니다. 현재 학습 페이스를 유지하세요.");
  }

  const reportData = {
    period: `${weekAgo.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`,
    attendance: {
      present,
      absent,
      late,
      total: attendances.length,
      rate: attendanceRate,
    },
    exams,
    scoreTrend,
    categoryScores,
    vocabSummary: {
      testsCompleted: vocabResults.length,
      averageScore: vocabAvg,
      totalWords: vocabResults.reduce((sum, v) => sum + v.total, 0),
    },
    strengths,
    weaknesses,
    teacherComment: null,
    recommendations,
  };

  // Create reports for all linked parents in parallel
  const parentLinks = student.parentLinks;
  let reports;

  if (parentLinks.length > 0) {
    reports = await Promise.all(
      parentLinks.map((link) =>
        prisma.parentReport.create({
          data: {
            studentId,
            parentId: link.parentId,
            type: "WEEKLY",
            reportData: JSON.stringify(reportData),
            status: "DRAFT",
          },
        })
      )
    );
  } else {
    // If no parent links, still create report without parent
    const report = await prisma.parentReport.create({
      data: {
        studentId,
        type: "WEEKLY",
        reportData: JSON.stringify(reportData),
        status: "DRAFT",
      },
    });
    reports = [report];
  }

  revalidatePath("/director/reports");
  return { success: true, count: reports.length };
}

// ============================================================================
// 2. generateMonthlyReport
// ============================================================================

export async function generateMonthlyReport(studentId: string) {
  const staff = await requireStaffAuth();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      parentLinks: { include: { parent: true } },
    },
  });

  if (!student) throw new Error("학생을 찾을 수 없습니다.");

  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  // All 5 data-gathering queries are independent — run in parallel
  const [attendances, examSubs, allExamSubs, analytics, vocabResults] =
    await Promise.all([
      // Attendance this month
      prisma.attendance.findMany({
        where: { studentId, date: { gte: monthAgo, lte: now } },
      }),
      // Exams graded this month
      prisma.examSubmission.findMany({
        where: {
          studentId,
          status: "GRADED",
          gradedAt: { gte: monthAgo },
        },
        include: { exam: { select: { title: true, examDate: true } } },
      }),
      // Score trend (last 6 exams)
      prisma.examSubmission.findMany({
        where: { studentId, status: "GRADED" },
        include: { exam: { select: { title: true } } },
        orderBy: { gradedAt: "desc" },
        take: 6,
      }),
      // Category scores from analytics
      prisma.studentAnalytics.findUnique({
        where: { studentId },
      }),
      // Vocab results this month
      prisma.vocabTestResult.findMany({
        where: { studentId, takenAt: { gte: monthAgo } },
      }),
    ]);

  const present = attendances.filter((a) => a.status === "PRESENT").length;
  const late = attendances.filter((a) => a.status === "LATE").length;
  const absent = attendances.filter((a) => a.status === "ABSENT").length;
  const attendanceRate =
    attendances.length > 0
      ? Math.round(((present + late) / attendances.length) * 100)
      : 0;

  const exams = examSubs.map((s) => ({
    title: s.exam.title,
    date: (s.exam.examDate || s.gradedAt)?.toISOString() || "",
    score: s.score || 0,
    maxScore: s.maxScore || 100,
    percent: Math.round(s.percent || 0),
  }));

  const scoreTrend = allExamSubs.reverse().map((s) => ({
    label: s.exam.title.length > 6 ? s.exam.title.slice(0, 6) : s.exam.title,
    score: Math.round(s.percent || 0),
  }));

  const categoryScores = analytics
    ? [
        { category: "문법", score: Math.round(analytics.grammarScore) },
        { category: "어휘", score: Math.round(analytics.vocabScore) },
        { category: "독해", score: Math.round(analytics.readingScore) },
        { category: "작문", score: Math.round(analytics.writingScore) },
      ]
    : [];
  const vocabAvg =
    vocabResults.length > 0
      ? Math.round(
          vocabResults.reduce((sum, v) => sum + v.percent, 0) /
            vocabResults.length
        )
      : 0;

  let weaknesses: string[] = [];
  let strengths: string[] = [];

  if (analytics?.weakPoints) {
    try {
      weaknesses = JSON.parse(analytics.weakPoints);
    } catch {
      /* ignore */
    }
  }
  if (categoryScores.length > 0) {
    strengths = categoryScores
      .filter((c) => c.score >= 70)
      .map((c) => `${c.category} 영역 우수`);
    if (weaknesses.length === 0) {
      weaknesses = categoryScores
        .filter((c) => c.score < 60)
        .map((c) => `${c.category} 영역 보완 필요`);
    }
  }

  const recommendations: string[] = [];
  if (attendanceRate < 80) {
    recommendations.push("출석률 향상이 필요합니다.");
  }
  if (vocabAvg < 70) {
    recommendations.push("단어 학습 복습을 통해 어휘력 강화가 필요합니다.");
  }
  if (weaknesses.length > 0) {
    recommendations.push(`${weaknesses[0]}에 대한 추가 학습을 추천합니다.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("전반적으로 양호합니다. 현재 학습 페이스를 유지하세요.");
  }

  const reportData = {
    period: `${monthAgo.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`,
    attendance: {
      present,
      absent,
      late,
      total: attendances.length,
      rate: attendanceRate,
    },
    exams,
    scoreTrend,
    categoryScores,
    vocabSummary: {
      testsCompleted: vocabResults.length,
      averageScore: vocabAvg,
      totalWords: vocabResults.reduce((sum, v) => sum + v.total, 0),
    },
    strengths,
    weaknesses,
    teacherComment: null,
    recommendations,
  };

  // Create reports for all linked parents in parallel
  const parentLinks = student.parentLinks;
  let reports;

  if (parentLinks.length > 0) {
    reports = await Promise.all(
      parentLinks.map((link) =>
        prisma.parentReport.create({
          data: {
            studentId,
            parentId: link.parentId,
            type: "MONTHLY",
            reportData: JSON.stringify(reportData),
            status: "DRAFT",
          },
        })
      )
    );
  } else {
    const report = await prisma.parentReport.create({
      data: {
        studentId,
        type: "MONTHLY",
        reportData: JSON.stringify(reportData),
        status: "DRAFT",
      },
    });
    reports = [report];
  }

  revalidatePath("/director/reports");
  return { success: true, count: reports.length };
}

// ============================================================================
// 3. sendReport
// ============================================================================

export async function sendReport(reportId: string) {
  await requireStaffAuth();

  await prisma.parentReport.update({
    where: { id: reportId },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath("/director/reports");
  return { success: true };
}

// ============================================================================
// 4. bulkGenerateReports
// ============================================================================

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

// ============================================================================
// 5. bulkSendReports
// ============================================================================

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

// ============================================================================
// 6. getReportsList (Admin)
// ============================================================================

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

// ============================================================================
// 7. updateReportComment
// ============================================================================

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

// ============================================================================
// 8. deleteReport
// ============================================================================

export async function deleteReport(reportId: string) {
  await requireStaffAuth("DIRECTOR");

  await prisma.parentReport.delete({
    where: { id: reportId },
  });

  revalidatePath("/director/reports");
  return { success: true };
}
