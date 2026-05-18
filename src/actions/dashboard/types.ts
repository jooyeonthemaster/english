// ============================================================================
// Dashboard action types — shared across director / teacher modules.
// ============================================================================

export interface KPIData {
  totalStudents: number;
  studentDelta: number;
  monthlyRevenue: number;
  collectionRate: number;
  attendanceRate: number;
  presentCount: number;
  totalAttendanceCount: number;
  newRegistrations: number;
  newRegDelta: number;
}

export interface StudentTrendPoint {
  month: string;
  count: number;
}

export interface PaymentSummaryItem {
  status: string;
  label: string;
  amount: number;
  count: number;
  color: string;
}

export interface TodayClassItem {
  id: string;
  name: string;
  time: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  studentCount: number;
  room: string | null;
  status: "in-progress" | "upcoming" | "completed";
}

export interface OverdueInvoiceItem {
  id: string;
  studentName: string;
  amount: number;
  daysOverdue: number;
  title: string;
}

export interface ConsultationItem {
  id: string;
  studentName: string | null;
  type: string;
  typeLabel: string;
  date: string;
  status: string;
  staffName: string | null;
}

// Teacher-specific types
export interface TeacherKPIData {
  myClassesToday: number;
  ungradedExams: number;
  missingAssignments: number;
  myStudents: number;
}

export interface TeacherClassItem {
  id: string;
  name: string;
  time: string;
  startTime: string;
  endTime: string;
  room: string | null;
  studentCount: number;
  attendedCount: number;
  status: "in-progress" | "upcoming" | "completed";
}

export interface RecentExamResult {
  id: string;
  examTitle: string;
  className: string | null;
  avgScore: number | null;
  submissionCount: number;
  totalStudents: number;
  date: string;
}

export interface PendingAssignmentItem {
  id: string;
  title: string;
  className: string | null;
  dueDate: string;
  submittedCount: number;
  totalStudents: number;
}
