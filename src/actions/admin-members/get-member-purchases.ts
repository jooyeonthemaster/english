"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";

// ============================================================================
// 회원(학원)의 상품 구입 이력 — 크레딧 충전(CreditTopUp) 기록.
// 크레딧은 학원 단위 지갑이므로 회원의 소속 학원 기준으로 조회한다.
// 완료뿐 아니라 대기/실패/취소/환불도 함께 보여 전체 이력을 파악할 수 있게 한다.
// ============================================================================

export interface MemberPurchaseItem {
  id: string;
  /** 표시용 상품명 — orderName 우선, 없으면 "N 크레딧" */
  name: string;
  creditAmount: number;
  price: number;
  status: string;
  paymentMethod: string | null;
  /** 구입 완료 시각(없으면 결제/생성 시각) */
  purchasedAt: string;
  createdAt: string;
}

export async function getMemberPurchases(
  memberId: string,
  opts?: { limit?: number },
): Promise<MemberPurchaseItem[]> {
  await requireAdminAuth();

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { academyId: true },
  });
  if (!staff) return [];

  const rows = await prisma.creditTopUp.findMany({
    where: { academyId: staff.academyId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts?.limit ?? 50, 1), 200),
    select: {
      id: true,
      orderName: true,
      creditAmount: true,
      price: true,
      status: true,
      paymentMethod: true,
      completedAt: true,
      paidAt: true,
      createdAt: true,
    },
  });

  return rows.map((t) => ({
    id: t.id,
    name: t.orderName ?? `${t.creditAmount.toLocaleString("ko-KR")} 크레딧`,
    creditAmount: t.creditAmount,
    price: t.price,
    status: t.status,
    paymentMethod: t.paymentMethod,
    purchasedAt: (t.completedAt ?? t.paidAt ?? t.createdAt).toISOString(),
    createdAt: t.createdAt.toISOString(),
  }));
}
