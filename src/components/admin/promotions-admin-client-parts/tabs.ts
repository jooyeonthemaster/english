// 프로모션 관리 탭 키 — 서버 페이지(searchParams 해석)와 클라이언트가 함께 쓴다.
// "use client" 모듈에 두면 서버에서 값을 읽을 수 없어 별도 파일로 둔다.

export const PROMOTION_TAB_KEYS = ["promotions", "bundles", "monitoring"] as const;
export type PromotionTabKey = (typeof PROMOTION_TAB_KEYS)[number];
export const DEFAULT_PROMOTION_TAB: PromotionTabKey = "promotions";
