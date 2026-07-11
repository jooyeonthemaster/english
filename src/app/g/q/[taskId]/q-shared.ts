// ============================================================================
// /g/q/[taskId] — 서버 페이지·클라이언트 플레이어 공유 계약 (플레인 모듈)
//
// "use client" 모듈의 export 는 서버에서 호출 불가(클라이언트 레퍼런스)이므로
// 양쪽이 함께 쓰는 직렬화 타입·순수 헬퍼는 이 플레인 모듈에 둔다.
// 전부 표시용 계약 — 정답성 데이터는 어떤 필드에도 존재하지 않는다(§6-1).
// ============================================================================

import type {
  AnswerUiSpec,
  StudentSafeQuestion,
} from "@/lib/exam-scoring/student-safe";

/** questions-runtime QuestionsPlayerItem 동형(직렬화 계약 — 정답성 0) */
export interface QPlayerItem {
  question: StudentSafeQuestion;
  answerUi: AnswerUiSpec;
  orderNum: number;
  points: number;
}

export type QGradeStatus = "CORRECT" | "WRONG" | "PARTIAL" | "NEEDS_REVIEW";

/** questions-runtime QuestionsGradeSummary 동형(직렬화 계약) */
export interface QResultSummary {
  score: number;
  maxScore: number;
  percent: number | null;
  correct: number;
  wrong: number;
  partial: number;
  needsReview: number;
  total: number;
}

export interface QPerQuestionResult {
  questionId: string;
  orderNum: number;
  status: QGradeStatus;
}

export interface QTaskResultPayload {
  summary: QResultSummary | null;
  perQuestion: QPerQuestionResult[];
}

/** 판정값 방어 정규화 — 미지값은 "확인 중"으로 수렴 */
export function normalizeGradeStatus(v: unknown): QGradeStatus {
  return v === "CORRECT" || v === "WRONG" || v === "PARTIAL" ? v : "NEEDS_REVIEW";
}
