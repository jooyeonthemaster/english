// AI 채점 동작 상수 (스펙 §4.1)
export const AI_GRADE_TIMEOUT_MS = 6000; // 6초 동기 시도 상한, 초과 시 degraded
export const AI_GRADE_MAX_DURATION_S = 30; // Vercel route maxDuration
export const AI_GRADE_PASS_PCT = 80; // verdict 보정용: scorePct>=이면 정답 취급(correct verdict와 함께)
