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
  createProviderBillingReconciliation,
  createProviderPricing,
  getOperationsCostDashboard,
  syncProviderBillingReconciliation,
  type CostBucket,
  type CostPeriodMode,
  type OperationsCostDashboard,
} from "./operations-cost";

export {
  getAcademyPassages,
  getAcademyPassageDetail,
  getAcademyQuestions,
  getAcademyExams,
} from "./content";

export { createPlan, deletePlan, getPlans, updatePlan } from "./plans";
export { updateCreditTopUpProduct } from "./credit-products";
