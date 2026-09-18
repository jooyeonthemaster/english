import { prisma } from "@/lib/prisma";
import type { AdminDetail } from "@/lib/admin-detail-types";
import { kstDateTime, num, won } from "@/lib/admin-dashboard-detail/format";
import { bucketKeyForDate, buildRange } from "@/actions/admin/operations-cost-datetime";
import type { CostPeriodMode, OperationsCostOptions } from "@/actions/admin/operations-cost-types";

// 원가 분석(손익 대시보드) 지표 카드 상세. 카드 숫자(getOperationsCostDashboard)와 같은
// 기간 계산(buildRange)·버킷 판정(bucketKeyForDate)·조회 조건을 그대로 쓴다.
// 요약 모드(일·월 단일 선택)면 선택한 날/월 버킷만, 기간 지정이면 전체 구간을 집계한다.

export type CostsBlockKey = "revenue" | "cost" | "api";

export type CostsBlockParams = {
  mode: CostPeriodMode;
  options: OperationsCostOptions;
};

const LIST_TAKE = 100;

const PRICING_SOURCE_LABELS: Record<string, string> = {
  RECORDED: "실측 청구",
  DB: "등록 단가",
  ENV: "환경변수 단가",
  ESTIMATE: "추정 단가",
  MISSING: "단가 미설정",
};

const METHOD_LABELS: Record<string, string> = {
  CARD: "카드",
  BANK_TRANSFER: "무통장",
  EASY_PAY: "간편결제",
  TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
  MOBILE: "휴대폰",
};

function scopeFor({ mode, options }: CostsBlockParams) {
  const normalizedMode: CostPeriodMode = mode === "monthly" ? "monthly" : "daily";
  const range = buildRange(normalizedMode, options);
  const bucketKeys = new Set(range.buckets.map((b) => b.key));
  // 대시보드의 isInSummaryScope 와 같은 판정(+버킷 밖 행 제외)
  const inScope = (date: Date | null) => {
    const key = bucketKeyForDate(date, normalizedMode);
    if (!bucketKeys.has(key)) return false;
    return range.summaryMode === "range" || key === range.summaryKey;
  };
  return { range, inScope };
}

const share = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";

export async function costsBlockDetail(
  key: CostsBlockKey,
  params: CostsBlockParams,
): Promise<AdminDetail> {
  switch (key) {
    case "revenue":
      return revenueDetail(params);
    case "cost":
    case "api":
      return apiUsageDetail(key, params);
  }
}

