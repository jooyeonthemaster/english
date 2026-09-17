import { prisma } from "@/lib/prisma";
import type { DashboardDetail } from "@/lib/admin-dashboard-detail-types";
import { kstDateTime, nameOf, num, won } from "./format";

// 매출 상세 — 대시보드 합산(getDashboardOverview)과 같은 기준을 쓴다:
// 충전 COMPLETED(completedAt) + 구독 PAID(paidAt) + 수동지급 입금(receivedAt).

const METHOD_LABELS: Record<string, string> = {
  CARD: "카드",
  BANK_TRANSFER: "무통장",
  EASY_PAY: "간편결제",
  TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
};

export type RevenueRow = {
  at: Date;
  academy: string;
  kind: string;
  detail: string;
  amount: number;
};

export async function loadRevenueRows(start: Date, end?: Date): Promise<RevenueRow[]> {
  const range = end ? { gte: start, lt: end } : { gte: start };
  const [topUps, subs, grants] = await Promise.all([
    prisma.creditTopUp.findMany({
      where: { status: "COMPLETED", completedAt: range },
      select: {
        completedAt: true,
        price: true,
        creditAmount: true,
        paymentMethod: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.subscriptionPayment.findMany({
      where: { status: "PAID", paidAt: range },
      select: { paidAt: true, amount: true, orderName: true, academyId: true },
    }),
    prisma.bankDepositNotification.findMany({
      where: { status: "MANUAL_GRANT", receivedAt: range },
      select: { receivedAt: true, amount: true, depositorName: true },
    }),
  ]);

  const subAcademies = await academyNames(subs.map((s) => s.academyId));

  const rows: RevenueRow[] = [
    ...topUps.map((t) => ({
      at: t.completedAt!,
      academy: t.academy.name,
      kind: "충전",
      detail: `${num(t.creditAmount)}C · ${METHOD_LABELS[t.paymentMethod ?? ""] ?? t.paymentMethod ?? "—"}`,
      amount: t.price,
    })),
    ...subs.map((s) => ({
      at: s.paidAt!,
      academy: nameOf(subAcademies, s.academyId),
      kind: "구독",
      detail: s.orderName,
      amount: s.amount,
    })),
    ...grants.map((g) => ({
      at: g.receivedAt,
      academy: g.depositorName ? `입금자 ${g.depositorName}` : "—",
      kind: "수동지급",
      detail: "무통장 수동 처리",
      amount: g.amount,
    })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime());
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
