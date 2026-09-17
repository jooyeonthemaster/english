import type {
  CostBucket,
  CostSourceSummary,
  CreditOperationSummary,
  OperationsCostDashboard,
} from "@/actions/admin/operations-cost-types";
import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatCurrency as won, formatNumber as num } from "@/lib/utils";

// 원가 분석 페이지(서버 컴포넌트)가 이미 불러온 대시보드 데이터로 호버·팝업 상세를 만든다.
// 추가 조회 없음 — 카드·행에 보이지 않는 값과 계산 근거 위주로 담는다.

type Dashboard = OperationsCostDashboard;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pct = (value: number) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "0.0%");
const share = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
const usd = (value: number) => `$${value.toFixed(4)}`;

function kstDate(ms: number) {
  const d = new Date(ms + KST_OFFSET_MS);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join(".");
}
const isoDate = (iso: string | null) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? kstDate(ms) : null;
};
/** 반열림 종료 시각 → 포함 종료일 */
const isoInclusiveEnd = (iso: string) => {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? kstDate(ms - 1) : "-";
};

const bucketColumns = [
  { key: "label", label: "기간" },
  { key: "revenue", label: "매출", align: "right" as const },
  { key: "cost", label: "원가", align: "right" as const },
  { key: "profit", label: "손익", align: "right" as const },
  { key: "margin", label: "마진", align: "right" as const },
];
const bucketRow = (b: CostBucket) => ({
  label: b.label,
  revenue: won(b.revenueKrw),
  cost: won(b.totalCostKrw),
  profit: won(b.profitKrw),
  margin: pct(b.marginPercent),
});
/** 최신 기간이 위로 오도록 */
const newestFirst = (buckets: CostBucket[]) => [...buckets].reverse();

// ─── 손익 대시보드 상단 카드 ─────────────────────────────────────────────

export function profitCardDetail(d: Dashboard): AdminDetail {
  const c = d.current;
  return {
    title: `${d.summaryLabel} 손익`,
    subtitle: `매출 − API 원가 − 고정비 · 추이는 ${d.rangeLabel}`,
    summary: [
      { label: "손익", value: won(c.profitKrw) },
      { label: "마진", value: pct(c.marginPercent) },
    ],
    fields: detailFields([
      ["매출", won(c.revenueKrw)],
      ["API 변동원가", `− ${won(c.variableCostKrw)}`],
      ["고정비(일할)", `− ${won(c.fixedCostKrw)}`],
      ["총원가", won(c.totalCostKrw)],
      ["소모 크레딧(순)", `${num(c.creditsConsumed)}C`],
      [
        "매출 대비 API 원가",
        c.revenueKrw > 0 && share(c.variableCostKrw, c.revenueKrw),
      ],
    ]),
    sections: [
      {
        title: "기간별 추이",
        columns: bucketColumns,
        rows: newestFirst(d.buckets).map(bucketRow),
      },
    ],
  };
}

export function costCardSummary(d: Dashboard) {
  const c = d.current;
  return [
    { label: "API 변동원가", value: won(c.variableCostKrw) },
    { label: "고정비(일할)", value: won(c.fixedCostKrw) },
    { label: "총원가", value: won(c.totalCostKrw) },
  ];
}

export function apiCardSummary(d: Dashboard) {
  const c = d.current;
  return [
    { label: "호출", value: `${num(c.apiCalls)}회` },
    { label: "입력 토큰", value: num(c.inputTokens) },
    { label: "출력 토큰", value: num(c.outputTokens) },
    ...(c.unpricedCalls > 0 ? [{ label: "미단가 호출", value: `${num(c.unpricedCalls)}회` }] : []),
  ];
}

export function revenueCardSummary(d: Dashboard) {
  return [
    { label: "매출", value: won(d.current.revenueKrw) },
    {
      label: `활성 구독 ${num(d.activeSubscriptions.count)}개 MRR`,
      value: won(d.activeSubscriptions.estimatedMrrKrw),
    },
  ];
}

