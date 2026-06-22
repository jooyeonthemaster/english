// ---------------------------------------------------------------------------
// 시험(Exam) 도메인의 server-action 진입점.
// 실제 구현은 ./exams/* 로 쪼개져 있고, 이 파일은 단순히 barrel re-export
// 만 담당한다. 외부 호출자가 사용하던 import 경로
//   import { createExam, ... } from "@/actions/exams"
// 는 변경 없이 그대로 동작한다.
//
// NOTE: 이 barrel 은 "use server" 를 갖지 않는다. Next.js 16 의 build
// validator 가 directive 파일의 named re-export 를 거부하기 때문이며, 각
// 서브모듈이 자체적으로 "use server" 를 유지한다.
// ---------------------------------------------------------------------------

export {
  getExams,
  getExam,
  getExamPreviewData,
  createExam,
  updateExam,
  deleteExam,
  bulkDeleteExams,
  publishExam,
  incrementExamPrintCount,
} from "./crud";

export {
  addQuestionsToExam,
  removeQuestionFromExam,
  reorderExamQuestions,
} from "./questions";

export {
  getExamSubmissions,
  gradeSubmission,
  getExamAnalytics,
} from "./submissions";

export {
  getQuestionBank,
  getClassesForFilter,
  getSchoolsForFilter,
} from "./lookups";

export {
  getExamCollections,
  getExamCollectionMembership,
  createExamCollection,
  updateExamCollection,
  deleteExamCollection,
  addExamsToCollection,
  removeExamsFromCollection,
} from "./collections";

export { createQuestion, deleteQuestion } from "./legacy";

export type {
  ActionResult,
  ExamCreateData,
  ExamFilters,
  ExamQuestionInput,
  GradeInput,
} from "./_types";
