import type { StatusMeta } from "@/lib/admin-labels";
import {
  effectTypeLabel,
  type PrintableCouponEffectType,
} from "@/lib/printable-coupon-format";

// 실물 쿠폰 효과 종류 — 발급 폼 선택지와 목록 필터가 같은 표를 쓴다.
export const EFFECT_OPTIONS: {
  value: PrintableCouponEffectType;
  label: string;
  hint: string;
}[] = [
  { value: "CREDIT_GRANT", label: "크레딧 지급", hint: "등록 즉시 무료 크레딧" },
  { value: "DISCOUNT_AMOUNT", label: "금액 할인", hint: "충전 결제 N원 할인" },
  { value: "DISCOUNT_PERCENT", label: "정률 할인", hint: "충전 결제 N% 할인" },
];

/** 효과 뱃지 — 라벨은 printable-coupon-format(서버·인쇄 공용)이 원본, 색조만 여기서 정한다. */
export function effectTypeStatus(effectType: string): StatusMeta {
  return {
    label: effectTypeLabel(effectType),
    tone: effectType === "CREDIT_GRANT" ? "emerald" : "blue",
  };
}
