import { prisma } from "@/lib/prisma";
import type { DashboardDetail } from "@/lib/admin-dashboard-detail-types";
import { getMonthStartKST, getTodayKST, getYesterdayKST } from "@/lib/date-utils";
import { getProviderLabel } from "@/lib/admin-members-labels";
import { academyNames, loadRevenueRows, revenueByKind, revenueSection } from "./revenue";
import { kstDayRange, kstTime, nameOf, num, won } from "./format";

// 매출·원가·마진 + 추이 그래프 하루치 상세.

function kindSection(rows: Awaited<ReturnType<typeof loadRevenueRows>>) {
  return {
    title: "구분별",
    columns: [
      { key: "kind", label: "구분" },
      { key: "count", label: "건수", align: "right" as const },
      { key: "amount", label: "금액", align: "right" as const },
    ],
    rows: [...revenueByKind(rows)].map(([kind, t]) => ({
      kind,
      count: `${num(t.count)}건`,
      amount: won(t.amount),
    })),
    emptyText: "매출이 없습니다",
  };
}

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

export async function revenueTodayDetail(): Promise<DashboardDetail> {
  const todayStart = getTodayKST();
  const [today, yesterday] = await Promise.all([
    loadRevenueRows(todayStart),
    loadRevenueRows(getYesterdayKST(), todayStart),
  ]);
  return {
    title: "오늘 매출",
    summary: [
      { label: "오늘", value: won(sum(today)) },
      { label: "건수", value: `${num(today.length)}건` },
      { label: "어제", value: won(sum(yesterday)) },
    ],
    sections: [revenueSection(today)],
    link: { label: "결제 관리로 이동", href: "/admin/credit-plans" },
  };
}

export async function monthRevenueDetail(): Promise<DashboardDetail> {
  const rows = await loadRevenueRows(getMonthStartKST());
  return {
    title: "이번 달 매출",
    summary: [
      { label: "매출", value: won(sum(rows)) },
      { label: "건수", value: `${num(rows.length)}건` },
    ],
    sections: [kindSection(rows), revenueSection(rows)],
    link: { label: "원가·매출 분석으로 이동", href: "/admin/costs" },
  };
}

async function loadMonthCost() {
  const monthStart = getMonthStartKST();
  const where = { usageAt: { gte: monthStart } };
  const [byModel, byAcademy, total] = await Promise.all([
    prisma.platformApiUsageCost.groupBy({
      by: ["provider", "model"],
      where,
      _sum: { costKrw: true, calls: true },
    }),
    prisma.platformApiUsageCost.groupBy({
      by: ["academyId"],
      where,
      _sum: { costKrw: true, calls: true },
    }),
    prisma.platformApiUsageCost.aggregate({ where, _sum: { costKrw: true } }),
  ]);
  return { byModel, byAcademy, total: total._sum.costKrw ?? 0 };
}

function modelSection(byModel: Awaited<ReturnType<typeof loadMonthCost>>["byModel"]) {
  return {
    title: "제공사·모델별",
    columns: [
      { key: "model", label: "모델", wide: true },
      { key: "calls", label: "호출", align: "right" as const },
      { key: "cost", label: "원가", align: "right" as const },
    ],
    rows: byModel
      .sort((a, b) => (b._sum.costKrw ?? 0) - (a._sum.costKrw ?? 0))
      .map((r) => ({
        model: `${getProviderLabel(r.provider)} · ${r.model ?? "—"}`,
        calls: `${num(r._sum.calls ?? 0)}회`,
        cost: won(r._sum.costKrw ?? 0),
      })),
    emptyText: "이번 달 AI 사용 기록이 없습니다",
  };
}

export async function monthAiCostDetail(): Promise<DashboardDetail> {
  const cost = await loadMonthCost();
  const names = await academyNames(cost.byAcademy.map((r) => r.academyId ?? ""));
  return {
    title: "이번 달 AI 원가",
    summary: [{ label: "원가", value: won(cost.total) }],
    sections: [
      modelSection(cost.byModel),
      {
        title: "학원별",
        columns: [
          { key: "academy", label: "학원" },
          { key: "calls", label: "호출", align: "right" },
          { key: "cost", label: "원가", align: "right" },
        ],
        rows: cost.byAcademy
          .sort((a, b) => (b._sum.costKrw ?? 0) - (a._sum.costKrw ?? 0))
          .map((r) => ({
            academy: r.academyId ? nameOf(names, r.academyId) : "플랫폼 공용",
            calls: `${num(r._sum.calls ?? 0)}회`,
            cost: won(r._sum.costKrw ?? 0),
          })),
      },
    ],
    link: { label: "원가·매출 분석으로 이동", href: "/admin/costs" },
  };
}

export async function monthMarginDetail(): Promise<DashboardDetail> {
  const [rows, cost] = await Promise.all([loadRevenueRows(getMonthStartKST()), loadMonthCost()]);
  const revenue = sum(rows);
  const margin = revenue - cost.total;
  return {
    title: "이번 달 마진",
    subtitle: "매출 − AI 원가",
    summary: [
      { label: "매출", value: won(revenue) },
      { label: "AI 원가", value: won(cost.total) },
      { label: "마진", value: won(margin) },
      { label: "마진율", value: revenue > 0 ? `${Math.round((margin / revenue) * 100)}%` : "—" },
    ],
    sections: [kindSection(rows), modelSection(cost.byModel)],
    link: { label: "원가·매출 분석으로 이동", href: "/admin/costs" },
  };
}

export async function trendDayDetail(dateKey: string): Promise<DashboardDetail> {
  const range = kstDayRange(dateKey);
  if (!range) throw new Error("잘못된 날짜입니다.");
  const [rows, signups] = await Promise.all([
    loadRevenueRows(range.start, range.end),
    prisma.academy.findMany({
      where: { createdAt: { gte: range.start, lt: range.end } },
      orderBy: { createdAt: "asc" },
      select: { name: true, createdAt: true },
    }),
  ]);
  return {
    title: `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)} 매출·가입`,
    summary: [
      { label: "매출", value: won(sum(rows)) },
      { label: "결제", value: `${num(rows.length)}건` },
      { label: "신규 가입", value: `${num(signups.length)}곳` },
    ],
    sections: [
      revenueSection(rows),
      {
        title: "신규 가입 학원",
        columns: [
          { key: "at", label: "가입" },
          { key: "name", label: "학원" },
        ],
        rows: signups.map((s) => ({ at: kstTime(s.createdAt), name: s.name })),
        emptyText: "가입한 학원이 없습니다",
      },
    ],
  };
}
