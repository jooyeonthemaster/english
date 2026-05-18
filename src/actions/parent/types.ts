// ============================================================================
// Shared types for parent-app server actions
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
