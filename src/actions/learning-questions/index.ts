// ---------------------------------------------------------------------------
// Barrel entry for @/actions/learning-questions. Splits the original
// monolithic action file into logical modules under ./learning-questions/*
// while preserving the public import surface exactly. Each sub-module
// retains its own "use server" directive so every exported function remains
// a server action. This barrel is NOT "use server" because Next.js 16's
// build validator rejects named re-exports from directive files.
// ---------------------------------------------------------------------------

export type { LearningQuestionFilters } from "./_helpers";

export {
  saveNaeshinQuestions,
  saveSuneungQuestions,
} from "./save";

export {
  createSuneungPassage,
  getSuneungPassages,
} from "./passages";

export {
  getLearningQuestionStats,
  getLearningSets,
  getNaeshinQuestions,
  getSetCategoryStats,
} from "./queries";

export {
  approveNaeshinQuestion,
  deleteNaeshinQuestion,
  bulkApproveNaeshinQuestions,
  approveCategoryQuestions,
  bulkDeleteNaeshinQuestions,
} from "./mutations";
