// Barrel entry for @/actions/student-app. Each sub-module retains its own
// "use server" directive so every exported function remains a server action.
// This barrel itself is NOT "use server" because Next.js 16's build validator
// rejects named re-exports from directive files (cannot statically confirm
// async-ness of re-exported identifiers).

export { getStudentDashboard } from "./student-app/get-dashboard";
export { getStudentInbadi } from "./student-app/get-inbadi";
export { getStudentBadges, checkAndAwardBadges, addXP } from "./student-app/badges";
export { getStudentHeatmap } from "./student-app/heatmap";
export {
  getStudentAttendance,
  getStudentAttendanceHistory,
  studentCheckIn,
} from "./student-app/attendance";
export {
  getVocabListsForStudent,
  getVocabListForTest,
  getWrongVocabWords,
  getWrongQuestions,
} from "./student-app/vocab";
export { getStudentProgress } from "./student-app/progress";
export { getStudentNotices, markNoticeAsRead } from "./student-app/notices";
export { getStudentAssignmentList, getStudentEnrollments } from "./student-app/enrollments";
