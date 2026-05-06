// ---------------------------------------------------------------------------
// Barrel entry for @/actions/workbench. Splits the original monolithic action
// file into logical modules under ./workbench/* while preserving the public
// import surface exactly. Each sub-module retains its own "use server"
// directive so every exported function remains a server action. This barrel
// is NOT "use server" because Next.js 16's build validator rejects named
// re-exports from directive files.
// ---------------------------------------------------------------------------

export type {
  WorkbenchPassageFilters,
  WorkbenchQuestionFilters,
  PassageAnnotationType,
  PassageAnnotationInput,
} from "./workbench/_types";

export {
  getWorkbenchPassages,
  getWorkbenchPassage,
  createWorkbenchPassage,
  updateWorkbenchPassage,
  deleteWorkbenchPassage,
  bulkUpdatePassageTags,
} from "./workbench/passages";

export {
  getSourceMaterialSummary,
  getPassageCollectionSummary,
  getAcademyPassageCollectionMembership,
  getPassageQuestionIds,
  getDraftExamsForPicker,
} from "./workbench/passage-lookups";

export {
  getPassageAnnotations,
  savePassageAnnotations,
  updatePassageAnalysis,
} from "./workbench/annotations";

export {
  getWorkbenchQuestions,
  getWorkbenchQuestion,
  saveGeneratedQuestions,
  updateWorkbenchQuestion,
  deleteWorkbenchQuestion,
  approveWorkbenchQuestion,
  toggleQuestionStar,
} from "./workbench/questions";

export {
  getPendingQuestionDrafts,
  updateQuestionDraft,
  skipQuestionDraft,
  promoteQuestionDraft,
} from "./workbench/question-drafts";

export type { QuestionDraftListItem } from "./workbench/question-drafts";

export {
  getWorkbenchStats,
  getAcademySchools,
} from "./workbench/stats";

export {
  getQuestionCollections,
  createQuestionCollection,
  updateQuestionCollection,
  deleteQuestionCollection,
  addQuestionsToCollection,
  removeQuestionsFromCollection,
} from "./workbench/collections-question";

export {
  getPassageCollections,
  createPassageCollection,
  updatePassageCollection,
  deletePassageCollection,
  addPassagesToCollection,
  removePassagesFromCollection,
  getPassageCollectionItems,
} from "./workbench/collections-passage";
