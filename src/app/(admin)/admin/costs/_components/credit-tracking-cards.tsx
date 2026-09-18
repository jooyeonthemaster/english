import { Coins, WalletCards } from "lucide-react";
import type { OperationsCostDashboard } from "@/actions/admin/operations-cost-types";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  SectionCard,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { formatCurrency, formatNumber } from "@/lib/utils";
import * as hoverDetail from "../_lib/costs-hover-detail";
import { formatPercent } from "../_lib/costs-period";
import { HoverStatCard } from "./hover-stat-card";

/** 크레딧 사용 — 작업 종류별 순사용량 표 */
export function CreditUsageCard({ dashboard }: { dashboard: OperationsCostDashboard }) {
  return (
    <SectionCard
      className="xl:col-span-2"
      title="크레딧 사용"
      description={`${dashboard.summaryLabel} · 환불 반영 후 순사용량`}
      icon={Coins}
      padded={false}
    >
      <DataTable bare>
        <DataTableHeader>
          <Tr>
            <Th>작업</Th>
            <Th align="right">크레딧</Th>
            <Th align="right">거래</Th>
          </Tr>
        </DataTableHeader>
        <DataTableBody>
          {dashboard.creditOperations.length === 0 ? (
            <DataTableEmpty colSpan={3}>
              <AdminEmptyState compact title="크레딧 사용 내역이 없습니다" />
            </DataTableEmpty>
          ) : (
            dashboard.creditOperations.map((operation) => (
              <AdminHoverDetail
                key={operation.operationType}
                title={operation.label}
                detail={hoverDetail.creditOperationDetail(operation, dashboard.creditOperations)}
              >
                <Tr clickable>
                  <Td className="font-medium text-gray-800">{operation.label}</Td>
                  <Td align="right" className="font-semibold">
                    {formatNumber(operation.credits)}C
                  </Td>
                  <Td align="right" className="font-normal text-gray-500">
                    {formatNumber(operation.transactionCount)}건
                  </Td>
                </Tr>
              </AdminHoverDetail>
            ))
          )}
        </DataTableBody>
      </DataTable>
    </SectionCard>
  );
}

/** 추적 현황 — 토큰 단위 원가 산정 범위 밖의 작업·거래와 기간 총계 */
export function TrackingCard({ dashboard }: { dashboard: OperationsCostDashboard }) {
  const details = hoverDetail.trackingStatDetails(
    dashboard,
    `월 ${formatCurrency(dashboard.pricing.fixedMonthlyCostKrw)} 일할`,
  );
  return (
    <SectionCard
      title="추적 현황"
      description={`${dashboard.summaryLabel} · 토큰 단위 원가 산정 범위`}
      padded={false}
    >
      <div className="grid grid-cols-2 gap-3 p-5">
        <HoverStatCard
          size="sm"
          label="워크벤치 작업"
          value={formatNumber(dashboard.untracked.workbenchJobs)}
          sub={`${formatNumber(dashboard.untracked.workbenchCredits)}C`}
          detail={details.workbench}
        />
        <HoverStatCard
          size="sm"
          label="직접 호출"
          value={formatNumber(dashboard.untracked.directCreditTransactions)}
          sub={`${formatNumber(dashboard.untracked.directCredits)}C`}
          detail={details.direct}
        />
        <HoverStatCard
          size="sm"
          label="총 매출"
          value={formatCurrency(dashboard.totals.revenueKrw)}
          sub={dashboard.rangeLabel}
          detail={details.revenue}
        />
        <HoverStatCard
          size="sm"
          label="총 손익"
          value={formatCurrency(dashboard.totals.profitKrw)}
          sub={`마진 ${formatPercent(dashboard.totals.marginPercent)}`}
          detail={details.profit}
        />
      </div>
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] text-gray-400">
          <WalletCards className="size-3.5" strokeWidth={1.8} aria-hidden />
          고정비 {formatCurrency(dashboard.pricing.fixedMonthlyCostKrw)} / 월
        </div>
      </div>
    </SectionCard>
  );
}
