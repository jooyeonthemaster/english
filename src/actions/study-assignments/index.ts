// 통합 학습 과제 액션 배럴 — 외부는 이 경로 하나로 액션+타입을 임포트한다.
export {
  createStudyAssignment,
  updateStudyAssignment,
  closeStudyAssignment,
  reopenStudyAssignment,
  deleteStudyAssignment,
  type CreateStudyAssignmentInput,
  type CreateStudyAssignmentData,
} from "./mutations";
export {
  getAssignTargets,
  listStudyAssignments,
  getStudyAssignmentDetail,
  listStudentStudyTasks,
  type AssignTargetsData,
  type ListStudyAssignmentsInput,
} from "./queries";
export {
  listAssignableExams,
  listAssignableWorksheets,
  listAssignableQuestions,
  type AssignableFolder,
  type AssignableExamRow,
  type AssignableExamPickerData,
  type AssignableWorksheetRow,
  type AssignableWorksheetPickerData,
  type AssignableQuestionRow,
  type AssignableQuestionPickerData,
} from "./pickers";
export {
  getAssignmentQuestionStats,
  type AssignmentQuestionStatRow,
  type AssignmentQuestionStatsData,
} from "./stats";
export {
  getExamAssignPreview,
  getQuestionsAssignPreview,
  getWorksheetAssignPreview,
  type AssignPreviewQuestion,
  type ExamAssignPreview,
  type WorksheetAssignPreview,
} from "./preview";
export type { StudyActionResult } from "./_shared";
