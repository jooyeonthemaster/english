"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";

// ============================================================================
// Types
// ============================================================================

export interface ChildSummary {
  id: string;
  name: string;
  grade: number;
  schoolName: string | null;
  status: string;
}

export interface ParentDashboardData {
  parentName: string;
  children: ChildSummary[];
  childDashboards: Record<string, ChildDashboard>;
}

export interface ChildDashboard {
  attendanceRate: number;
  attendancePresent: number;
  attendanceTotal: number;
  averageScore: number;
  assignmentRate: number;
  assignmentDone: number;
  assignmentTotal: number;
  nextExamDate: string | null;
  nextExamTitle: string | null;
  recentNotices: {
    id: string;
    title: string;
    publishAt: string;
    isRead: boolean;
  }[];
  weeklySummary: string;
}

export interface ChildGradesData {
  recentExams: {
    id: string;
    examTitle: string;
    examDate: string | null;
    score: number;
    maxScore: number;
    percent: number;
    rank: number | null;
    totalStudents: number | null;
  }[];
  scoreTrend: {
    label: string;
    score: number;
  }[];
  vocabTests: {
    id: string;
    listTitle: string;
    testType: string;
    score: number;
    total: number;
    percent: number;
    takenAt: string;
  }[];
  categoryScores: {
    category: string;
    score: number;
  }[];
  weakAreas: string[];
}

export interface ChildBillingData {
  activeInvoices: {
    id: string;
    title: string;
    finalAmount: number;
    dueDate: string;
    status: string;
  }[];
  pastPayments: {
    id: string;
    amount: number;
    method: string;
    paidAt: string;
    invoiceTitle: string;
    status: string;
  }[];
  hasOverdue: boolean;
}

export interface ParentNotice {
  id: string;
  title: string;
  content: string;
  publishAt: string;
  isRead: boolean;
}

export interface MessageConversation {
  staffId: string;
  staffName: string;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
}

export interface MessageItem {
  id: string;
  content: string;
  senderType: string;
  createdAt: string;
  isRead: boolean;
}

export interface ParentReportSummary {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  studentName: string;
  studentId: string;
}

export interface ParentReportDetail {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  studentName: string;
  studentGrade: number;
  schoolName: string | null;
  academyName: string;
  academyLogoUrl: string | null;
  reportData: {
    period: string;
    attendance: {
      present: number;
      absent: number;
      late: number;
      total: number;
      rate: number;
    };
    exams: {
      title: string;
      date: string;
      score: number;
      maxScore: number;
      percent: number;
    }[];
    scoreTrend: {
      label: string;
      score: number;
    }[];
    categoryScores: {
      category: string;
      score: number;
    }[];
    vocabSummary: {
      testsCompleted: number;
      averageScore: number;
      totalWords: number;
    };
    strengths: string[];
    weaknesses: string[];
    teacherComment: string | null;
    recommendations: string[];
  };
}

// ============================================================================
// 1. getParentDashboard
// ============================================================================

