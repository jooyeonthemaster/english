// Pure label maps & constants for member-management UI. Lives outside the
// "use server" module so client components can import sync helpers without
// Next.js trying to interpret them as server actions.

// Per-call ceiling on a single ADJUSTMENT, enforced both server-side
// (Zod schema) and client-side (modal validation). Single source of truth
// to prevent drift between the two enforcement points.
export const MAX_ADJUSTMENT_AMOUNT = 1_000_000;

export const TRANSACTION_TYPES = [
  "ALLOCATION",
  "CONSUMPTION",
  "TOP_UP",
  "ADJUSTMENT",
  "REFUND",
  "RESET",
  "ROLLOVER",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  ALLOCATION: "월 정기 지급",
  CONSUMPTION: "사용",
  TOP_UP: "충전",
  ADJUSTMENT: "수동 조정",
  REFUND: "환불",
  RESET: "초기화",
  ROLLOVER: "이월",
};

// MUST stay in sync with OPERATION_TYPE_ALLOWLIST in
// src/actions/admin-members.ts — keys here drive UI dropdown labels; the
// allowlist gates which values pass server validation.
const OPERATION_TYPE_LABELS: Record<string, string> = {
  QUESTION_GEN_SINGLE: "문제 생성 (단건)",
  QUESTION_GEN_VOCAB: "어휘 문제 생성",
  AUTO_GEN_BATCH: "자동 일괄 생성",
  PASSAGE_ANALYSIS: "지문 분석",
  TEXT_EXTRACTION: "텍스트 추출 (OCR)",
  EXAM_GENERATION: "시험지 생성",
};

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  kakao: "Kakao",
  credentials: "이메일",
};

export function getTransactionTypeLabel(type: string): string {
  return (
    (TRANSACTION_TYPE_LABELS as Record<string, string>)[type] ?? type
  );
}

export function getOperationTypeLabel(op: string | null | undefined): string {
  if (!op) return "—";
  return OPERATION_TYPE_LABELS[op] ?? op;
}

export function getProviderLabel(p: string | null | undefined): string {
  if (!p) return "기타";
  return PROVIDER_LABELS[p] ?? p;
}
