"use server";

import { requireAdminAuth } from "@/lib/auth-admin";
import type { AdminDetail } from "@/lib/admin-detail-types";
import {
  referralRowDetail,
  referralStatDetail,
  type ReferralStatKey,
} from "@/lib/admin-block-detail/referrals";

const STAT_KEYS: ReferralStatKey[] = ["total", "granted", "held", "rejected", "clawedBack", "creditsIssued"];

/** 추천 관리 지표 카드 상세(호버·클릭 시 지연 조회). */
export async function getReferralStatDetail(key: ReferralStatKey): Promise<AdminDetail> {
  await requireAdminAuth();
  if (!STAT_KEYS.includes(key)) throw new Error("알 수 없는 지표입니다.");
  return referralStatDetail(key);
}

/** 추천 현황 행 상세 — 보상 분배·심사·위험 신호. */
export async function getReferralRowDetail(id: string): Promise<AdminDetail> {
  await requireAdminAuth();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    throw new Error("잘못된 추천 ID입니다.");
  }
  return referralRowDetail(id);
}
