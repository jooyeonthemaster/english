// ============================================================================
// 실물(인쇄형) 쿠폰 — 서버·클라이언트 공용 순수 헬퍼(라벨/문구/포맷).
// node:crypto 등 서버 전용 모듈을 import 하지 않는다(인쇄 클라이언트에서도 씀).
// ============================================================================

export type PrintableCouponEffectType =
  | "CREDIT_GRANT"
  | "DISCOUNT_AMOUNT"
  | "DISCOUNT_PERCENT";

export const PRINTABLE_COUPON_EFFECT_TYPES: PrintableCouponEffectType[] = [
  "CREDIT_GRANT",
  "DISCOUNT_AMOUNT",
  "DISCOUNT_PERCENT",
];

/** 코드 상태. */
export type PrintableCouponStatus = "ACTIVE" | "CLAIMED" | "USED" | "VOID";

/** effectType 짧은 라벨(배지·필터용). */
export function effectTypeLabel(effectType: string): string {
  switch (effectType) {
    case "CREDIT_GRANT":
      return "크레딧 지급";
    case "DISCOUNT_AMOUNT":
      return "금액 할인";
    case "DISCOUNT_PERCENT":
      return "정률 할인";
    default:
      return effectType;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "미등록";
    case "CLAIMED":
      return "보유";
    case "USED":
      return "사용";
    case "VOID":
      return "무효";
    default:
      return status;
  }
}

export interface CouponEffectValues {
  effectType: string;
  grantCredits?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
}

/**
 * 인쇄 카드/등록 화면에 쓰는 한 줄 효과 문구.
 * CREDIT_GRANT="무료 크레딧 N 지급권", DISCOUNT_AMOUNT="N원 할인권",
 * DISCOUNT_PERCENT="N% 할인권".
 */
export function couponEffectHeadline(v: CouponEffectValues): string {
  switch (v.effectType) {
    case "CREDIT_GRANT":
      return `무료 ${(v.grantCredits ?? 0).toLocaleString("ko-KR")} 크레딧 지급권`;
    case "DISCOUNT_AMOUNT":
      return `${(v.discountAmount ?? 0).toLocaleString("ko-KR")}원 할인권`;
    case "DISCOUNT_PERCENT":
      return `${v.discountPercent ?? 0}% 할인권`;
    default:
      return "쿠폰";
  }
}

/**
 * 할인형 쿠폰이 실제로 깎는 금액(원). price 대비 서버 재계산과 동일 규칙.
 * DISCOUNT_AMOUNT = min(price, amount), DISCOUNT_PERCENT = floor(price*pct/100).
 * CREDIT_GRANT/알 수 없는 효과는 0.
 */
export function computeCouponDiscount(
  v: CouponEffectValues,
  price: number,
): number {
  if (price <= 0) return 0;
  if (v.effectType === "DISCOUNT_AMOUNT") {
    return Math.min(price, Math.max(0, v.discountAmount ?? 0));
  }
  if (v.effectType === "DISCOUNT_PERCENT") {
    const pct = Math.max(0, Math.min(100, v.discountPercent ?? 0));
    return Math.floor((price * pct) / 100);
  }
  return 0;
}