export async function getParentDashboard(): Promise<ParentDashboardData> {
  const session = await requireParentAuth();

  const parent = await prisma.parent.findUnique({
    where: { id: session.parentId },
    include: {
      studentLinks: {
        include: {
          student: {
            include: {
              school: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!parent) throw new Error("학부모 정보를 찾을 수 없습니다.");

  const children: ChildSummary[] = parent.studentLinks.map((link) => ({
    id: link.student.id,
    name: link.student.name,
    grade: link.student.grade,
    schoolName: link.student.school?.name || null,
    status: link.student.status,
  }));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Notices query is the same for all children — fetch once
  const notices = await prisma.notice.findMany({
    where: {
      academyId: session.academyId,
      targetType: { in: ["ALL", "PARENTS"] },
      publishAt: { lte: now },
    },
    orderBy: { publishAt: "desc" },
    take: 5,
    include: {
      reads: {
        where: { readerId: session.parentId, readerType: "PARENT" },
      },
    },
  });
  const recentNotices = notices.map((n) => ({
    id: n.id,
    title: n.title,
    publishAt: n.publishAt.toISOString(),
    isRead: n.reads.length > 0,
  }));

  // Process all children in parallel — each child's queries are independent
  const childEntries = await Promise.all(
    children.map(async (child) => {
      // Phase 1: attendance, exam scores, and class enrollments are independent
      const [attendances, examSubs, studentClasses] = await Promise.all([
        // Attendance this month
        prisma.attendance.findMany({
          where: {
            studentId: child.id,
            date: { gte: startOfMonth, lte: endOfMonth },
          },
        }),
        // Average exam score (recent)
        prisma.examSubmission.findMany({
          where: {
            studentId: child.id,
            status: "GRADED",
            percent: { not: null },
          },
          orderBy: { gradedAt: "desc" },
          take: 10,
          select: { percent: true },
        }),
        // Class enrollments (needed for assignments + next exam)
        prisma.classEnrollment.findMany({
          where: { studentId: child.id, status: "ENROLLED" },
          select: { classId: true },
        }),
      ]);

      const present = attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
      const attendanceRate =
        attendances.length > 0
          ? Math.round((present / attendances.length) * 100)
          : 0;

      const averageScore =
        examSubs.length > 0
          ? Math.round(
              examSubs.reduce((sum, s) => sum + (s.percent || 0), 0) /
                examSubs.length
            )
          : 0;

      const classIds = studentClasses.map((c) => c.classId);

      // Phase 2: assignments and next exam depend on classIds — run in parallel
      const [assignments, nextExam] = await Promise.all([
        prisma.assignmentSubmission.findMany({
          where: {
            studentId: child.id,
            assignment: {
              classId: { in: classIds.length > 0 ? classIds : ["__none__"] },
            },
          },
          select: { status: true },
        }),
        prisma.exam.findFirst({
          where: {
            classId: { in: classIds.length > 0 ? classIds : ["__none__"] },
            examDate: { gte: now },
            status: { in: ["PUBLISHED", "DRAFT"] },
          },
          orderBy: { examDate: "asc" },
          select: { examDate: true, title: true },
        }),
      ]);

      const assignmentDone = assignments.filter(
        (a) => a.status === "SUBMITTED" || a.status === "GRADED"
      ).length;
      const assignmentRate =
        assignments.length > 0
          ? Math.round((assignmentDone / assignments.length) * 100)
          : 0;

      const dashboard: ChildDashboard = {
        attendanceRate,
        attendancePresent: present,
        attendanceTotal: attendances.length,
        averageScore,
        assignmentRate,
        assignmentDone,
        assignmentTotal: assignments.length,
        nextExamDate: nextExam?.examDate?.toISOString() || null,
        nextExamTitle: nextExam?.title || null,
        recentNotices,
        weeklySummary: `이번 달 출석률 ${attendanceRate}%, 평균 점수 ${averageScore}점`,
      };

      return [child.id, dashboard] as const;
    })
  );

  const childDashboards: Record<string, ChildDashboard> = {};
  for (const [childId, dashboard] of childEntries) {
    childDashboards[childId] = dashboard;
  }

  return {
    parentName: parent.name,
    children,
    childDashboards,
  };
}

// ============================================================================
// 2. getChildGrades
// ============================================================================

export async function getChildGrades(
  studentId: string
): Promise<ChildGradesData> {
  const session = await requireParentAuth();
  if (!session.studentIds.includes(studentId)) {
    throw new Error("접근 권한이 없습니다.");
  }

  // All 3 queries are independent — run in parallel
  const [examSubs, vocabResults, analytics] = await Promise.all([
    // Recent exam submissions
    prisma.examSubmission.findMany({
      where: { studentId, status: "GRADED" },
      include: {
        exam: {
          select: {
            title: true,
            examDate: true,
            classId: true,
            submissions: {
              where: { status: "GRADED" },
              select: { percent: true },
            },
          },
        },
      },
      orderBy: { gradedAt: "desc" },
      take: 20,
    }),
    // Vocab test results
    prisma.vocabTestResult.findMany({
      where: { studentId },
      include: { list: { select: { title: true } } },
      orderBy: { takenAt: "desc" },
      take: 20,
    }),
    // Category scores from analytics
    prisma.studentAnalytics.findUnique({
      where: { studentId },
    }),
  ]);

  const recentExams = examSubs.map((sub) => {
    const allScores = sub.exam.submissions
      .map((s) => s.percent || 0)
      .sort((a, b) => b - a);
    const myRank = allScores.indexOf(sub.percent || 0) + 1;

    return {
      id: sub.id,
      examTitle: sub.exam.title,
      examDate: sub.exam.examDate?.toISOString() || null,
      score: sub.score || 0,
      maxScore: sub.maxScore || 100,
      percent: Math.round(sub.percent || 0),
      rank: allScores.length > 1 ? myRank : null,
      totalStudents: allScores.length > 1 ? allScores.length : null,
    };
  });

  // Score trend (last 6 exams, chronological order)
  const trendExams = [...examSubs].reverse().slice(-6);
  const scoreTrend = trendExams.map((sub, i) => ({
    label: sub.exam.title.length > 8 ? sub.exam.title.slice(0, 8) : sub.exam.title,
    score: Math.round(sub.percent || 0),
  }));

  const vocabTests = vocabResults.map((v) => ({
    id: v.id,
    listTitle: v.list.title,
    testType: v.testType,
    score: v.score,
    total: v.total,
    percent: Math.round(v.percent),
    takenAt: v.takenAt.toISOString(),
  }));

  const categoryScores = analytics
    ? [
        { category: "문법", score: Math.round(analytics.grammarScore) },
        { category: "어휘", score: Math.round(analytics.vocabScore) },
        { category: "독해", score: Math.round(analytics.readingScore) },
        { category: "작문", score: Math.round(analytics.writingScore) },
      ]
    : [
        { category: "문법", score: 0 },
        { category: "어휘", score: 0 },
        { category: "독해", score: 0 },
        { category: "작문", score: 0 },
      ];

  // Weak areas
  const weakAreas: string[] = [];
  if (analytics?.weakPoints) {
    try {
      const parsed = JSON.parse(analytics.weakPoints);
      if (Array.isArray(parsed)) {
        weakAreas.push(...parsed.slice(0, 3));
      }
    } catch {
      // ignore parse errors
    }
  }
  if (weakAreas.length === 0) {
    // Derive from category scores
    const sorted = [...categoryScores].sort((a, b) => a.score - b.score);
    weakAreas.push(
      ...sorted.slice(0, 2).map((c) => `${c.category} 영역 보완 필요`)
    );
  }

  return {
    recentExams,
    scoreTrend,
    vocabTests,
    categoryScores,
    weakAreas,
  };
}

// ============================================================================
// 3. getChildAttendance
// ============================================================================

export async function getChildAttendance(studentId: string) {
  const session = await requireParentAuth();
  if (!session.studentIds.includes(studentId)) {
    throw new Error("접근 권한이 없습니다.");
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const attendances = await prisma.attendance.findMany({
    where: {
      studentId,
      date: { gte: startOfMonth },
    },
    orderBy: { date: "desc" },
  });

  const present = attendances.filter((a) => a.status === "PRESENT").length;
  const late = attendances.filter((a) => a.status === "LATE").length;
  const absent = attendances.filter((a) => a.status === "ABSENT").length;
  const total = attendances.length;
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  return {
    present,
    late,
    absent,
    total,
    rate,
    records: attendances.map((a) => ({
      date: a.date.toISOString(),
      status: a.status,
      checkInTime: a.checkInTime?.toISOString() || null,
      checkOutTime: a.checkOutTime?.toISOString() || null,
      note: a.note,
    })),
  };
}

// ============================================================================
// 4. getChildBillingInfo
// ============================================================================

export async function getChildBillingInfo(
  studentId: string
): Promise<ChildBillingData> {
  const session = await requireParentAuth();
  if (!session.studentIds.includes(studentId)) {
    throw new Error("접근 권한이 없습니다.");
  }

  // Both invoice queries are independent — run in parallel
  const [activeInvoices, paidInvoices] = await Promise.all([
    // Active invoices (PENDING or OVERDUE)
    prisma.invoice.findMany({
      where: {
        studentId,
        status: { in: ["PENDING", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
    }),
    // Past payments
    prisma.invoice.findMany({
      where: {
        studentId,
        status: { in: ["PAID", "REFUNDED"] },
      },
      include: {
        payments: {
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: { paidDate: "desc" },
      take: 20,
    }),
  ]);

  const pastPayments = paidInvoices.flatMap((inv) =>
    inv.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      paidAt: p.paidAt.toISOString(),
      invoiceTitle: inv.title,
      status: inv.status,
    }))
  );

  const hasOverdue = activeInvoices.some((inv) => inv.status === "OVERDUE");

  return {
    activeInvoices: activeInvoices.map((inv) => ({
      id: inv.id,
      title: inv.title,
      finalAmount: inv.finalAmount,
      dueDate: inv.dueDate.toISOString(),
      status: inv.status,
    })),
    pastPayments,
    hasOverdue,
  };
}

// ============================================================================
// 5. getParentNotices
// ============================================================================

export async function getParentNotices(): Promise<ParentNotice[]> {
  const session = await requireParentAuth();

  const now = new Date();
  const notices = await prisma.notice.findMany({
    where: {
      academyId: session.academyId,
      targetType: { in: ["ALL", "PARENTS"] },
      publishAt: { lte: now },
    },
    include: {
      reads: {
        where: { readerId: session.parentId, readerType: "PARENT" },
      },
    },
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }],
    take: 50,
  });

  return notices.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    publishAt: n.publishAt.toISOString(),
    isRead: n.reads.length > 0,
  }));
}

// ============================================================================
// 6. markNoticeAsRead
// ============================================================================

export async function markNoticeAsRead(noticeId: string) {
  const session = await requireParentAuth();

  await prisma.noticeRead.upsert({
    where: {
      noticeId_readerId_readerType: {
        noticeId,
        readerId: session.parentId,
        readerType: "PARENT",
      },
    },
    update: {},
    create: {
      noticeId,
      readerId: session.parentId,
      readerType: "PARENT",
    },
  });
}

// ============================================================================
// 7. getParentMessages
// ============================================================================

export async function getParentMessages(): Promise<MessageConversation[]> {
  const session = await requireParentAuth();

  // Get all messages where parent is sender or receiver
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: session.parentId, senderType: "PARENT" },
        { receiverId: session.parentId, receiverType: "PARENT" },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by staff partner
  const conversationMap = new Map<
    string,
    { messages: typeof messages; staffId: string }
  >();

  for (const msg of messages) {
    const staffId =
      msg.senderType === "STAFF" ? msg.senderId : msg.receiverId;
    if (!conversationMap.has(staffId)) {
      conversationMap.set(staffId, { messages: [], staffId });
    }
    conversationMap.get(staffId)!.messages.push(msg);
  }

  // Fetch staff names
  const staffIds = [...conversationMap.keys()];
  const staffMembers = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true },
  });
  const staffNameMap = new Map(staffMembers.map((s) => [s.id, s.name]));

  const conversations: MessageConversation[] = [];

  for (const [staffId, data] of conversationMap) {
    const sorted = data.messages.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const unread = sorted.filter(
      (m) =>
        m.receiverId === session.parentId &&
        m.receiverType === "PARENT" &&
        !m.isRead
    ).length;

    conversations.push({
      staffId,
      staffName: staffNameMap.get(staffId) || "강사",
      lastMessage:
        sorted[0]?.content.slice(0, 50) +
        (sorted[0]?.content.length > 50 ? "..." : ""),
      lastAt: sorted[0]?.createdAt.toISOString() || "",
      unreadCount: unread,
    });
  }

  conversations.sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  );

  return conversations;
}