// ─── 일별/월별 손익 표 행 ───────────────────────────────────────────────

export function bucketRowDetail(b: CostBucket): AdminDetail {
  return {
    title: `${b.label} 손익`,
    subtitle: "원가 = API 변동원가 + 고정비(일할)",
    fields: detailFields([
      ["매출", won(b.revenueKrw)],
      ["API 변동원가", won(b.variableCostKrw)],
      ["고정비(일할)", won(b.fixedCostKrw)],
      ["총원가", won(b.totalCostKrw)],
      ["손익", won(b.profitKrw)],
      ["마진", pct(b.marginPercent)],
      ["API 호출", `${num(b.apiCalls)}회`],
      ["미단가 호출(0원 처리)", b.unpricedCalls > 0 && `${num(b.unpricedCalls)}회`],
      ["입력 토큰", num(b.inputTokens)],
      ["출력 토큰", num(b.outputTokens)],
      ["소모 크레딧(순)", `${num(b.creditsConsumed)}C`],
      ["호출당 평균 원가", b.apiCalls > 0 && won(b.variableCostKrw / b.apiCalls)],
    ]),
  };
}

// ─── 원가 구성 목록 행 ──────────────────────────────────────────────────

export function sourceRowDetail(s: CostSourceSummary, variableCostKrw: number): AdminDetail {
  const tokens = s.inputTokens + s.outputTokens;
  const pricedCalls = s.calls - s.recordedCalls - s.estimatedCalls - s.unpricedCalls;
  return {
    title: s.label,
    subtitle: "원가 구성 · 선택 기간",
    fields: detailFields([
      ["원가", won(s.costKrw)],
      ["USD", usd(s.costUsd)],
      ["변동원가 중 비중", share(s.costKrw, variableCostKrw)],
      ["호출", `${num(s.calls)}회`],
      ["실측 청구 반영", s.recordedCalls > 0 && `${num(s.recordedCalls)}회`],
      ["등록 단가 반영", pricedCalls > 0 && `${num(pricedCalls)}회`],
      ["추정 단가 반영", s.estimatedCalls > 0 && `${num(s.estimatedCalls)}회`],
      ["단가 미설정(0원)", s.unpricedCalls > 0 && `${num(s.unpricedCalls)}회`],
      ["입력 토큰", num(s.inputTokens)],
      ["출력 토큰", num(s.outputTokens)],
      [
        "미단가 토큰",
        s.unpricedCalls > 0 &&
          `입력 ${num(s.unpricedInputTokens)} · 출력 ${num(s.unpricedOutputTokens)}`,
      ],
      ["호출당 평균 원가", s.calls > 0 && won(s.costKrw / s.calls)],
      ["1K 토큰당 원가", tokens > 0 && won((s.costKrw / tokens) * 1000)],
    ]),
  };
}

// ─── 크레딧 사용 표 행 ──────────────────────────────────────────────────

export function creditOperationDetail(
  op: CreditOperationSummary,
  all: CreditOperationSummary[],
): AdminDetail {
  const total = all.reduce((sum, item) => sum + item.credits, 0);
  return {
    title: op.label,
    subtitle: "크레딧 사용 · 환불 반영 후 순사용량",
    fields: detailFields([
      ["작업 코드", op.operationType],
      ["순사용 크레딧", `${num(op.credits)}C`],
      ["거래", `${num(op.transactionCount)}건`],
      ["거래당 평균", op.transactionCount > 0 && `${(op.credits / op.transactionCount).toFixed(1)}C`],
      ["전체 사용 중 비중", share(op.credits, total)],
      ["기간 전체 순사용", `${num(total)}C`],
    ]),
  };
}

// ─── 추적 현황 카드 ─────────────────────────────────────────────────────

