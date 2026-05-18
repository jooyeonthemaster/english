// Barrel file: admin server actions are organized into subdirectory modules.
// Public exports are preserved so consumers can keep importing from
// "@/actions/admin".

export {
  getRegistrations,
  approveRegistration,
  rejectRegistration,
} from "./registrations";

export { getAcademyList, getAcademyDetail } from "./academies";

export { adjustCredits, getCreditTransactionsAll } from "./credits";

export { getSystemStats } from "./stats";

export {
  getAcademyPassages,
  getAcademyPassageDetail,
  getAcademyQuestions,
  getAcademyExams,
} from "./content";

export { getPlans, updatePlan } from "./plans";
