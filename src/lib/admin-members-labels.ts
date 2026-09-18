// Pure label maps & constants for member-management UI. Lives outside the
// "use server" module so client components can import sync helpers without
// Next.js trying to interpret them as server actions.

// 상품(operationType) 라벨의 정본은 과금 정의와 같은 파일에 있다 — 여기 없는 키는
// 그쪽으로 떨어뜨려 관리자 화면에 원시 enum 코드(예: "PASSAGE_VARIANT")가 뜨는 것을 막는다.
import { OPERATION_LABELS } from "@/lib/credit-costs";

// OPERATION_LABELS 는 CREDIT_COSTS 키로 좁혀진 Record 라 임의 문자열로 못 읽는다.
// 원장의 operationType 은 DB 문자열(구 op 포함)이므로 넓은 타입으로 한 번만 넓힌다.
const CREDIT_OPERATION_LABELS: Record<string, string> = OPERATION_LABELS;

// Per-call ceiling on a single ADJUSTMENT, enforced both server-side
// (Zod schema) and client-side (modal validation). Single source of truth
// to prevent drift between the two enforcement points.
export const MAX_ADJUSTMENT_AMOUNT = 1_000_000;

// Upper bound for an admin-set credit validity window (10 years). Lives here
// (not in the "use server" action module) because server-action files may only
// export async functions.
export const MAX_GRANT_EXPIRY_DAYS = 3650;

export const TRANSACTION_TYPES = [
  "ALLOCATION",
  "CONSUMPTION",
  "TOP_UP",
  "ADJUSTMENT",
  "REFUND",
  "RESET",
  "ROLLOVER",
  "EXPIRATION",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// 유형(type)만 보고 붙이는 라벨 — 필터 드롭다운·유형 배지용이라 그 유형의 행 전부를 덮어야 한다.
// 26-09-17 실DB 분포(credit_transactions, type × referenceType) 기준으로 정정:
//  - ALLOCATION 306건 전부 referenceType NULL = 가입 무료 체험·초기 지급(「월 정기 지급」 0건).
//    구독 결제 지급(referenceType SUBSCRIPTION_PAYMENT)도 이 유형을 쓰지만 현재 0건.
//  - TOP_UP 167건 중 유료 충전(CREDIT_TOP_UP) 35건뿐, 나머지 132건은 무료 지급(MISSION 116·PRINTABLE_COUPON 14·REFERRAL 2).
//  - REFUND 1,299건 = 생성 실패 환급(CREDIT_TRANSACTION, +) 1,297 + 결제 환불로 크레딧 회수(CREDIT_TOP_UP_REFUND, −) 2.
// 행 단위로는 referenceType 까지 보는 getTransactionLabel() 을 쓴다.
const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  ALLOCATION: "가입·기본 지급",
  CONSUMPTION: "사용",
  TOP_UP: "충전·보상 지급",
  ADJUSTMENT: "수동 조정",
  REFUND: "환급·회수",
  RESET: "초기화",
  ROLLOVER: "이월",
  EXPIRATION: "소멸",
};

// (type, referenceType) → 행 라벨. 여기 없는 조합은 유형 라벨로 떨어진다.
const TRANSACTION_REFERENCE_LABELS: Record<string, Record<string, string>> = {
  ALLOCATION: {
    "": "무료 지급(가입 등)",
    SUBSCRIPTION_PAYMENT: "구독 결제 지급",
  },
  TOP_UP: {
    CREDIT_TOP_UP: "유료 충전",
    MISSION: "무료 지급(미션)",
    REFERRAL: "무료 지급(추천)",
    PRINTABLE_COUPON: "무료 지급(쿠폰)",
  },
  ADJUSTMENT: {
    ADMIN_ADJUSTMENT: "수동 조정",
    ADMIN_WIPE: "수동 회수(일괄)",
    ADMIN_EXPIRY: "소멸기한 변경",
  },
  REFUND: {
    CREDIT_TRANSACTION: "실패 환급",
    CREDIT_TOP_UP_REFUND: "결제 환불 회수",
  },
  EXPIRATION: {
    CREDIT_EXPIRY: "소멸",
  },
};

/** 크레딧 유입 분류 — 회원 상세 「누적 지급」 분해용. null = 유입 아님(사용·환급·소멸 등). */
export type CreditInflowKind = "paid" | "free" | "admin";

