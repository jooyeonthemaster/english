// Barrel entry for @/actions/reports. Each sub-module retains its own
// "use server" directive so every exported function remains a server action.
// This barrel itself is NOT "use server" because Next.js 16's build validator
// rejects named re-exports from directive files (cannot statically confirm
// async-ness of re-exported identifiers).

export type { ReportListItem, ReportFilters } from "./types";

export { generateWeeklyReport } from "./generate-weekly";
export { generateMonthlyReport } from "./generate-monthly";
export { bulkGenerateReports, bulkSendReports } from "./bulk";
export {
  sendReport,
  getReportsList,
  updateReportComment,
  deleteReport,
} from "./manage";