// ============================================================================
// 8. getConversation
// ============================================================================

export async function getConversation(
  staffId: string
): Promise<MessageItem[]> {
  const session = await requireParentAuth();

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        {
          senderId: session.parentId,
          senderType: "PARENT",
          receiverId: staffId,
          receiverType: "STAFF",
        },
        {
          senderId: staffId,
          senderType: "STAFF",
          receiverId: session.parentId,
          receiverType: "PARENT",
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Mark received messages as read
  await prisma.message.updateMany({
    where: {
      senderId: staffId,
      senderType: "STAFF",
      receiverId: session.parentId,
      receiverType: "PARENT",
      isRead: false,
    },
    data: { isRead: true },
  });

  return messages.map((m) => ({
    id: m.id,
    content: m.content,
    senderType: m.senderType,
    createdAt: m.createdAt.toISOString(),
    isRead: m.isRead,
  }));
}

// ============================================================================
// 9. sendParentMessage
// ============================================================================

export async function sendParentMessage(staffId: string, content: string) {
  const session = await requireParentAuth();

  if (!content.trim()) throw new Error("메시지를 입력해주세요.");

  const message = await prisma.message.create({
    data: {
      senderId: session.parentId,
      senderType: "PARENT",
      receiverId: staffId,
      receiverType: "STAFF",
      content: content.trim(),
    },
  });

  return { id: message.id };
}

// ============================================================================
// 10. getParentReports
// ============================================================================

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

// ============================================================================
// 11. getParentReport (detail)
// ============================================================================

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
