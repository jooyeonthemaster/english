// ============================================================================
// AI 문제 수정 (Question AI-Edit) — 공유 타입
// ============================================================================
// 이미 생성된 한 문제를 자연어 지시로 "유형 고정, 내부만" 수정한다.
// 생성 파이프라인(STRUCTURED_TYPE_PROMPTS · getAiResponseSchema · postProcessQuestion
// · validateQuestionQuality)을 그대로 재사용하되, "프리 생성"이 아니라 "현재 문제를
// 베이스라인으로 둔 제약 재생성"이라는 점만 다르다. (run-edit.ts 참고)
// ============================================================================

import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { QuestionQualityIssue } from "@/lib/question-quality";
import type { DiffEntry } from "./detailed-diff";

/** 수정에 사용할 모델 식별자 — model-config.ts 의 후보 풀과 1:1. */
export type EditModelId =
  | "google/gemini-3.5-flash"
  | "google/gemini-3.1-flash-lite"
  | "anthropic/claude-sonnet-5";

/** 구조화 문제 객체 — 생성기가 만드는 `_typeId` 기반 레코드와 동일 형태. */
export type StructuredQuestionLike = Record<string, unknown>;

/** run-edit 입력 — API/스크립트 공용. */
export interface RunQuestionEditInput {
  /** 수정 대상 문제의 유형 코드(subType). 절대 변경되지 않는다(유형 고정). */
  subType: string;
  /** 연결된 지문 원문(없을 수 있음 — 일부 유형은 지문 비의존). */
  passageContent: string;
  /** 현재 문제의 구조화 데이터(structuredData) — 수정의 베이스라인. */
  baseline: StructuredQuestionLike;
  /** 사용자가 자연어로 입력한 수정 지시. */
  instruction: string;
  /** 사용자가 클릭으로 지정한 수정 대상 블럭(프롬프트 타깃 섹션). 선택. */
  targets?: { label: string; field?: string }[];
  /** 학교급("중학교"/"고등학교") — 발문 톤·난이도 보정. */
  schoolType: string;
  /** 학년/학기 등 메타(프롬프트 컨텍스트용, 없으면 빈 문자열). */
  gradeInfo?: string;
  /** STANDARD(Gemini)·PREMIUM(Claude) — 프롬프트 계약 라우팅용. */
  generationPlan: QuestionGenerationPlan;
  /** 실제 호출 모델. 미지정 시 model-config 기본값. */
  modelId?: EditModelId;
  /** 절대 데드라인(epoch ms) — provider abort 를 남은예산으로 좁힌다. */
  deadlineAt?: number;
  /** 최대 재시도(교정 피드백 주입) 횟수. 기본 2. */
  maxAttempts?: number;
}

/** 베이스라인 대비 어떤 필드가 바뀌었는지(결정론 diff). */
export interface EditFieldChange {
  /** 내부 필드 키(예: "options", "correctAnswer", "explanation"). */
  field: string;
  /** 사람이 읽는 한국어 라벨(예: "선택지", "정답", "해설"). */
  label: string;
  /** 변경 종류. */
  kind: "added" | "removed" | "changed" | "reordered";
}

export interface RunQuestionEditResult {
  ok: boolean;
  /** 실패 사유(사용자 메시지). ok=false 일 때만. */
  error?: string;
  /** 수정 전(=baseline) 구조화 객체. */
  before: StructuredQuestionLike;
  /** 수정 후 구조화 객체(저장 가능한 형태, _typeId 포함). */
  after?: StructuredQuestionLike;
  /** 결정론 필드 diff(변경 요약 칩 렌더용). */
  changes: EditFieldChange[];
  /** 상세 변경 내역(필드/항목별 before→after) — "수정 내역" 패널 렌더용. */
  detailedChanges: DiffEntry[];
  /** 저장용으로 직렬화한 questionText(buildGeneratedQuestionText). */
  questionText?: string;
  /** 모델이 서술한 "요청대로 무엇을 어떻게 바꿨는지" 한국어 변경 요약(교사용·미저장). */
  editSummary?: string;
  /** 품질 게이트 경고(에러는 재시도, 최종 경고만 노출). */
  qualityWarnings: QuestionQualityIssue[];
  /** 마지막 시도가 품질 에러를 안고 통과(완화 수락)했는지. */
  acceptedWithWarnings: boolean;
  /** 진단/과금 계측. */
  meta: {
    modelId: EditModelId;
    provider: "atlascloud";
    attempts: number;
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}
