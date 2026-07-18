// ============================================================================
// 학생 시험 리포트 v3 — 도메인 타입 단일 소스
// (zod 스키마는 ./schemas.ts, 리포트 문서는 ./report-schema.ts)
//
// v3 원칙: OCR/구조화/문항 렌더 전면 폐기. 소넷 5가 학생 시험지 사진을 직접 보고
// 분석한다. 중간 산물은 "채점을 위한 최소 지도(ExamMap)"뿐. v2 의
// ExamPaperQuestion/SharedPassage/ExamPaperStructure(구조화 렌더 도메인)는 폐기됐다.
// ============================================================================

export type ExamAnalysisStatus =
  | "DRAFT"
  | "ANALYZING"
  | "ANALYZED"
  | "FAILED";

export type ExamSourceType = "IMAGE" | "PDF" | "TEXT" | "MANUAL";
export type ExamType = "MIDTERM" | "FINAL" | "MOCK" | "OTHER";

/** 문항 종류(객관식·단답형·서술형) — ExamMap·응답·분석 공통. */
export type ExamQuestionKind = "MC" | "SHORT" | "ESSAY";

/** 신뢰도 등급 — E1a 정답 도출·E2 답안 판독 공통. */
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

// ── ExamMap (채점을 위한 최소 지도 — v2 ExamPaperStructure 대체) ──────────────

/**
 * 시험 지도 항목 1개. 채점에 필요한 최소 메타 + E1b 가 도출한 정답.
 * 발문/선지/지문 전문은 담지 않는다(brief = 발문 1줄 요약).
 *
 * v3.1: 정답 도출을 E1a → E1b 로 이관했다. E1a(구조 지도)는 정답을 풀지 않으므로
 * correctAnswer·answerConfidence 가 비어 있고(둘 다 optional), E1b 문항 심층분석이
 * 도출한 정답을 structure 컬럼(examMap)에 병합해 채운다. 따라서 E1 진행 중에는
 * 정답이 아직 없는 중간 상태가 정상이다(소비처는 정답 부재를 허용해야 한다).
 */
export interface ExamMapEntry {
  /** 시험지 표기 번호 — 자유형 ("1", "12", "서술형 2") */
  number: string;
  /** 1-based 정렬 순서 — 응답/판독 매핑 기준(인쇄된 페이지번호 기준 정렬) */
  order: number;
  kind: ExamQuestionKind;
  points: number | null;
  /** 유형 분류(빈칸추론/어법/제목추론/서술형-영작 …) */
  typeLabel: string;
  /** 발문 1줄 요약 — 전문 금지 */
  brief: string;
  /** MC: "1".."5" (1-based) / SHORT·ESSAY: 모범답안 요약. E1b 도출 전·실패 시 비움 */
  correctAnswer?: string;
  /** E1b 가 도출한 정답의 확신도 — LOW 는 강사 확인 필요 뱃지 트리거. E1a 직후엔 없음 */
  answerConfidence?: Confidence;
}

/**
 * E1b 문항 심층분석이 도출한 정답 패치 — structure(examMap) 병합용.
 * perQuestion(분석) 과 별도 채널로 흘러 examMap 항목의 정답 필드만 갱신한다.
 */
export interface ExamMapAnswer {
  number: string;
  /** MC: "1".."5" / SHORT·ESSAY: 모범답안 요약. 도출 실패 시 undefined */
  correctAnswer?: string;
  /** 도출 확신도. correctAnswer 도출 실패면 LOW(강사 확인 유도) */
  answerConfidence?: Confidence;
}

export interface ExamMap {
  questions: ExamMapEntry[];
  totalPoints: number | null;
  /** 분석에 사용된 시험지 페이지 수 */
  pageCount: number;
}

// ── AI 문항 분석 ────────────────────────────────────────────────────────────

export type QuestionAnalysisStatus = "OK" | "FAILED";

export interface QuestionTrapDesign {
  /** 선지 번호 "1".."5" */
  choice: string;
  /** 이 오답이 매력적인 이유 (설계 의도) */
  why: string;
  /** 매력도 1(약)~3(강) */
  attractiveness: 1 | 2 | 3;
}

export interface QuestionAnalysis {
  number: string;
  /** FAILED = 배치 실패로 미분석 (UI에서 무료 재분석) — 플레이스홀더 텍스트 금지 */
  analysisStatus: QuestionAnalysisStatus;
  /** 유형 분류 (빈칸추론/어법/제목/서술형-영작 …) */
  typeLabel: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  difficultyRationale: string;
  /** 상세 해설 */
  explanation: string;
  /** 출제 의도 */
  intent: string;
  /** 출제 포인트 (평가 요소) */
  examPoint: string;
  /** 핵심 개념 태그 1~4개 */
  keyConcepts: string[];
  /** 접근 전략 */
  solvingStrategy: string;
  /** MC 오답 선지별 함정 설계 */
  trapDesign?: QuestionTrapDesign[];
}

