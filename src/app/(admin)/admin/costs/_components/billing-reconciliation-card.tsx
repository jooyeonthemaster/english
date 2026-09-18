import {
  createProviderBillingReconciliation,
  syncProviderBillingReconciliation,
} from "@/actions/admin";
import type { OperationsCostDashboard } from "@/actions/admin/operations-cost-types";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  SectionCard,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import * as hoverDetail from "../_lib/costs-hover-detail";
import { formatKstDate, formatKstInclusiveEndDate } from "../_lib/costs-period";
import { HoverStatCard } from "./hover-stat-card";

const INPUT_CLASS = "text-[13px]";

function ProviderBadge({ name, configured, title }: { name: string; configured: boolean; title?: string }) {
  return (
    <span title={title}>
      <StatusBadge
        status={{ label: `${name} ${configured ? "연결" : "미설정"}`, tone: configured ? "emerald" : "gray" }}
      />
    </span>
  );
}

/** 청구 정산 — 예상 vs 실제 청구액 지표 · 자동 동기화 · 수동 입력 · 반영 내역 표 */
export function BillingReconciliationCard({
  dashboard,
  periodStartValue,
  periodEndValue,
}: {
  dashboard: OperationsCostDashboard;
  periodStartValue: string;
  periodEndValue: string;
}) {
  const recon = dashboard.billingReconciliation;
  const sync = dashboard.billingSync;
  const canSyncBilling = sync.googleConfigured || sync.openRouterConfigured;
  const detail = hoverDetail.reconciliationStatDetail(dashboard);

  return (
    <SectionCard
      title="청구 정산"
      description="실제 청구액으로 추정 원가 차이를 보정"
      actions={
        <StatusBadge
          status={{
            label: recon.hasActual ? "실제 청구 반영" : "추정 원가 기준",
            tone: recon.hasActual ? "emerald" : "gray",
          }}
        />
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <HoverStatCard
              size="sm"
              label="예상 API"
              value={formatCurrency(recon.estimatedCostKrw)}
              sub={`$${recon.estimatedCostUsd.toFixed(4)}`}
              detail={detail}
            />
            <HoverStatCard
              size="sm"
              label="실제 청구"
              value={formatCurrency(recon.actualCostKrw)}
              sub={`$${recon.actualCostUsd.toFixed(4)}`}
              detail={detail}
            />
            <HoverStatCard
              size="sm"
              label="정산 차이"
              value={formatCurrency(recon.adjustmentKrw)}
              sub="실제 - 예상"
              detail={detail}
            />
            <HoverStatCard
              size="sm"
              label="정산 손익"
              value={formatCurrency(recon.actualProfitKrw)}
              sub={`총원가 ${formatCurrency(recon.actualTotalCostKrw)}`}
              detail={detail}
            />
          </div>

          <SectionCard
            title="청구 자동 동기화"
            description={
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <ProviderBadge name="Google" configured={sync.googleConfigured} />
                <ProviderBadge
                  name="OpenRouter"
                  configured={sync.openRouterConfigured}
                  title="OpenRouter 활동 API 동기화 — management key(OPENROUTER_MANAGEMENT_KEY) 필요"
                />
                <ProviderBadge name="AtlasCloud" configured={sync.atlasConfigured} />
              </span>
            }
          >
            <form action={syncProviderBillingReconciliation} className="grid grid-cols-2 gap-2">
              <Select name="syncTarget" defaultValue="ALL">
                <SelectTrigger className={cn("w-full", INPUT_CLASS)} aria-label="동기화 대상">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 (Google + OpenRouter)</SelectItem>
                  <SelectItem value="GOOGLE">Google</SelectItem>
                  <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.0001"
                min="0"
                name="syncUsdToKrwRate"
                defaultValue={dashboard.usdToKrwRate}
                aria-label="적용 환율"
                className={INPUT_CLASS}
              />
              <Input
                type="date"
                name="syncPeriodStart"
                defaultValue={periodStartValue}
                aria-label="동기화 시작일"
                className={INPUT_CLASS}
              />
              <Input
                type="date"
                name="syncPeriodEnd"
                defaultValue={periodEndValue}
                aria-label="동기화 종료일"
                className={INPUT_CLASS}
              />
              <Button type="submit" size="sm" disabled={!canSyncBilling} className="col-span-2">
                청구 자동 동기화
              </Button>
            </form>
            {!canSyncBilling && (
              <p className="mt-2 text-[11px] text-gray-400">{sync.missingEnv.join(", ")}</p>
            )}
          </SectionCard>

          <SectionCard title="실제 청구액 추가" description="인보이스·빌링 내보내기 금액을 직접 반영">
            <form action={createProviderBillingReconciliation} className="grid grid-cols-2 gap-2">
              <Select name="provider" defaultValue="OPENROUTER">
                <SelectTrigger className={cn("w-full", INPUT_CLASS)} aria-label="공급자">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                  <SelectItem value="GOOGLE_GEMINI">Google Gemini</SelectItem>
                  <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                  <SelectItem value="GOOGLE_DOCUMENT_AI">Google Document AI</SelectItem>
                  <SelectItem value="ATLASCLOUD">AtlasCloud</SelectItem>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                </SelectContent>
              </Select>
              <Select name="unitType" defaultValue="ALL">
                <SelectTrigger className={cn("w-full", INPUT_CLASS)} aria-label="단위">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">ALL</SelectItem>
                  <SelectItem value="TOKENS">TOKENS</SelectItem>
                  <SelectItem value="PAGE">PAGE</SelectItem>
                  <SelectItem value="IMAGE">IMAGE</SelectItem>
                  <SelectItem value="CALL">CALL</SelectItem>
                </SelectContent>
              </Select>
              <Input name="modelPattern" placeholder="model pattern" className={INPUT_CLASS} />
              <Select name="source" defaultValue="MANUAL">
                <SelectTrigger className={cn("w-full", INPUT_CLASS)} aria-label="출처">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                  <SelectItem value="GOOGLE_BILLING_EXPORT">Google Billing</SelectItem>
                  <SelectItem value="OPENROUTER_ACTIVITY">OpenRouter Activity</SelectItem>
                  <SelectItem value="ATLAS_INVOICE">Atlas Invoice</SelectItem>
                  <SelectItem value="INVOICE">Invoice</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                name="periodStart"
                defaultValue={periodStartValue}
                aria-label="청구 시작일"
                className={INPUT_CLASS}
              />
              <Input
                type="date"
                name="periodEnd"
                defaultValue={periodEndValue}
                aria-label="청구 종료일"
                className={INPUT_CLASS}
              />
              <Input
                type="number"
                step="0.000001"
                min="0"
                name="actualCostUsd"
                placeholder="actual $"
                className={INPUT_CLASS}
              />
              <Input
                type="number"
                step="1"
                min="0"
                name="actualCostKrw"
                placeholder="actual ₩"
                className={INPUT_CLASS}
              />
              <Input
                type="number"
                step="0.0001"
                min="0"
                name="usdToKrwRate"
                defaultValue={dashboard.usdToKrwRate}
                aria-label="적용 환율"
                className={INPUT_CLASS}
              />
              <Input name="referenceId" placeholder="invoice / export id" className={INPUT_CLASS} />
              <Input name="notes" placeholder="memo" className={cn("col-span-2", INPUT_CLASS)} />
              <Button type="submit" size="sm" className="col-span-2">
                실제 청구액 추가
              </Button>
            </form>
          </SectionCard>
        </div>

        <DataTable>
          <DataTableHeader>
            <Tr>
              <Th>Provider</Th>
              <Th>기간</Th>
              <Th align="right">실제</Th>
              <Th align="right">예상</Th>
              <Th align="right">차이</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {recon.rows.length === 0 ? (
              <DataTableEmpty colSpan={5}>
                <AdminEmptyState compact title="선택 기간에 반영된 실제 청구액이 없습니다" />
              </DataTableEmpty>
            ) : (
              recon.rows.map((row) => (
                <AdminHoverDetail
                  key={row.id}
                  title={`${row.provider} 청구`}
                  detail={hoverDetail.reconciliationRowDetail(row)}
                >
                  <Tr clickable>
                    <Td className="font-medium text-gray-800">
                      <p>{row.provider}</p>
                      <p className="mt-0.5 max-w-[180px] truncate text-[11px] font-normal text-gray-400">
                        {[row.unitType ?? "ALL", row.modelPattern].filter(Boolean).join(" · ")}
                      </p>
                    </Td>
                    <Td className="text-gray-500">
                      <p className="tabular-nums">
                        {formatKstDate(row.periodStart)} - {formatKstInclusiveEndDate(row.periodEnd)}
                      </p>
                      <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-gray-400">
                        {[row.source, row.referenceId].filter(Boolean).join(" · ")}
                      </p>
                    </Td>
                    <Td align="right" className="font-semibold">
                      <p>{formatCurrency(row.actualCostKrw)}</p>
                      <p className="mt-0.5 text-[11px] font-normal text-gray-400">
                        ${row.actualCostUsd.toFixed(4)}
                      </p>
                    </Td>
                    <Td align="right" className="font-normal text-gray-700">
                      {formatCurrency(row.estimatedCostKrw)}
                    </Td>
                    <Td
                      align="right"
                      className={cn(
                        "font-semibold",
                        row.deltaKrw > 0
                          ? "text-rose-600"
                          : row.deltaKrw < 0
                            ? "text-emerald-600"
                            : "text-gray-500",
                      )}
                    >
                      {formatCurrency(row.deltaKrw)}
                    </Td>
                  </Tr>
                </AdminHoverDetail>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </div>
    </SectionCard>
  );
}
