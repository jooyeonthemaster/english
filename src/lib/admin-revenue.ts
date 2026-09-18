// ============================================================================
// 관리자 매출 정의 — 단일 진실원. 대시보드·결제 관리·원가 분석·BEP 가 전부 이걸 쓴다.
// 계약: docs/analytics/analytics-spec.md I9, §9
//
// 매출(net) = 충전 매출(gross) − 충전 환불 + 구독 결제 + 무통장 수동지급
//  - 충전 매출(gross): status ∈ {COMPLETED, REFUNDED} 의 COALESCE(paidAmount, price), 기준 시각 COALESCE(paidAt, completedAt)
//    → 환불된 건도 "결제한 날"에는 매출이었다(소급 삭제 금지).
//  - 충전 환불: status = REFUNDED 의 COALESCE(paidAmount, price), 기준 시각 COALESCE(cancelledAt, updatedAt)
//  - PENDING(결제창 이탈 포함)·WAITING_FOR_DEPOSIT·FAILED·CANCELLED 는 매출이 아니다.
//  - 구독: status = PAID, COALESCE(paidAmount, amount), COALESCE(paidAt, completedAt)
//  - 무통장 수동지급: bank_deposit_notifications.status = MANUAL_GRANT, amount, COALESCE(occurredAt, receivedAt)
// 부분취소는 26-09-17 실측 0건(portoneStatus PARTIAL_CANCELLED 0) — 발생 시 여기서 반영할 것.
// ============================================================================

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REVENUE_TOPUP_STATUSES = ["COMPLETED", "REFUNDED"] as const;

/** 결제 대기로 보이지만 사실상 이탈한 주문을 가르는 기준(분) — 클라이언트 공용 상수 모듈에서 재수출. */
export { PENDING_STALE_MINUTES } from "./admin-revenue-constants";

export interface RevenueBreakdown {
  /** 충전 결제액(환불 전) */
  topUpGross: number;
  /** 충전 환불액(환불일 기준) */
  topUpRefunds: number;
  subscription: number;
  manualGrant: number;
  /** 순매출 = topUpGross − topUpRefunds + subscription + manualGrant */
  net: number;
  /** 결제 완료 건수(환불건 포함, 충전만) */
  topUpCount: number;
  refundCount: number;
}

export function topUpGrossWhere(start: Date, end: Date): Prisma.CreditTopUpWhereInput {
  return {
    status: { in: [...REVENUE_TOPUP_STATUSES] },
    OR: [
      { paidAt: { gte: start, lt: end } },
      { paidAt: null, completedAt: { gte: start, lt: end } },
    ],
  };
}

export function topUpRefundWhere(start: Date, end: Date): Prisma.CreditTopUpWhereInput {
  return {
    status: "REFUNDED",
    OR: [
      { cancelledAt: { gte: start, lt: end } },
      { cancelledAt: null, updatedAt: { gte: start, lt: end } },
    ],
  };
}

export function topUpAmount(t: { paidAmount: number | null; price: number }): number {
  return t.paidAmount ?? t.price;
}

/** 충전 결제 시각(매출 인식 시각) */
export function topUpPaidAt(t: { paidAt: Date | null; completedAt: Date | null; createdAt?: Date }): Date | null {
  return t.paidAt ?? t.completedAt ?? t.createdAt ?? null;
}

/** 충전 환불 시각 */
export function topUpRefundedAt(t: { cancelledAt: Date | null; updatedAt: Date }): Date {
  return t.cancelledAt ?? t.updatedAt;
}

export function subscriptionRevenueWhere(start: Date, end: Date): Prisma.SubscriptionPaymentWhereInput {
  return {
    status: "PAID",
    OR: [
      { paidAt: { gte: start, lt: end } },
      { paidAt: null, completedAt: { gte: start, lt: end } },
    ],
  };
}

export function manualGrantRevenueWhere(start: Date, end: Date): Prisma.BankDepositNotificationWhereInput {
  return {
    status: "MANUAL_GRANT",
    OR: [
      { occurredAt: { gte: start, lt: end } },
      { occurredAt: null, receivedAt: { gte: start, lt: end } },
    ],
  };
}

/** 구독 결제 매출 인식 시각 */
export function subscriptionPaidAt(p: { paidAt: Date | null; completedAt: Date | null }): Date | null {
  return p.paidAt ?? p.completedAt;
}

/** 무통장 수동지급 매출 인식 시각 */
export function manualGrantAt(g: { occurredAt: Date | null; receivedAt: Date }): Date {
  return g.occurredAt ?? g.receivedAt;
}

/**
 * [start, end) 구간 매출 합계.
 *
 * 합계만 필요한데도 결제 행 전체를 findMany 로 끌어오던 것을 DB 집계로 바꿨다(리포트 9종 중
 * 개요만 3초대였던 원인 중 하나). 금액 규칙은 그대로다 — 「paidAmount 가 있으면 그것, 없으면
 * price/amount」라 **paidAmount 유무로 쿼리를 둘로 갈라 각각 _sum** 한다(COALESCE 를 SQL 로
 * 직접 쓰면 topUp*Where 헬퍼의 조건이 갈라져 단일 진실원이 깨진다).
 * topUpCount/refundCount 는 두 갈래 _count 의 합 — findMany 시절의 행 수와 정확히 같다.
 */
export async function sumRevenue(start: Date, end: Date): Promise<RevenueBreakdown> {
  const grossWhere = topUpGrossWhere(start, end);
  const refundWhere = topUpRefundWhere(start, end);
  const subsWhere = subscriptionRevenueWhere(start, end);

  const [grossPaid, grossPrice, refundPaid, refundPrice, subsPaid, subsBase, grants] = await Promise.all([
    prisma.creditTopUp.aggregate({
      where: { ...grossWhere, paidAmount: { not: null } },
      _sum: { paidAmount: true },
      _count: true,
    }),
    prisma.creditTopUp.aggregate({
      where: { ...grossWhere, paidAmount: null },
      _sum: { price: true },
      _count: true,
    }),
    prisma.creditTopUp.aggregate({
      where: { ...refundWhere, paidAmount: { not: null } },
      _sum: { paidAmount: true },
      _count: true,
    }),
    prisma.creditTopUp.aggregate({
      where: { ...refundWhere, paidAmount: null },
      _sum: { price: true },
      _count: true,
    }),
    prisma.subscriptionPayment.aggregate({
      where: { ...subsWhere, paidAmount: { not: null } },
      _sum: { paidAmount: true },
    }),
    prisma.subscriptionPayment.aggregate({
      where: { ...subsWhere, paidAmount: null },
      _sum: { amount: true },
    }),
    prisma.bankDepositNotification.aggregate({
      where: manualGrantRevenueWhere(start, end),
      _sum: { amount: true },
    }),
  ]);

  const topUpGross = (grossPaid._sum.paidAmount ?? 0) + (grossPrice._sum.price ?? 0);
  const topUpRefunds = (refundPaid._sum.paidAmount ?? 0) + (refundPrice._sum.price ?? 0);
  const subscription = (subsPaid._sum.paidAmount ?? 0) + (subsBase._sum.amount ?? 0);
  const manualGrant = grants._sum.amount ?? 0;
  return {
    topUpGross,
    topUpRefunds,
    subscription,
    manualGrant,
    net: topUpGross - topUpRefunds + subscription + manualGrant,
    topUpCount: grossPaid._count + grossPrice._count,
    refundCount: refundPaid._count + refundPrice._count,
  };
}
