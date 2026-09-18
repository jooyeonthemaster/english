import { prisma } from "@/lib/prisma";
import type { DashboardDetail } from "@/lib/admin-dashboard-detail-types";
import { getTomorrowKST } from "@/lib/date-utils";
import { paymentMethodLabel } from "@/lib/admin-labels";
import {
  manualGrantAt,
  manualGrantRevenueWhere,
  subscriptionPaidAt,
  subscriptionRevenueWhere,
  topUpAmount,
  topUpGrossWhere,
  topUpPaidAt,
  topUpRefundWhere,
  topUpRefundedAt,
} from "@/lib/admin-revenue";
import { kstDateTime, nameOf, num, won } from "./format";

// 매출 상세 — 매출 정의는 src/lib/admin-revenue.ts 하나뿐이다(계약: docs/analytics/analytics-spec.md §9).
// 타일(getDashboardOverview → sumRevenue)과 이 상세는 **같은 조건 헬퍼·같은 기준 시각·같은 금액 규칙**을 쓴다:
//   충전 gross(COMPLETED+REFUNDED, paidAt→completedAt) − 충전 환불(REFUNDED, cancelledAt→updatedAt)
//   + 구독 PAID(paidAt→completedAt) + 무통장 수동지급(occurredAt→receivedAt)
// 환불은 「결제일의 매출을 지우는」 게 아니라 **환불일의 음수 행**으로 들어간다 — 그래야 행 합계가 타일과 같다.

export const REVENUE_KIND = {
  topUp: "충전",
  subscription: "구독",
  manualGrant: "수동지급",
  refund: "환불",
} as const;

export type RevenueRow = {
  at: Date;
  academy: string;
  kind: string;
  detail: string;
  amount: number;
};

/**
 * [start, end) 구간의 매출 구성 행. end 기본값은 타일과 같은 KST 내일 0시.
 * 금액 합계 = sumRevenue(start, end).net (환불 행이 음수라 그대로 더하면 순매출).
 */
export async function loadRevenueRows(start: Date, end: Date = getTomorrowKST()): Promise<RevenueRow[]> {
  const [topUps, refunds, subs, grants] = await Promise.all([
    prisma.creditTopUp.findMany({
      where: topUpGrossWhere(start, end),
      select: {
        status: true,
        paidAt: true,
        completedAt: true,
        createdAt: true,
        price: true,
        paidAmount: true,
        creditAmount: true,
        paymentMethod: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.creditTopUp.findMany({
      where: topUpRefundWhere(start, end),
      select: {
        cancelledAt: true,
        updatedAt: true,
        paidAt: true,
        completedAt: true,
        createdAt: true,
        price: true,
        paidAmount: true,
        creditAmount: true,
        paymentMethod: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.subscriptionPayment.findMany({
      where: subscriptionRevenueWhere(start, end),
      select: {
        paidAt: true,
        completedAt: true,
        amount: true,
        paidAmount: true,
        orderName: true,
        academyId: true,
      },
    }),
    prisma.bankDepositNotification.findMany({
      where: manualGrantRevenueWhere(start, end),
      select: { occurredAt: true, receivedAt: true, amount: true, depositorName: true },
    }),
  ]);

  const subAcademies = await academyNames(subs.map((s) => s.academyId));

  const rows: RevenueRow[] = [
    ...topUps.map((t) => ({
      at: topUpPaidAt(t) ?? t.createdAt,
      academy: t.academy.name,
      kind: REVENUE_KIND.topUp,
      detail:
        `${num(t.creditAmount)}C · ${paymentMethodLabel(t.paymentMethod)}` +
        (t.status === "REFUNDED" ? " · 이후 환불됨" : ""),
      amount: topUpAmount(t),
    })),
    ...refunds.map((t) => ({
      at: topUpRefundedAt(t),
      academy: t.academy.name,
      kind: REVENUE_KIND.refund,
      detail: `${num(t.creditAmount)}C 환불 · 결제 ${kstDateTime(topUpPaidAt(t) ?? t.createdAt)}`,
      amount: -topUpAmount(t),
    })),
    ...subs.flatMap((s) => {
      const at = subscriptionPaidAt(s);
      return at
        ? [{
            at,
            academy: nameOf(subAcademies, s.academyId),
            kind: REVENUE_KIND.subscription,
            detail: s.orderName,
            amount: s.paidAmount ?? s.amount,
          }]
        : [];
    }),
    ...grants.map((g) => ({
      at: manualGrantAt(g),
      academy: g.depositorName ? `입금자 ${g.depositorName}` : "—",
      kind: REVENUE_KIND.manualGrant,
      detail: "무통장 수동 처리",
      amount: g.amount,
    })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** 결제 건수(환불 행 제외). 환불이 있으면 같은 칸에 덧붙여 순매출이 왜 줄었는지 보이게 한다. */
export function revenueCountLabel(rows: RevenueRow[]): string {
  const refunds = rows.filter((r) => r.kind === REVENUE_KIND.refund).length;
  const payments = rows.length - refunds;
  return `${num(payments)}건${refunds > 0 ? ` · 환불 ${num(refunds)}건` : ""}`;
}

export function revenueSection(rows: RevenueRow[]): DashboardDetail["sections"][number] {
  return {
    title: "결제 내역",
    columns: [
      { key: "at", label: "시각" },
      { key: "academy", label: "학원" },
      { key: "kind", label: "구분" },
      { key: "detail", label: "내용", wide: true },
      { key: "amount", label: "금액", align: "right" },
    ],
    rows: rows.map((r) => ({
      at: kstDateTime(r.at),
      academy: r.academy,
      kind: r.kind,
      detail: r.detail,
      amount: won(r.amount),
    })),
    emptyText: "결제 내역이 없습니다",
  };
}

export function revenueByKind(rows: RevenueRow[]) {
  const totals = new Map<string, { count: number; amount: number }>();
  for (const r of rows) {
    const t = totals.get(r.kind) ?? { count: 0, amount: 0 };
    t.count += 1;
    t.amount += r.amount;
    totals.set(r.kind, t);
  }
  return totals;
}

export async function academyNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const rows = await prisma.academy.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}
