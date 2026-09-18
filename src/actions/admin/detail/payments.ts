"use server";

import { requireAdminAuth } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import type { AdminDetail } from "@/lib/admin-detail-types";
import { paymentsBlockDetail, type PaymentsBlockKey } from "@/lib/admin-block-detail/payments";

/** 결제 관리 지표 카드 상세(호버·클릭 시 지연 조회). */
export async function getPaymentsBlockDetail(key: PaymentsBlockKey): Promise<AdminDetail> {
  await requireAdminAuth();
  return paymentsBlockDetail(key);
}

/**
 * "확인 필요" 실패 결제를 확인(무시) 처리하거나 되돌린다. 결제 상태(FAILED)는 그대로 두고
 * 확인 기록만 남기므로 충전 내역에는 계속 보이고, "확인 필요" 집계·목록에서만 빠진다.
 */
export async function markFailedTopUpReviewed(topUpId: string, reviewed: boolean): Promise<void> {
  const admin = await requireAdminAuth();
  await prisma.creditTopUp.updateMany({
    where: { id: topUpId, status: "FAILED" },
    data: reviewed
      ? { failureReviewedAt: new Date(), failureReviewedBy: admin.adminId }
      : { failureReviewedAt: null, failureReviewedBy: null },
  });
}