export function trackingStatDetails(d: Dashboard, fixedMonthlyNote: string) {
  const u = d.untracked;
  const t = d.totals;
  const workbench: AdminDetail = {
    title: "워크벤치 작업",
    subtitle: `${d.summaryLabel} · 완료·부분완료·실패 작업`,
    fields: detailFields([
      ["작업 수", `${num(u.workbenchJobs)}건`],
      ["차감 크레딧", `${num(u.workbenchCredits)}C`],
      ["작업당 평균", u.workbenchJobs > 0 && `${(u.workbenchCredits / u.workbenchJobs).toFixed(1)}C`],
      [
        "집계 기준",
        "크레딧은 워크벤치 작업에 연결된 소모 거래 합계, API 원가는 토큰 원장(원가 구성)에서 별도 집계",
        true,
      ],
    ]),
  };
  const direct: AdminDetail = {
    title: "직접 호출",
    subtitle: `${d.summaryLabel} · 워크벤치 외 크레딧 소모 거래`,
    fields: detailFields([
      ["거래 수", `${num(u.directCreditTransactions)}건`],
      ["차감 크레딧", `${num(u.directCredits)}C`],
      [
        "거래당 평균",
        u.directCreditTransactions > 0 &&
          `${(u.directCredits / u.directCreditTransactions).toFixed(1)}C`,
      ],
      [
        "제외 항목",
        "워크벤치 작업 · 텍스트 추출 · 웹툰 이미지(웹툰 원장에서 별도 집계)",
        true,
      ],
    ]),
  };
  const windowFields = (extra: Parameters<typeof detailFields>[0]) =>
    detailFields([
      ...extra,
      ["API 변동원가", won(t.variableCostKrw)],
      ["고정비", won(t.fixedCostKrw)],
      ["총원가", won(t.totalCostKrw)],
      ["API 호출", `${num(t.apiCalls)}회`],
      ["미단가 호출", t.unpricedCalls > 0 && `${num(t.unpricedCalls)}회`],
      ["입력·출력 토큰", `${num(t.inputTokens)} · ${num(t.outputTokens)}`],
      ["소모 크레딧(순)", `${num(t.creditsConsumed)}C`],
      ["고정비 기준", fixedMonthlyNote],
    ]);
  const revenue: AdminDetail = {
    title: "총 매출",
    subtitle: `${d.rangeLabel} 전체 구간`,
    summary: [{ label: "총 매출", value: won(t.revenueKrw) }],
    fields: windowFields([["손익", won(t.profitKrw)]]),
    sections: [{ title: "기간별 매출", columns: bucketColumns, rows: newestFirst(d.buckets).map(bucketRow) }],
  };
  const profit: AdminDetail = {
    title: "총 손익",
    subtitle: `${d.rangeLabel} 전체 구간`,
    summary: [
      { label: "총 손익", value: won(t.profitKrw) },
      { label: "마진", value: pct(t.marginPercent) },
    ],
    fields: windowFields([["총 매출", won(t.revenueKrw)]]),
    sections: [{ title: "기간별 손익", columns: bucketColumns, rows: newestFirst(d.buckets).map(bucketRow) }],
  };
  return { workbench, direct, revenue, profit };
}

// ─── 정산·단가 화면 ─────────────────────────────────────────────────────