export function classifyCreditInflow(
  type: string,
  referenceType: string | null | undefined,
): CreditInflowKind | null {
  const ref = referenceType ?? "";
  if (type === "ALLOCATION") return ref === "SUBSCRIPTION_PAYMENT" ? "paid" : "free";
  if (type === "TOP_UP") return ref === "CREDIT_TOP_UP" ? "paid" : "free";
  // 결제 환불로 회수한 크레딧(음수)은 유료 충전에서 뺀다 — CreditBalance.totalAllocated 와 같은 규칙.
  if (type === "REFUND" && ref === "CREDIT_TOP_UP_REFUND") return "paid";
  if (type === "ADJUSTMENT") return "admin";
  return null;
}

// MUST stay in sync with OPERATION_TYPE_ALLOWLIST in
// src/actions/admin-members/_shared.ts — keys here drive UI dropdown labels; the
// allowlist gates which values pass server validation.
export const OPERATION_TYPE_LABELS: Record<string, string> = {
  QUESTION_GEN_SINGLE: "문제 생성 (단건)",
  QUESTION_GEN_VOCAB: "어휘 문제 생성",
  AUTO_GEN_BATCH: "자동 일괄 생성",
  LEARNING_QUESTION_GEN: "학습 문제 생성",
  PASSAGE_ANALYSIS: "학습지 생성",
  TEXT_EXTRACTION: "텍스트 추출 (OCR 무료)",
  GRAMMAR_ENHANCEMENT: "문법 포인트 분석",
  SENTENCE_RETRANSLATION: "문장 재번역",
  QUESTION_EXPLANATION: "해설 생성",
  QUESTION_MODIFY: "문제 수정",
  AI_CHAT: "AI 튜터링",
  PASSAGE_RESTORATION: "AI 지문 복원",
  WEBTOON_IMAGE: "웹툰 이미지 생성",
  WEBTOON_IMAGE_PREMIUM: "웹툰 이미지 생성 (프리미엄)",
  WEBTOON_EXAM_DOWNLOAD: "기출 웹툰 다운로드",
  EXAM_GENERATION: "시험지 생성",
  // 보상·지급 계열(거래 이력 「상품」 칸에 뜬다). 문구는 실DB description 기준.
  MISSION_DAILY_CHECKIN: "미션 보상 (매일 출석 체크)",
  MISSION_KAKAO_SHARE: "미션 보상 (카카오톡 공유)",
  MISSION_ONBOARD_FIRST_GENERATION: "미션 보상 (첫 문제 생성)",
  PRINTABLE_COUPON_GRANT: "실물 쿠폰 지급",
  REFERRAL_REFERRER: "친구 추천 보상 (추천인)",
  REFERRAL_REFERRED: "친구 추천 보상 (피추천인)",
  // 나머지(AI 지문 변형·시험 분석 등)는 credit-costs.ts 의 OPERATION_LABELS 로 떨어진다.
  // WEBTOON_PANEL(8건)·SIMILAR_EXAM_GENERATION(2건)은 코드 참조가 사라진 구 op 라
  // 이름을 지어내지 않고 원시 코드를 그대로 둔다.
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

/** 거래 1건 라벨 — referenceType 으로 유료/무료·환급/회수를 가른다. */
export function getTransactionLabel(
  type: string,
  referenceType: string | null | undefined,
): string {
  const byRef = TRANSACTION_REFERENCE_LABELS[type];
  const label = byRef?.[referenceType ?? ""];
  return label ?? getTransactionTypeLabel(type);
}

export function getOperationTypeLabel(op: string | null | undefined): string {
  if (!op) return "—";
  // 관리자 전용 문구 → 과금 정본 문구 → 원시 코드 순. 26-09-18 실측으로 라벨이 없던
  // op 14종(PASSAGE_VARIANT 31곳·PASSAGE_TRANSFORM 28곳 등)이 화면에 enum 코드로 떴다.
  return OPERATION_TYPE_LABELS[op] ?? CREDIT_OPERATION_LABELS[op] ?? op;
}

export function getProviderLabel(p: string | null | undefined): string {
  if (!p) return "기타";
  return PROVIDER_LABELS[p] ?? p;
}
