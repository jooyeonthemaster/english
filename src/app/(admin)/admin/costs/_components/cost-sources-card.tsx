import type { OperationsCostDashboard } from "@/actions/admin/operations-cost-types";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { AdminEmptyState, SectionCard, StatusBadge } from "@/components/admin/kit";
import { formatCurrency, formatNumber } from "@/lib/utils";
import * as hoverDetail from "../_lib/costs-hover-detail";
import { formatPercent } from "../_lib/costs-period";

/** 원가 구성 — 공급자별 변동원가 목록 + 단가 근거(실측·등록·추정) 신뢰도 바 */
export function CostSourcesCard({ dashboard }: { dashboard: OperationsCostDashboard }) {
  const confidence = dashboard.costConfidence;
  const confidenceTotalKrw =
    confidence.recordedCostKrw + confidence.pricedCostKrw + confidence.estimatedCostKrw;
  const confidenceTone =
    confidence.recordedSharePercent >= 80
      ? "emerald"
      : confidence.recordedSharePercent > 0
        ? "sky"
        : "gray";

  return (
    <SectionCard
      title="원가 구성"
      description={`${dashboard.summaryLabel} 합계 ${formatCurrency(dashboard.current.totalCostKrw)}`}
      actions={
        <span title="변동원가 중 게이트웨이(OpenRouter) 실제 청구액으로 기록된 비중 — 높을수록 손익 숫자를 그대로 신뢰 가능">
          <StatusBadge
            status={{ label: `실측 ${formatPercent(confidence.recordedSharePercent)}`, tone: confidenceTone }}
          />
        </span>
      }
      padded={false}
    >
      {confidenceTotalKrw > 0 && (
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${(confidence.recordedCostKrw / confidenceTotalKrw) * 100}%` }}
            />
            <div
              className="h-full bg-gray-400"
              style={{ width: `${(confidence.pricedCostKrw / confidenceTotalKrw) * 100}%` }}
            />
            <div
              className="h-full bg-sky-400"
              style={{ width: `${(confidence.estimatedCostKrw / confidenceTotalKrw) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500" />
              실측 청구 {formatCurrency(confidence.recordedCostKrw)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-gray-400" />
              등록 단가 {formatCurrency(confidence.pricedCostKrw)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-sky-400" />
              추정 단가 {formatCurrency(confidence.estimatedCostKrw)}
            </span>
            {confidence.missingCalls > 0 && (
              <span className="text-amber-600">
                미단가 {formatNumber(confidence.missingCalls)}회 0원 처리
              </span>
            )}
          </div>
        </div>
      )}
      <div className="space-y-3 p-5">
        {dashboard.sources.length === 0 ? (
          <AdminEmptyState compact title="집계된 API 원가가 없습니다" />
        ) : (
          dashboard.sources.map((source) => {
            const denominator = Math.max(dashboard.current.variableCostKrw, 1);
            const ratio = Math.min(100, (source.costKrw / denominator) * 100);
            return (
              <AdminHoverDetail
                key={source.key}
                title={source.label}
                detail={hoverDetail.sourceRowDetail(source, dashboard.current.variableCostKrw)}
              >
                <div className="cursor-pointer space-y-2 rounded-lg transition-colors hover:bg-gray-50/60">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium text-gray-800">{source.label}</p>
                        {source.recordedCalls > 0 && (
                          <span title="OpenRouter가 응답마다 돌려준 실제 청구액(usage.cost)으로 기록된 호출">
                            <StatusBadge status={{ label: "실측 단가", tone: "emerald" }} />
                          </span>
                        )}
                        {source.unpricedCalls > 0 && (
                          <StatusBadge status={{ label: "단가 미설정", tone: "amber" }} />
                        )}
                        {source.estimatedCalls > 0 && (
                          <StatusBadge status={{ label: "추정 단가", tone: "sky" }} />
                        )}
                      </div>
                      <p className="text-[12px] text-gray-400">
                        {formatNumber(source.calls)}회 · {formatNumber(source.inputTokens + source.outputTokens)} tokens
                        {source.recordedCalls > 0 && ` · ${formatNumber(source.recordedCalls)}회 실측 반영`}
                        {source.unpricedCalls > 0 && ` · ${formatNumber(source.unpricedCalls)}회 0원 처리`}
                        {source.estimatedCalls > 0 && ` · ${formatNumber(source.estimatedCalls)}회 추정 반영`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-gray-900">
                        {formatCurrency(source.costKrw)}
                      </p>
                      <p className="text-[11px] tabular-nums text-gray-400">${source.costUsd.toFixed(4)}</p>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${ratio}%` }} />
                  </div>
                </div>
              </AdminHoverDetail>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}
