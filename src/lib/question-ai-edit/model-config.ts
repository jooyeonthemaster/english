// ============================================================================
// AI 문제 수정 — 모델 설정 (3-후보 풀, env 오버라이드 가능)
// ============================================================================
// 후보: gemini-3.5-flash(STANDARD 생성 기본) · gemini-3.1-flash-lite(복원/변형 경량)
//       · claude-sonnet-4-6(PREMIUM). 실측 bake-off(scripts/bench-question-ai-edit.ts)로
//       기본값을 결정한다. 운영자는 QUESTION_EDIT_MODEL env 로 즉시 교체 가능.
// ============================================================================

import type { EditModelId } from "./types";

export const EDIT_MODEL_IDS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "claude-sonnet-4-6",
] as const;

export function isEditModelId(value: unknown): value is EditModelId {
  return (
    typeof value === "string" &&
    (EDIT_MODEL_IDS as readonly string[]).includes(value)
  );
}

/**
 * 기본 수정 모델 = gemini-3.5-flash.
 * bake-off(scripts/bench-question-ai-edit.ts, 8유형 실측) 결정 근거:
 *   - gemini-3.5-flash : 성공 8/8 · 평균 7.2s · 평균경고 0.13 · 유형고정 8/8 · 누설 0
 *       → 유일하게 전 유형(GRAMMAR_CORRECTION·SENTENCE_INSERT 포함) 통과, 최저 경고.
 *   - gemini-3.1-flash-lite : 성공 7/8 · 평균 4.0s · 경고 0.86 — 최속이나 GRAMMAR_CORRECTION
 *       후처리 실패 + 경고 다수. (속도 우선 운영 시 env 로 전환 가능.)
 *   - claude-sonnet-4-6 : 성공 7/8 · 평균 23.4s — 고품질이나 3배 느리고 SENTENCE_INSERT
 *       스키마 미준수. (정밀 우선 시 env 로 전환 가능.)
 * env QUESTION_EDIT_MODEL 가 유효 후보면 그 값을 우선(코드 재배포 없이 교체).
 */
const DEFAULT_EDIT_MODEL: EditModelId = "gemini-3.5-flash";

export function resolveEditModelId(requested?: string): EditModelId {
  if (isEditModelId(requested)) return requested;
  const fromEnv = process.env.QUESTION_EDIT_MODEL?.trim();
  if (isEditModelId(fromEnv)) return fromEnv;
  return DEFAULT_EDIT_MODEL;
}

export function editModelProvider(modelId: EditModelId): "google" | "anthropic" {
  return modelId === "claude-sonnet-4-6" ? "anthropic" : "google";
}

/** 동일 유형 반복 호출 캐시(Claude 전용)·타임아웃 기본값. */
export const EDIT_MODEL_TIMEOUTS_MS: Record<EditModelId, number> = {
  "gemini-3.5-flash": 60_000,
  "gemini-3.1-flash-lite": 45_000,
  "claude-sonnet-4-6": 180_000,
};
