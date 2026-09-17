// 추천·미션(/admin/referrals) 탭 키 — 서버 페이지(page.tsx)가 ?tab= 을 해석할 때도 쓰므로
// "use client" 없는 평범한 모듈로 둔다.

export const REFERRAL_TAB_KEYS = ["overview", "held", "missions", "announce"] as const;

export type ReferralTabKey = (typeof REFERRAL_TAB_KEYS)[number];

export const DEFAULT_REFERRAL_TAB: ReferralTabKey = "overview";
