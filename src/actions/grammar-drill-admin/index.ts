// 어법 드릴 강사 액션 배럴 — 외부는 이 경로 하나로 액션+타입을 임포트한다.
// (구 단일 파일 grammar-drill-admin.ts 의 후계 — 임포트 경로 무회귀)
export {
  listGrammarLabStudents,
  getGrammarLabStudentDetail,
  type GrammarLabStudentRow,
  type GrammarLabStudentDetail,
} from "./students";
export {
  createGrammarAssignment,
  cancelGrammarAssignment,
} from "./assignments";
export {
  getGrammarItemTeacherView,
  countGrammarDrillPool,
  type GrammarItemTeacherView,
  type GrammarPoolCount,
} from "./item-view";
