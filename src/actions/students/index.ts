// Barrel entry for @/actions/students. Each sub-module retains its own
// "use server" directive so every exported function remains a server action.
// This barrel itself is NOT "use server" because Next.js 16's build validator
// rejects named re-exports from directive files (cannot statically confirm
// async-ness of re-exported identifiers).

export type { StudentFilters } from "./types";

export {
  getStudents,
  getStudent,
  getStudentsByTeacher,
} from "./queries";
export {
  createStudent,
  updateStudent,
  updateStudentStatus,
  assignStudentToClass,
  deleteStudent,
  bulkUpdateStudentStatus,
} from "./mutations";
export { getStudentStats } from "./stats";
export { getSchools, getClasses } from "./lookups";
