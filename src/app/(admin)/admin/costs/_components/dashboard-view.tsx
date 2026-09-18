"use client";

import { ArrowDownRight, ArrowUpRight, DatabaseZap, LineChart, ReceiptText } from "lucide-react";
import type { CostBucket, OperationsCostDashboard } from "@/actions/admin/operations-cost-types";
import { CostsAcademyUsageTable } from "@/components/admin/costs-academy-usage-table";
import { CostsLoadDetail } from "@/components/admin/costs-parts/costs-load-detail";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  DataTable,
  DataTableBody,
  DataTableHeader,
  SectionCard,
  StatGrid,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import type { CostsBlockParams } from "@/lib/admin-block-detail/costs";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import * as hoverDetail from "../_lib/costs-hover-detail";
import { formatBadgeDate, formatPercent, summaryMetricLabel } from "../_lib/costs-period";
import { CostSourcesCard } from "./cost-sources-card";
import { CreditUsageCard, TrackingCard } from "./credit-tracking-cards";
import { HoverStatCard } from "./hover-stat-card";

/**
 * 매출 카드 보조문구 — 구독 결제가 한 번도 없으면 예상 MRR 대신 사실만 적는다(F10).
 * activeSubscriptions 는 만료 전 ACTIVE 구독(월 요금 합 = 예상 MRR)이지만, 결제 이력이
 * 0건이면 그 합은 실현 매출이 아니라 「미결제 구독의 정가 합」일 뿐이다.
 */
function subscriptionSummaryText(
  active: OperationsCostDashboard["activeSubscriptions"],
  paidPaymentCount: number,
) {
  if (paidPaymentCount === 0) {
    return active.count > 0
      ? `구독 결제 0건 · 미결제 구독 ${formatNumber(active.count)}개`
      : "구독 결제 0건";
  }
  if (active.count === 0) return "활성 구독 없음";
  return `활성 구독 ${formatNumber(active.count)}개 · 예상 MRR ${formatCurrency(active.estimatedMrrKrw)}`;
}