async function revenueDetail(params: CostsBlockParams): Promise<AdminDetail> {
  const { range, inScope } = scopeFor(params);
  const [subscriptionPayments, creditTopUps, manualGrants] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      where: {
        status: "PAID",
        OR: [
          { paidAt: { gte: range.start, lt: range.end } },
          { paidAt: null, completedAt: { gte: range.start, lt: range.end } },
        ],
      },
      select: {
        amount: true,
        paidAmount: true,
        paidAt: true,
        completedAt: true,
        orderName: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.creditTopUp.findMany({
      where: {
        status: "COMPLETED",
        OR: [
          { paidAt: { gte: range.start, lt: range.end } },
          { paidAt: null, completedAt: { gte: range.start, lt: range.end } },
        ],
      },
      select: {
        price: true,
        paidAmount: true,
        paidAt: true,
        completedAt: true,
        creditAmount: true,
        paymentMethod: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.bankDepositNotification.findMany({
      where: {
        status: "MANUAL_GRANT",
        OR: [
          { occurredAt: { gte: range.start, lt: range.end } },
          { occurredAt: null, receivedAt: { gte: range.start, lt: range.end } },
        ],
      },
      select: { amount: true, occurredAt: true, receivedAt: true, depositorName: true, note: true },
    }),
  ]);

  type Line = { at: Date; kind: string; who: string; item: string; amount: number };
  const lines: Line[] = [];
  for (const p of subscriptionPayments) {
    const at = p.paidAt ?? p.completedAt;
    if (!at || !inScope(at)) continue;
    lines.push({
      at,
      kind: "구독 결제",
      who: p.academy.name,
      item: p.orderName,
      amount: p.paidAmount ?? p.amount,
    });
  }
  for (const t of creditTopUps) {
    const at = t.paidAt ?? t.completedAt;
    if (!at || !inScope(at)) continue;
    const method = t.paymentMethod ? (METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod) : "—";
    lines.push({
      at,
      kind: "크레딧 충전",
      who: t.academy.name,
      item: `${num(t.creditAmount)}C · ${method}`,
      amount: t.paidAmount ?? t.price,
    });
  }
  for (const g of manualGrants) {
    const at = g.occurredAt ?? g.receivedAt;
    if (!inScope(at)) continue;
    lines.push({
      at,
      kind: "무통장 수동지급",
      who: g.depositorName ?? "입금자 미상",
      item: g.note ?? "—",
      amount: g.amount,
    });
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const kinds = ["크레딧 충전", "구독 결제", "무통장 수동지급"].map((kind) => {
    const rows = lines.filter((l) => l.kind === kind);
    return { kind, count: rows.length, amount: rows.reduce((s, l) => s + l.amount, 0) };
  });
  const recent = [...lines].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, LIST_TAKE);

  return {
    title: "매출 구성",
    subtitle: `${range.summaryLabel} · 결제·입금 시각(KST) 기준`,
    summary: kinds
      .filter((k) => k.count > 0)
      .map((k) => ({ label: `${k.kind} ${num(k.count)}건`, value: won(k.amount) })),
    sections: [
      {
        title: "결제 종류별",
        columns: [
          { key: "kind", label: "종류" },
          { key: "count", label: "건수", align: "right" },
          { key: "amount", label: "금액", align: "right" },
          { key: "share", label: "비중", align: "right" },
        ],
        rows: kinds.map((k) => ({
          kind: k.kind,
          count: `${num(k.count)}건`,
          amount: won(k.amount),
          share: share(k.amount, total),
        })),
      },
      {
        title: lines.length > LIST_TAKE ? `결제 내역 (최근 ${LIST_TAKE}건)` : "결제 내역",
        columns: [
          { key: "at", label: "시각" },
          { key: "kind", label: "종류" },
          { key: "who", label: "학원·입금자" },
          { key: "item", label: "내용", wide: true },
          { key: "amount", label: "금액", align: "right" },
        ],
        rows: recent.map((l) => ({
          at: kstDateTime(l.at),
          kind: l.kind,
          who: l.who,
          item: l.item,
          amount: won(l.amount),
        })),
        emptyText: "이 기간 매출이 없습니다",
      },
    ],
  };
}

async function apiUsageDetail(
  key: "cost" | "api",
  params: CostsBlockParams,
): Promise<AdminDetail> {
  const { range, inScope } = scopeFor(params);
  const rows = await prisma.platformApiUsageCost.findMany({
    where: { usageAt: { gte: range.start, lt: range.end } },
    select: {
      usageAt: true,
      provider: true,
      model: true,
      unitType: true,
      calls: true,
      inputTokens: true,
      outputTokens: true,
      costUsd: true,
      costKrw: true,
      pricingSource: true,
    },
  });

  type ModelAgg = {
    label: string;
    calls: number;
    unpricedCalls: number;
    inputTokens: number;
    outputTokens: number;
    costKrw: number;
    costUsd: number;
    sources: Set<string>;
  };
  const byModel = new Map<string, ModelAgg>();
  const bySource = new Map<string, { calls: number; costKrw: number; costUsd: number }>();
  let totalCost = 0;
  let totalCalls = 0;

  for (const r of rows) {
    if (!inScope(r.usageAt)) continue;
    const label = `${r.provider} · ${r.unitType}${r.model ? ` · ${r.model}` : ""}`;
    const m =
      byModel.get(label) ??
      {
        label,
        calls: 0,
        unpricedCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costKrw: 0,
        costUsd: 0,
        sources: new Set<string>(),
      };
    m.calls += r.calls;
    if (r.pricingSource === "MISSING") m.unpricedCalls += r.calls;
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    m.costKrw += r.costKrw;
    m.costUsd += Number(r.costUsd);
    m.sources.add(PRICING_SOURCE_LABELS[r.pricingSource] ?? r.pricingSource);
    byModel.set(label, m);

    const s = bySource.get(r.pricingSource) ?? { calls: 0, costKrw: 0, costUsd: 0 };
    s.calls += r.calls;
    s.costKrw += r.costKrw;
    s.costUsd += Number(r.costUsd);
    bySource.set(r.pricingSource, s);

    totalCost += r.costKrw;
    totalCalls += r.calls;
  }

  const models = [...byModel.values()];
  const sourceSection = {
    title: "단가 근거별",
    columns: [
      { key: "source", label: "근거" },
      { key: "calls", label: "호출", align: "right" as const },
      { key: "cost", label: "원가", align: "right" as const },
      { key: "share", label: "원가 비중", align: "right" as const },
    ],
    rows: [...bySource.entries()]
      .sort((a, b) => b[1].costKrw - a[1].costKrw || b[1].calls - a[1].calls)
      .map(([source, s]) => ({
        source: PRICING_SOURCE_LABELS[source] ?? source,
        calls: `${num(s.calls)}회`,
        cost: won(s.costKrw),
        share: share(s.costKrw, totalCost),
      })),
  };

  if (key === "cost") {
    return {
      title: "API 원가 구성",
      subtitle: `${range.summaryLabel} · 공급자·모델별 변동원가`,
      sections: [
        {
          title: "공급자·모델별",
          columns: [
            { key: "model", label: "공급자 · 단위 · 모델", wide: true },
            { key: "calls", label: "호출", align: "right" },
            { key: "cost", label: "원가", align: "right" },
            { key: "usd", label: "USD", align: "right" },
            { key: "share", label: "비중", align: "right" },
            { key: "source", label: "단가 근거" },
          ],
          rows: models
            .sort((a, b) => b.costKrw - a.costKrw || b.calls - a.calls)
            .map((m) => ({
              model: m.label,
              calls: `${num(m.calls)}회`,
              cost: won(m.costKrw),
              usd: `$${m.costUsd.toFixed(4)}`,
              share: share(m.costKrw, totalCost),
              source: [...m.sources].join(", "),
            })),
          emptyText: "이 기간 API 원가가 없습니다",
        },
        sourceSection,
      ],
    };
  }

  return {
    title: "API 사용 구성",
    subtitle: `${range.summaryLabel} · 공급자·모델별 호출·토큰`,
    sections: [
      {
        title: "공급자·모델별",
        columns: [
          { key: "model", label: "공급자 · 단위 · 모델", wide: true },
          { key: "calls", label: "호출", align: "right" },
          { key: "share", label: "비중", align: "right" },
          { key: "input", label: "입력 토큰", align: "right" },
          { key: "output", label: "출력 토큰", align: "right" },
          { key: "unpriced", label: "미단가", align: "right" },
        ],
        rows: models
          .sort((a, b) => b.calls - a.calls || b.costKrw - a.costKrw)
          .map((m) => ({
            model: m.label,
            calls: `${num(m.calls)}회`,
            share: share(m.calls, totalCalls),
            input: num(m.inputTokens),
            output: num(m.outputTokens),
            unpriced: m.unpricedCalls > 0 ? `${num(m.unpricedCalls)}회` : "—",
          })),
        emptyText: "이 기간 API 호출이 없습니다",
      },
      sourceSection,
    ],
  };
}
