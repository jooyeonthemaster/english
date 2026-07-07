// ---------------------------------------------------------------------------
// 학생 시험 리포트 — 서버액션 barrel.
//   import { createExamAnalysis, ... } from "@/actions/exam-report"
//
// NOTE: 이 barrel 은 "use server" 를 갖지 않는다(Next 16 build validator 가
// directive 파일의 named re-export 를 거부). 각 서브모듈이 자체 "use server"
// 를 유지하고, 공용 타입은 directive 없는 ./_helpers 에서 re-export 한다.
// ---------------------------------------------------------------------------

export {
  createExamAnalysis,
  attachExamSources,
  updateExamMeta,
  updateExamMap,
  confirmExamMap,
  updateAnalysisEdits,
  deleteExamAnalysis,
} from "./crud";

export {
  addExamStudents,
  setStudentSources,
  updateStudentGrading,
  deleteExamStudent,
  updateStudentReportDoc,
  rollbackStudentReport,
} from "./students";

export { enableExamReportShare, disableExamReportShare } from "./share";

export { enableAnswerLink, disableAnswerLink } from "./answer-link";

// 주의: ./_helpers 의 런타임 export(assert*, requireAuth 등)를 여기서 재노출하지
// 말 것 — _helpers 는 prisma 를 import 하는 서버 전용 모듈이라, directive 없는 이
// barrel 을 클라이언트 컴포넌트가 import 하는 순간 prisma 가 브라우저 번들에
// 유입돼 전 화면이 크래시한다(E2E 실증). 타입 재노출(type-only)은 안전.
export type {
  CasResult,
  AttachExamSourcesInput,
  CreateExamAnalysisInput,
  ExamSourcePage,
  UpdateExamMetaInput,
  UpdateStudentGradingInput,
} from "./_helpers";