/** 손익 대시보드 — 지표 카드 · 손익 추이 · 원가 구성 · 학원별 사용량 · 크레딧 사용 · 추적 현황 */
export function DashboardView({
  dashboard,
  detailParams,
  paidSubscriptionPayments,
}: {
  dashboard: OperationsCostDashboard;
  detailParams: CostsBlockParams;
  /** 구독 결제(PAID) 누적 건수 — 0이면 예상 MRR 을 표시하지 않는다(F10). */
  paidSubscriptionPayments: number;
}) {
  const mode = dashboard.mode;
  const hasProfit = dashboard.current.profitKrw >= 0;
  const ProfitIcon = hasProfit ? ArrowUpRight : ArrowDownRight;
  // 일별/월별 단일 선택이면 선택한 날/월만, 기간 지정이면 구간 안의 버킷 전부.
  const trendBuckets =
    dashboard.summaryMode === "bucket"
      ? dashboard.buckets.filter((bucket) => bucket.key === dashboard.current.key)
      : dashboard.buckets;
  const trendSubtitle =
    dashboard.summaryMode === "bucket" ? dashboard.summaryLabel : dashboard.rangeLabel;
  const metricLabel = (metric: string) =>
    summaryMetricLabel(dashboard.summaryMode, dashboard.summaryLabel, metric);
  const subscriptionSub = subscriptionSummaryText(
    dashboard.activeSubscriptions,
    paidSubscriptionPayments,
  );
  // 호버 요약도 같은 판정을 따른다 — 카드는 「구독 결제 0건」인데 호버는 MRR 을 말하면 모순이다.
  const revenueSummary =
    paidSubscriptionPayments > 0
      ? hoverDetail.revenueCardSummary(dashboard)
      : [
          { label: "매출", value: formatCurrency(dashboard.current.revenueKrw) },
          { label: "구독 결제", value: "0건" },
          ...(dashboard.activeSubscriptions.count > 0
            ? [
                {
                  label: "미결제 구독",
                  value: `${formatNumber(dashboard.activeSubscriptions.count)}개`,
                },
              ]
            : []),
        ];

  return (
    <>
      <StatGrid cols={4}>
        <HoverStatCard
          label={metricLabel("매출")}
          value={formatCurrency(dashboard.current.revenueKrw)}
          sub={subscriptionSub}
          icon={ReceiptText}
          tone="blue"
          load={(card) => (
            <CostsLoadDetail
              blockKey="revenue"
              params={detailParams}
              label="매출 구성"
              summary={revenueSummary}
            >
              {card}
            </CostsLoadDetail>
          )}
        />
        <HoverStatCard
          label={metricLabel("원가")}
          value={formatCurrency(dashboard.current.totalCostKrw)}
          sub={
            dashboard.current.unpricedCalls > 0
              ? `API ${formatCurrency(dashboard.current.variableCostKrw)} · ${formatNumber(dashboard.current.unpricedCalls)}회 미단가`
              : `API ${formatCurrency(dashboard.current.variableCostKrw)} · 고정 ${formatCurrency(dashboard.current.fixedCostKrw)}`
          }
          icon={DatabaseZap}
          tone="gray"
          load={(card) => (
            <CostsLoadDetail
              blockKey="cost"
              params={detailParams}
              label="API 원가 구성"
              summary={hoverDetail.costCardSummary(dashboard)}
            >
              {card}
            </CostsLoadDetail>
          )}
        />
        <HoverStatCard
          label={metricLabel("손익")}
          value={formatCurrency(dashboard.current.profitKrw)}
          sub={`마진 ${formatPercent(dashboard.current.marginPercent)}`}
          icon={ProfitIcon}
          tone={hasProfit ? "emerald" : "rose"}
          alert={!hasProfit}
          detail={hoverDetail.profitCardDetail(dashboard)}
        />
        <HoverStatCard
          label="API 사용"
          value={`${formatNumber(dashboard.current.apiCalls)}회`}
          sub={`${formatNumber(dashboard.current.inputTokens + dashboard.current.outputTokens)} tokens`}
          icon={LineChart}
          tone="violet"
          load={(card) => (
            <CostsLoadDetail
              blockKey="api"
              params={detailParams}
              label="API 사용 구성"
              summary={hoverDetail.apiCardSummary(dashboard)}
            >
              {card}
            </CostsLoadDetail>
          )}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title={mode === "daily" ? "일별 손익" : "월별 손익"}
          description={`${trendSubtitle} · KST 기준`}
          actions={<FxRateBadge fxRate={dashboard.fxRate} />}
          padded={false}
        >
          <DataTable bare>
            <DataTableHeader>
              <Tr>
                <Th>기간</Th>
                <Th align="right">매출</Th>
                <Th align="right">원가</Th>
                <Th align="right">손익</Th>
                <Th align="right">마진</Th>
                <Th align="right">API</Th>
              </Tr>
            </DataTableHeader>
            <DataTableBody>
              {trendBuckets.map((bucket) => (
                <CostBucketRow key={bucket.key} bucket={bucket} />
              ))}
            </DataTableBody>
          </DataTable>
        </SectionCard>

        <CostSourcesCard dashboard={dashboard} />
      </div>

      <CostsAcademyUsageTable
        key={`${dashboard.mode}-${dashboard.summaryMode}-${dashboard.summaryLabel}`}
        academies={dashboard.academyUsage}
        summaryLabel={dashboard.summaryLabel}
        variableCostKrw={dashboard.current.variableCostKrw}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CreditUsageCard dashboard={dashboard} />
        <TrackingCard dashboard={dashboard} />
      </div>
    </>
  );
}

/** 적용 환율 표시 — 전일 종가 기준 */
export function FxRateBadge({ fxRate }: { fxRate: OperationsCostDashboard["fxRate"] }) {
  return (
    <span
      title={`적용 환율 (전일 종가 기준) · 기준일 ${fxRate.date} · ${fxRate.source === "ECB" ? "ECB 기준환율" : "기본값"}`}
    >
      <StatusBadge
        status={{
          label: `USD ${formatNumber(fxRate.rate)}원 · 전일 ${formatBadgeDate(fxRate.date)}${fxRate.source !== "ECB" ? " (기본)" : ""}`,
          tone: "gray",
        }}
      />
    </span>
  );
}

function CostBucketRow({ bucket }: { bucket: CostBucket }) {
  const hasProfit = bucket.profitKrw >= 0;
  return (
    <AdminHoverDetail title={`${bucket.label} 손익`} detail={hoverDetail.bucketRowDetail(bucket)}>
      <Tr clickable>
        <Td className="font-medium text-gray-800">{bucket.label}</Td>
        <Td align="right" className="font-normal text-gray-700">
          {formatCurrency(bucket.revenueKrw)}
        </Td>
        <Td align="right" className="font-normal text-gray-700">
          {formatCurrency(bucket.totalCostKrw)}
        </Td>
        <Td align="right" className={cn("font-semibold", hasProfit ? "text-emerald-600" : "text-rose-600")}>
          {formatCurrency(bucket.profitKrw)}
        </Td>
        <Td align="right" className="font-normal text-gray-500">
          {formatPercent(bucket.marginPercent)}
        </Td>
        <Td align="right" className="font-normal text-gray-500">
          {formatNumber(bucket.apiCalls)}회
        </Td>
      </Tr>
    </AdminHoverDetail>
  );
}
