// ---------------------------------------------------------------------------
// Barrel entry for @/actions/dashboard. Splits the original monolithic action
// file into logical modules under ./dashboard/* while preserving the public
// import surface exactly. Each sub-module retains its own "use server"
// directive so every exported function remains a server action. This barrel
// is NOT "use server" because Next.js 16's build validator rejects named
// re-exports from directive files.
// ---------------------------------------------------------------------------

export type {
  KPIData,
  StudentTrendPoint,
  PaymentSummaryItem,
  TodayClassItem,
  OverdueInvoiceItem,
  ConsultationItem,
  TeacherKPIData,
  TeacherClassItem,
  RecentExamResult,
  PendingAssignmentItem,
} from "./types";

export {
  getDashboardKPIs,
  getStudentTrend,
  getPaymentSummary,
  getTodayClasses,
  getOverdueInvoices,
  getRecentConsultations,
} from "./director";

export {
  getTeacherKPIs,
  getTeacherTodayClasses,
  getTeacherRecentExams,
  getTeacherPendingAssignments,
} from "./teacher";