export function reconciliationStatDetail(d: Dashboard): AdminDetail {
  const r = d.billingReconciliation;
  const t = d.totals;
  return {
    title: "청구 정산 계산",
    subtitle: `${d.rangeLabel} 전체 구간 기준 · 청구 기간이 겹치는 비율만큼 안분`,
    summary: [
      { label: "정산 차이", value: won(r.adjustmentKrw) },
      { label: "정산 손익", value: won(r.actualProfitKrw) },
    ],
    fields: detailFields([
      ["예상 API(매칭 원장)", `${won(r.estimatedCostKrw)} · ${usd(r.estimatedCostUsd)}`],
      ["실제 청구(안분)", `${won(r.actualCostKrw)} · ${usd(r.actualCostUsd)}`],
      ["정산 차이", `${won(r.adjustmentKrw)} (실제 − 예상)`],
      ["추정 변동원가", won(t.variableCostKrw)],
      ["정산 변동원가", won(r.actualVariableCostKrw)],
      ["고정비", won(t.fixedCostKrw)],
      ["정산 총원가", won(r.actualTotalCostKrw)],
      ["추정 손익", won(t.profitKrw)],
      ["정산 손익", `${won(r.actualProfitKrw)} (추정 손익 − 정산 차이)`],
      ["반영된 청구 건", `${num(r.rows.length)}건`],
    ]),
    sections: [
      {
        title: "공급자별 청구",
        columns: [
          { key: "provider", label: "공급자" },
          { key: "actual", label: "실제", align: "right" },
          { key: "estimated", label: "예상", align: "right" },
          { key: "delta", label: "차이", align: "right" },
        ],
        rows: groupByProvider(r.rows),
        emptyText: "선택 기간에 반영된 실제 청구액이 없습니다",
      },
    ],
  };
}

function groupByProvider(rows: Dashboard["billingReconciliation"]["rows"]) {
  const map = new Map<string, { actual: number; estimated: number; delta: number }>();
  for (const row of rows) {
    const g = map.get(row.provider) ?? { actual: 0, estimated: 0, delta: 0 };
    g.actual += row.actualCostKrw;
    g.estimated += row.estimatedCostKrw;
    g.delta += row.deltaKrw;
    map.set(row.provider, g);
  }
  return [...map.entries()].map(([provider, g]) => ({
    provider,
    actual: won(g.actual),
    estimated: won(g.estimated),
    delta: won(g.delta),
  }));
}

export function reconciliationRowDetail(
  row: Dashboard["billingReconciliation"]["rows"][number],
): AdminDetail {
  return {
    title: `${row.provider} 청구`,
    subtitle: `${isoDate(row.periodStart) ?? "-"} - ${isoInclusiveEnd(row.periodEnd)}`,
    fields: detailFields([
      ["공급자", row.provider],
      ["단위", row.unitType ?? "ALL"],
      ["모델 패턴", row.modelPattern, true],
      ["출처", row.source],
      ["참조 ID", row.referenceId, true],
      ["실제 청구(기간 안분)", `${won(row.actualCostKrw)} · ${usd(row.actualCostUsd)}`],
      ["예상(매칭 원장)", `${won(row.estimatedCostKrw)} · ${usd(row.estimatedCostUsd)}`],
      ["차이", won(row.deltaKrw)],
      ["차이율", row.estimatedCostKrw > 0 && share(row.deltaKrw, row.estimatedCostKrw)],
      ["메모", row.notes, true],
    ]),
  };
}

export function pricingRowDetail(p: Dashboard["providerPricings"][number]): AdminDetail {
  const perUnitKrw = (v: number | null) => (v === null ? null : won(v * p.usdToKrwRate));
  return {
    title: `${p.provider}${p.modelPattern ? ` · ${p.modelPattern}` : ""}`,
    subtitle: `활성 단가 · ${p.unitType}`,
    fields: detailFields([
      ["공급자", p.provider],
      ["단위", p.unitType],
      ["모델 패턴", p.modelPattern ?? "전체", true],
      ["입력 $/1M", p.inputUsdPer1M !== null && `$${p.inputUsdPer1M} (${perUnitKrw(p.inputUsdPer1M)})`],
      ["출력 $/1M", p.outputUsdPer1M !== null && `$${p.outputUsdPer1M} (${perUnitKrw(p.outputUsdPer1M)})`],
      ["단위 $", p.unitUsd !== null && `$${p.unitUsd} (${perUnitKrw(p.unitUsd)})`],
      ["환율", `${num(p.usdToKrwRate)}원`],
      ["적용 시작", isoDate(p.effectiveFrom)],
      ["적용 종료", isoDate(p.effectiveTo) ?? "계속 적용"],
      ["메모", p.notes, true],
    ]),
  };
}