export interface ExamLevelAnalysis {
  overview: string;
  /** 문항 번호 버킷 */
  difficultyProfile: {
    easy: string[];
    medium: string[];
    hard: string[];
    killer: string[];
  };
  typeDistribution: { typeLabel: string; numbers: string[]; points: number }[];
  /** 오답 설계 총평 */
  trapOverview: string;
  /** 출제 범위/교재 추정 */
  scopeInference: string;
}

export interface ExamAnalysisResult {
  perQuestion: QuestionAnalysis[];
  /** 전 배치 완료 후 E1c 종합 — 미완 시 null */
  examLevel: ExamLevelAnalysis | null;
}

/** exam_analyses.reviewState — 구조검수 개념 폐기, examMap 인라인 정답/배점 확인만. */
export interface ExamReviewState {
  /**
   * (레거시) examMap 일괄 확인 플래그. 문항별 확인(mapConfirmedNumbers) 도입 전
   * 「정답·배점 확인 완료」 버튼의 뱃지 소스였다. 신규 경로는 쓰지 않고,
   * 게이트 승계(legacy grandfather) 판정에만 남는다.
   */
  mapConfirmed?: boolean;
  /** 분석 검수(해설·출제의도 등) 완료 문항 번호 — 게이트 조건이 **아니다**. */
  confirmedNumbers?: string[];
  /**
   * 정답·배점 확인이 끝난 문항 번호. 학생 관리(2단계) 게이트의 유일한 근거로,
   * 전 문항이 여기 들어와야 게이트가 열린다. 배점/정답을 고치면 해당 번호를
   * 빼서 재확인을 강제한다(analysis 검수용 confirmedNumbers 와 별개 축).
   */
  mapConfirmedNumbers?: string[];
}

/**
 * E1 분석 진행 스냅샷 — 배치 커밋마다 checkpoint writer 가 aiMeta.progress 로 기록.
 * 목록(summary)·큐 카드·워크스페이스가 실제 진행률/ETA 를 이 값 하나로 그린다.
 */
export interface ExamAnalysisProgress {
  /** examMap 전체 중 판정(perQuestion 존재) 완료 문항 수 */
  completed: number;
  /** examMap 전체 문항 수 */
  total: number;
  /** 이번 실행 실측 문항당 소요(ms) — ETA = (total-completed) × msPerQuestion */
  msPerQuestion?: number;
  /** 마지막 진행 갱신(epoch ms) — 클라 감시견의 체인 단선 판정 기준 */
  updatedAt?: number;
}

export interface ExamAiMeta {
  model?: string;
  calls?: number;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  /** ANALYZING 좀비 판정 기준(reconcile.ts) — 진입 시 기록, 배치 커밋마다 갱신 */
  runStartedAt?: number;
  /** 최근 분석에서 실패한 문항 번호 */
  failedNumbers?: string[];
  /**
   * 이번(마지막) 종결 실행에서 실제로 환불된 크레딧(D2). 0 또는 미기록 = 환불 없음.
   * FAILED 배너의 "환불되었습니다" 문구를 이 값이 > 0 일 때만 노출하는 소스오브트루스.
   */
  refundedCredits?: number;
  /** 실제 진행률 스냅샷 — 배치 커밋마다 갱신(첫 체크포인트 전엔 없음 = 문항 인식 중) */
  progress?: ExamAnalysisProgress;
  /**
   * 첫 실행에서 전 문항 과금(max(15,N))이 이미 완료됨 — 이후 전체 재개(runTarget 미지정)
   * 시 perQuestion 미존재 문항(중단으로 미분석)을 무료로 처리하는 근거(이중과금 차단).
   */
  paidFullRun?: boolean;
  /** 서버 자가연쇄(재개 self-POST) 라운드 수 — 폭주 가드(캡 초과 시 체인 중단) */
  autoResumeRounds?: number;
}

// ── 학생 응답/채점 ──────────────────────────────────────────────────────────

export type ResponseStatus = "CORRECT" | "WRONG" | "PARTIAL" | "UNKNOWN";
export type ResponseSource = "MANUAL" | "AUTO";

/**
 * E2 답안 판독 결과 셀 — StudentResponse.aiRead 에 채워진다.
 * 강사가 정오표에서 확정하기 전, AI 가 사진에서 읽어낸 원자료.
 */
export interface AiReadCell {
  /** MC 학생 선택 "1".."5" */
  chosenChoice?: string;
  /** 서답형 학생이 쓴 최종답(취소선 제외) */
  writtenAnswer?: string;
  /** 채점 표기 판독(동그라미/빗금/X 등 사진에 보이는 채점 흔적) */
  gradedMark?: string;
  /** 판독 확신도 — LOW 는 가급적 UNKNOWN 으로 강등 */
  confidence: Confidence;
  /** 판독 근거(어디를 보고 그렇게 읽었는가) */
  evidence?: string;
}

