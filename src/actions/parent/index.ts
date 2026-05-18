// Barrel entry for @/actions/parent. Each sub-module retains its own
// "use server" directive so every exported function remains a server action.
// This barrel itself is NOT "use server" because Next.js 16's build validator
// rejects named re-exports from directive files (cannot statically confirm
// async-ness of re-exported identifiers).

export type {
  ChildSummary,
  ParentDashboardData,
  ChildDashboard,
  ChildGradesData,
  ChildBillingData,
  ParentNotice,
  MessageConversation,
  MessageItem,
  ParentReportSummary,
  ParentReportDetail,
} from "./types";

export { getParentDashboard } from "./dashboard";
export { getChildGrades } from "./grades";
export { getChildAttendance } from "./attendance";
export { getChildBillingInfo } from "./billing";
export { getParentNotices, markNoticeAsRead } from "./notices";
export {
  getParentMessages,
  getConversation,
  sendParentMessage,
} from "./messages";
export { getParentReports, getParentReport } from "./reports";
