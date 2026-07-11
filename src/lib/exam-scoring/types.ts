// ============================================================================
// 통합 시험 채점 엔진 — 타입 계약 (26-07-09 시험지 배포·OMR 대개편)
//
// 자체 생성 시험지(Exam→ExamQuestion→Question)의 학생 응답을 AI 0콜 결정론으로
// 채점하기 위한 정본 계약. 전 영어 26유형의 정답 입력 변수(선지 개수 가변 5~12,
// 복수 정답, 서답형 다중 필드, EXACT/LEMMA/VARIANTS 텍스트 규칙)를 수용한다.
//
// 불변식(설계문서 §6):
//  - 미입력(input null) = UNKNOWN. "미입력=정답" 승격 절대 금지.
//  - 기계 채점이 불확실하면 NEEDS_REVIEW 로 강등(오채점보다 수동 검토가 낫다).
//  - 채점은 항상 서버에서. 이 모듈은 순수(부수효과·DB·시간 의존 금지).
// ============================================================================

/** 학생 응답 입력 형태 — OMR/태블릿 UI 와 채점기가 공유하는 축 */
export type AnswerInputKind =
  | "SINGLE_CHOICE" // 선지 1개 선택 (optionCount 5~12 가변)
  | "MULTI_CHOICE" // 복수 선택 (selectCount 개 — 전부 일치해야 정답)
  | "TEXT_SINGLE" // 텍스트 입력 필드 1개
  | "TEXT_MULTI" // 텍스트 입력 필드 N개 (fields[] 정의, 부분점수)
  | "MANUAL_ONLY"; // 기계채점 불가(자유영작 등) — 제출만 받고 NEEDS_REVIEW

/** 텍스트 채점 모드 */
export type TextGradeMode = "EXACT" | "LEMMA" | "VARIANTS";

/** TEXT_* 입력 필드 1개의 정답 정의 */
export interface AnswerFieldSpec {
  /** 안정 키 — SubmissionResponse.input.texts 의 키 ("A", "seg-1" 등) */
  key: string;
  /** 표시 라벨 — "(A)", "①" 등 */
  label: string;
  /** 허용 정답(모범답 + acceptableVariants 전개). 비교는 normalizeText 후 */
  answers: string[];
  /** LEMMA 모드에서 학생 답에 전부 포함돼야 하는 표제어(소문자) */
  lemmas?: string[];
}

/**
 * 문항 1개의 채점 명세 — buildAnswerSpec(question) 산출물.
 * OMR 칸 수·입력 위젯·채점 규칙이 전부 이 명세에서 파생된다.
 */
export interface AnswerSpec {
  questionId: string;
  subType: string;
  inputKind: AnswerInputKind;
  /** SINGLE/MULTI: 선지(마커) 수 — 5 고정 가정 금지(어법 5~10, 내용일치 5~12) */
  optionCount?: number;
  /** UI 표시용 선지 라벨 원문(["①",..] | ["(a)",..] | ["1",..]) — 순서 = 선지 순서 */
  optionLabels?: string[];
  /** 정규화 숫자 토큰 "1".."12" (SINGLE 이면 길이 1, MULTI 면 2+) */
  correctChoices?: string[];
  /** MULTI: 학생이 골라야 하는 개수(=correctChoices.length) — UI 카운터용 */
  selectCount?: number;
  /** TEXT_*: 텍스트 채점 모드 */
  textMode?: TextGradeMode;
  /** TEXT_*: 입력 필드 정의(1~5개) */
  fields?: AnswerFieldSpec[];
  /** 필드/선지 단위 부분점수 허용 — TEXT_MULTI 기본 true, MULTI_CHOICE 기본 false */
  partialCredit?: boolean;
  /** 문항 배점(ExamQuestion.points) */
  points: number;
  /** MANUAL_ONLY 사유("자유영작", "정답 데이터 없음" 등) — 강사 검토 UI 에 표기 */
  manualReason?: string;
}

/** 학생 응답 원본 — 응시 UI(태블릿/OMR)가 저장하는 형태 */
export interface StudentInput {
  /** SINGLE_CHOICE: 선지 토큰(라벨 원문 그대로 저장 — 채점 시 정규화) */
  choice?: string;
  /** MULTI_CHOICE: 선지 토큰 배열 */
  choices?: string[];
  /** TEXT_* / MANUAL_ONLY: fieldKey→학생 입력 원문. MANUAL_ONLY/TEXT_SINGLE 은 키 1개 */
  texts?: Record<string, string>;
}

/** 채점 판정 상태 — exam-report ResponseStatus 와의 매핑:
 *  CORRECT/WRONG/PARTIAL 동일, NEEDS_REVIEW→UNKNOWN(+studentAnswer 보존, reviewed:false) */
export type GradeStatus = "CORRECT" | "WRONG" | "PARTIAL" | "NEEDS_REVIEW";

export interface FieldGradeResult {
  key: string;
  correct: boolean;
  /** 이 필드가 기여한 점수(round2) */
  earned: number;
}

/** gradeAnswer 산출물 */
export interface GradeResult {
  status: GradeStatus;
  /** CORRECT=points, WRONG=0, PARTIAL=[0,points] 클램프, NEEDS_REVIEW=null */
  earnedPoints: number | null;
  /** TEXT_MULTI / partialCredit MULTI 의 필드별 상세 */
  fieldResults?: FieldGradeResult[];
}

/**
 * exam_submissions.responses[] 원소 — 저장 계약(DB jsonb).
 * input=null 은 미입력(UNKNOWN). manualStatus 는 강사의 NEEDS_REVIEW 수동확정.
 */
export interface SubmissionResponse {
  questionId: string;
  orderNum: number;
  input: StudentInput | null;
  result?: GradeResult;
  manualStatus?: "CORRECT" | "WRONG" | "PARTIAL";
  manualEarnedPoints?: number;
  /** 수동확정 staff.id */
  reviewedBy?: string;
}

/** buildAnswerSpec 입력 — Question 레코드의 채점 관련 최소 투영 */
export interface ScorableQuestion {
  id: string;
  type: string;
  subType: string | null;
  /** DB options 컬럼(JSON 문자열) 파싱본 또는 원문 문자열 */
  options?: unknown;
  correctAnswer?: string | null;
  structuredData?: unknown;
  /** ExamQuestion.points */
  points: number;
}
