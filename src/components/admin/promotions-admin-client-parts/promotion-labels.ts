import type { StatusMeta } from "@/lib/admin-labels";
import type { AdminPromotionView } from "@/lib/credit-top-up-products";

// 프로모션 관리 — 표·카드에 쓰는 순수 라벨 계산.
// 프로모션/번들 상태는 "기간 내 여부 + 활성" 조합으로 계산되는 파생 상태라
// admin-labels 레지스트리(enum 맵)에 없다. StatusBadge status= 로 넘긴다.

export function discountLabel(p: {
  discountType: string;
  discountValue: number;
}): string | null {
  if (p.discountValue <= 0) return null;
  return p.discountType === "AMOUNT"
    ? `${p.discountValue.toLocaleString("ko-KR")}원 할인`
    : `${p.discountValue}% 할인`;
}

export function bonusLabel(p: {
  bonusType: string;
  bonusValue: number;
}): string | null {
  if (p.bonusValue <= 0) return null;
  return p.bonusType === "AMOUNT"
    ? `크레딧 +${p.bonusValue.toLocaleString("ko-KR")}C`
    : `크레딧 +${p.bonusValue}%`;
}

export function audienceLabel(p: AdminPromotionView): string {
  if (p.audience !== "TARGETED") return "전체 공개";
  return p.targetAcademyIds.length > 0
    ? `지정 ${p.targetAcademyIds.length}곳`
    : "지정/링크";
}

/** 진행 중(기간 내) / 기간 외(활성이나 기간 밖·혜택 없음) / 비활성. */
export function promotionStatus(p: {
  isActive: boolean;
  isInWindow: boolean;
}): StatusMeta {
  if (p.isInWindow) return { label: "진행 중", tone: "emerald" };
  if (p.isActive) return { label: "기간 외", tone: "gray" };
  return { label: "비활성", tone: "gray" };
}

/** 번들 카드 상태 — 활성 + 진행 중 프로모션 수. */
export function bundleStatus(
  bundle: { isActive: boolean },
  runningCount: number,
): StatusMeta {
  if (!bundle.isActive) return { label: "비활성", tone: "gray" };
  if (runningCount > 0) return { label: `진행 중 ${runningCount}개`, tone: "emerald" };
  return { label: "유효 프로모션 없음", tone: "amber" };
}