/**
 * 학생의 문항 1개 응답.
 * 기본값은 status UNKNOWN — "미터치=정답" 같은 암묵 규칙 금지 (만점 인플레이션 방지).
 * AI 프리필은 source:"AUTO", reviewed:false → 정오표 확정 시 전체 reviewed:true.
 */
export interface StudentResponse {
  number: string;
  status: ResponseStatus;
  /** 선택 선지 "1".."5" — 선택 입력 (없어도 리포트 생성 가능) */
  chosenChoice?: string;
  /** PARTIAL/서술형 획득 점수 */
  earnedPoints?: number;
  /** 강사 메모 (예: "철자 실수") */
  note?: string;
  /** 서답형(단답/서술) 학생이 직접 쓴 답 원문 — 답안 링크(/a) 제출·수동 입력용.
   *  정오표에서 모범답안과 대조해 강사가 ○✕△ 판정하는 재료(자동 채점 금지). */
  studentAnswer?: string;
  /** AUTO = 답안 판독(사진) 프리필 */
  source: ResponseSource;
  /** AUTO 프리필은 false 로 시작 — 문항별 '검수 전' 뱃지의 소스오브트루스 */
  reviewed: boolean;
  /** E2 답안 판독 원자료(정오표에서 강사가 참고) */
  aiRead?: AiReadCell;
}

export interface ScoreSummary {
  totalScore: number | null;
  maxScore: number | null;
  correctCount: number;
  wrongCount: number;
  partialCount: number;
  unknownCount: number;
  /** 선택 입력 — 있으면 dataLevel RICH 판정 요소 */
  classAverage?: number | null;
  gradeBand?: string | null;
}

/**
 * 응답 정보 밀도 등급 — 리포트 프롬프트에 명시 전달해
 * "없는 데이터로 추정하지 말 것"을 강제한다. 판정은 grading.ts 순수함수:
 * - WRONG 인 MC 문항 중 chosenChoice 입력률 ≥ 70% → WITH_CHOICES
 * - WITH_CHOICES 충족 + (classAverage 입력 또는 서술형 earnedPoints 1개 이상) → RICH
 * - 그 외 → STATUS_ONLY
 */
export type ResponseDataLevel = "STATUS_ONLY" | "WITH_CHOICES" | "RICH";

export type StudentReportStatus = "NONE" | "GENERATING" | "GENERATED" | "FAILED";

// ── 답안 판독 상태(exam_report_students.readState) ───────────────────────────

export type ReadStatus = "NONE" | "READING" | "READ" | "FAILED";

/** E2 가 강사에게 던지는 확인 요청(모호한 마킹). */
export interface ReadUncertainty {
  number: string;
  /** 강사에게 묻는 질문 텍스트 */
  question: string;
  kind: ExamQuestionKind;
}

export interface ReadAiMeta {
  model?: string;
  calls?: number;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
}

/** 학생별 답안 판독 상태 스냅샷. */
export interface ReadState {
  status: ReadStatus;
  /** abuse 가드 — 판독 실행 횟수(선증가). EXAM_READ_MAX_RUNS 캡 */
  readRuns: number;
  /** READING 좀비 판정 기준(epoch ms) — 판독 예약 시 기록. 학생행 updatedAt 은
   *  무관한 쓰기(채점 저장 등)로도 갱신돼 좀비를 연명시키므로 이 값을 기준으로
   *  신선도를 판정한다(reconcile.ts / read 라우트). */
  readStartedAt?: number;
  /** 마지막 판독 완료 시각(ISO) */
  readAt?: string | null;
  model?: string;
  uncertainties: ReadUncertainty[];
  aiMeta?: ReadAiMeta;
  error?: string;
}

// ── 잡 도메인 ───────────────────────────────────────────────────────────────

/** WorkbenchAiJob.domain 값 */
export const EXAM_REPORT_JOB_DOMAIN = "EXAM_REPORT";
export const EXAM_STUDENT_REPORT_JOB_DOMAIN = "EXAM_STUDENT_REPORT";

/** 문항 분석 크레딧: 문항당 1cr, 최소 15 (credit-costs.EXAM_ANALYSIS=1 × costOverride) */
export const EXAM_ANALYSIS_MIN_CREDITS = 15;
export function examAnalysisCreditCost(questionCount: number): number {
  return Math.max(EXAM_ANALYSIS_MIN_CREDITS, Math.max(0, questionCount));
}

/** 답안 판독(E2) 재실행 상한 — 무과금 abuse 가드(학생당). */
export const EXAM_READ_MAX_RUNS = 3;
