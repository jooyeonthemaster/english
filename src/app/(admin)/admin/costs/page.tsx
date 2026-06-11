import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Coins,
  DatabaseZap,
  LineChart,
  ReceiptText,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  createProviderBillingReconciliation,
  createProviderPricing,
  getOperationsCostDashboard,
  syncProviderBillingReconciliation,
  type CostBucket,
  type CostPeriodMode,
} from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{
    mode?: string;
    date?: string;
    month?: string;
    start?: string;
    end?: string;
  }>;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export default async function AdminCostsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const mode: CostPeriodMode = params.mode === "monthly" ? "monthly" : "daily";
  const today = todayKstInput();
  const dateValue = normalizeDateInput(params.date) ?? today;
  const monthValue = normalizeMonthInput(params.month) ?? dateValue.slice(0, 7);
  const startValue = normalizeDateInput(params.start);
  const endValue = normalizeDateInput(params.end);
  const isRange = Boolean(startValue && endValue);
  const dashboard = await getOperationsCostDashboard(mode, {
    date: dateValue,
    month: monthValue,
    startDate: startValue ?? undefined,
    endDate: endValue ?? undefined,
  });
  const hasProfit = dashboard.current.profitKrw >= 0;
  const ProfitIcon = hasProfit ? ArrowUpRight : ArrowDownRight;
  // In single 일별/월별 selection the trend table shows only the selected
  // day/month; a custom start–end range still lists every bucket in the range.
  const trendBuckets =
    dashboard.summaryMode === "bucket"
      ? dashboard.buckets.filter((bucket) => bucket.key === dashboard.current.key)
      : dashboard.buckets;
  const trendSubtitle =
    dashboard.summaryMode === "bucket" ? dashboard.summaryLabel : dashboard.rangeLabel;
  const prevHref = buildPreviousNextHref({
    mode,
    dateValue,
    monthValue,
    startValue,
    endValue,
    direction: -1,
  });
  const nextHref = buildPreviousNextHref({
    mode,
    dateValue,
    monthValue,
    startValue,
    endValue,
    direction: 1,
  });
  const dailyHref = buildModeHref("daily", {
    dateValue,
    startValue,
    endValue,
  });
  const monthlyHref = buildModeHref("monthly", {
    monthValue,
    startValue,
    endValue,
  });
  const pricingEffectiveFromValue =
    startValue ??
    (mode === "monthly"
      ? `${dashboard.buckets[0]?.key ?? monthValue}-01`
      : dashboard.buckets[0]?.key ?? dateValue);
  const selectedRangeStartValue =
    startValue && endValue && startValue > endValue ? endValue : startValue;
  const selectedRangeEndValue =
    startValue && endValue && startValue > endValue ? startValue : endValue;
  const reconciliationPeriodStartValue =
    selectedRangeStartValue ?? (mode === "monthly" ? `${monthValue}-01` : dateValue);
  const reconciliationPeriodEndValue =
    selectedRangeEndValue ?? (mode === "monthly" ? lastDayOfMonthInput(monthValue) : dateValue);
  const hasActualReconciliation = dashboard.billingReconciliation.hasActual;
  const canSyncBilling =
    dashboard.billingSync.googleConfigured || dashboard.billingSync.anthropicConfigured;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">원가 분석</h1>
          <p className="mt-1 text-[13px] text-gray-400">
            API 사용량, 결제 매출, 운영 손익
          </p>
        </div>

        <div className="inline-flex h-9 w-fit items-center rounded-lg border border-gray-200 bg-white p-1">
          <PeriodLink active={mode === "daily"} href={dailyHref}>
            <CalendarDays className="size-3.5" />
            일별
          </PeriodLink>
          <PeriodLink active={mode === "monthly"} href={monthlyHref}>
            <CalendarRange className="size-3.5" />
            월별
          </PeriodLink>
        </div>
      </div>

      {dashboard.missingPricingKeys.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
          <div>
            <p className="font-semibold">
              단가 미설정으로 {formatNumber(dashboard.unpricedUsage.calls)}회 호출 원가가 0원 처리 중입니다.
            </p>
            <p className="mt-1 text-amber-700">
              {dashboard.missingPricingKeys.join(", ")}
            </p>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-gray-100 bg-white px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <IconLink href={prevHref} label="이전">
              <ChevronLeft className="size-4" />
            </IconLink>
            <div className="min-w-0 px-2">
              <p className="text-[12px] font-medium text-gray-400">요약 기준</p>
              <p className="truncate text-[18px] font-bold text-gray-900">
                {dashboard.summaryLabel}
              </p>
            </div>
            <IconLink href={nextHref} label="다음">
              <ChevronRight className="size-4" />
            </IconLink>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <form action="/admin/costs" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="mode" value={mode} />
              {mode === "daily" ? (
                <input
                  type="date"
                  name="date"
                  defaultValue={dateValue}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-700 outline-none focus:border-slate-400"
                />
              ) : (
                <input
                  type="month"
                  name="month"
                  defaultValue={monthValue}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-700 outline-none focus:border-slate-400"
                />
              )}
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800"
              >
                적용
              </button>
            </form>

            <form action="/admin/costs" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="mode" value={mode} />
              <input
                type="date"
                name="start"
                defaultValue={startValue ?? dateValue}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-700 outline-none focus:border-slate-400"
              />
              <span className="text-[12px] text-gray-300">-</span>
              <input
                type="date"
                name="end"
                defaultValue={endValue ?? dateValue}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-700 outline-none focus:border-slate-400"
              />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                기간 적용
              </button>
              {isRange && (
                <Link
                  href={mode === "daily" ? `/admin/costs?mode=daily&date=${dateValue}` : `/admin/costs?mode=monthly&month=${monthValue}`}
                  className="inline-flex h-9 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  초기화
                </Link>
              )}
            </form>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={summaryMetricLabel(dashboard.summaryMode, dashboard.summaryLabel, "매출")}
          value={formatCurrency(dashboard.current.revenueKrw)}
          sub={`${dashboard.activeSubscriptions.count}개 활성 구독 · MRR ${formatCurrency(dashboard.activeSubscriptions.estimatedMrrKrw)}`}
          icon={ReceiptText}
          tone="blue"
        />
        <MetricCard
          label={summaryMetricLabel(dashboard.summaryMode, dashboard.summaryLabel, "원가")}
          value={formatCurrency(dashboard.current.totalCostKrw)}
          sub={
            dashboard.current.unpricedCalls > 0
              ? `API ${formatCurrency(dashboard.current.variableCostKrw)} · ${formatNumber(dashboard.current.unpricedCalls)}회 미단가`
              : `API ${formatCurrency(dashboard.current.variableCostKrw)} · 고정 ${formatCurrency(dashboard.current.fixedCostKrw)}`
          }
          icon={DatabaseZap}
          tone="slate"
        />
        <MetricCard
          label={summaryMetricLabel(dashboard.summaryMode, dashboard.summaryLabel, "손익")}
          value={formatCurrency(dashboard.current.profitKrw)}
          sub={`마진 ${formatPercent(dashboard.current.marginPercent)}`}
          icon={ProfitIcon}
          tone={hasProfit ? "emerald" : "red"}
        />
        <MetricCard
          label="API 사용"
          value={`${formatNumber(dashboard.current.apiCalls)}회`}
          sub={`${formatNumber(dashboard.current.inputTokens + dashboard.current.outputTokens)} tokens`}
          icon={LineChart}
          tone="violet"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-100 bg-white xl:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-50 px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-gray-800">
                {mode === "daily" ? "일별 손익" : "월별 손익"}
              </h2>
              <p className="mt-1 text-[12px] text-gray-400">
                {trendSubtitle} · KST 기준
              </p>
            </div>
            <Badge
              variant="secondary"
              className="border-0 bg-gray-100 text-[11px] text-gray-500"
              title={`적용 환율 ${dashboard.fxRate.date} · ${dashboard.fxRate.source === "ECB" ? "ECB 일별 기준환율" : "기본값"}`}
            >
              USD {formatNumber(dashboard.fxRate.rate)}원 · {formatBadgeDate(dashboard.fxRate.date)}
              {dashboard.fxRate.source !== "ECB" && " (기본)"}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 pl-5 text-[12px] font-medium text-gray-400">
                    기간
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    매출
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    원가
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    손익
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    마진
                  </TableHead>
                  <TableHead className="h-9 pr-5 text-right text-[12px] font-medium text-gray-400">
                    API
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trendBuckets.map((bucket) => (
                  <CostBucketRow key={bucket.key} bucket={bucket} />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white">
          <div className="border-b border-gray-50 px-5 py-4">
            <h2 className="text-[14px] font-semibold text-gray-800">원가 구성</h2>
            <p className="mt-1 text-[12px] text-gray-400">
              {dashboard.summaryLabel} 합계 {formatCurrency(dashboard.current.totalCostKrw)}
            </p>
          </div>
          <div className="space-y-3 p-5">
            {dashboard.sources.length === 0 ? (
              <div className="rounded-lg bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-400">
                집계된 API 원가가 없습니다
              </div>
            ) : (
              dashboard.sources.map((source) => {
                const denominator = Math.max(dashboard.current.variableCostKrw, 1);
                const ratio = Math.min(100, (source.costKrw / denominator) * 100);
                return (
                  <div key={source.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-medium text-gray-800">
                            {source.label}
                          </p>
                          {source.unpricedCalls > 0 && (
                            <Badge className="border-0 bg-amber-100 px-1.5 py-0 text-[10px] font-semibold text-amber-700">
                              단가 미설정
                            </Badge>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-400">
                          {formatNumber(source.calls)}회 · {formatNumber(source.inputTokens + source.outputTokens)} tokens
                          {source.unpricedCalls > 0 && ` · ${formatNumber(source.unpricedCalls)}회 0원 처리`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-semibold text-gray-900">
                          {formatCurrency(source.costKrw)}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          ${source.costUsd.toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between border-b border-gray-50 px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">학원별 사용량</h2>
            <p className="mt-1 text-[12px] text-gray-400">
              {dashboard.summaryLabel} API 원가 기준 · {formatNumber(dashboard.academyUsage.length)}개 학원
            </p>
          </div>
          <Building2 className="size-4 text-gray-400" strokeWidth={1.8} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 pl-5 text-[12px] font-medium text-gray-400">
                  학원
                </TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                  원가
                </TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                  비중
                </TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                  API
                </TableHead>
                <TableHead className="h-9 pr-5 text-right text-[12px] font-medium text-gray-400">
                  토큰
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.academyUsage.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-[13px] text-gray-400">
                    집계된 학원별 사용량이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                dashboard.academyUsage.map((academy) => {
                  const denominator = Math.max(dashboard.current.variableCostKrw, 1);
                  const ratio = Math.min(100, (academy.costKrw / denominator) * 100);
                  return (
                    <TableRow
                      key={academy.academyId ?? "__unassigned__"}
                      className="hover:bg-gray-50/50"
                    >
                      <TableCell className="pl-5 text-[13px] font-medium text-gray-800">
                        {academy.name}
                      </TableCell>
                      <TableCell className="text-right text-[13px] font-semibold text-gray-900">
                        <p>{formatCurrency(academy.costKrw)}</p>
                        <p className="mt-0.5 text-[11px] font-normal text-gray-400">
                          ${academy.costUsd.toFixed(4)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-[13px] text-gray-500">
                        {formatPercent(ratio)}
                      </TableCell>
                      <TableCell className="text-right text-[13px] text-gray-500">
                        {formatNumber(academy.calls)}회
                      </TableCell>
                      <TableCell className="pr-5 text-right text-[13px] text-gray-500">
                        {formatNumber(academy.inputTokens + academy.outputTokens)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between border-b border-gray-50 px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">청구 정산</h2>
            <p className="mt-1 text-[12px] text-gray-400">
              실제 청구액으로 추정 원가 차이를 보정
            </p>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "border-0 text-[11px]",
              hasActualReconciliation
                ? "bg-emerald-50 text-emerald-700"
                : "bg-gray-100 text-gray-500",
            )}
          >
            {hasActualReconciliation ? "실제 청구 반영" : "추정 원가 기준"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[0.9fr_1.4fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <SmallStat
                label="예상 API"
                value={formatCurrency(dashboard.billingReconciliation.estimatedCostKrw)}
                sub={`$${dashboard.billingReconciliation.estimatedCostUsd.toFixed(4)}`}
              />
              <SmallStat
                label="실제 청구"
                value={formatCurrency(dashboard.billingReconciliation.actualCostKrw)}
                sub={`$${dashboard.billingReconciliation.actualCostUsd.toFixed(4)}`}
              />
              <SmallStat
                label="정산 차이"
                value={formatCurrency(dashboard.billingReconciliation.adjustmentKrw)}
                sub="실제 - 예상"
              />
              <SmallStat
                label="정산 손익"
                value={formatCurrency(dashboard.billingReconciliation.actualProfitKrw)}
                sub={`총원가 ${formatCurrency(dashboard.billingReconciliation.actualTotalCostKrw)}`}
              />
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className={cn(
                  "border-0 px-1.5 py-0 text-[10px] font-semibold",
                  dashboard.billingSync.googleConfigured
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-200 text-gray-500",
                )}>
                  Google {dashboard.billingSync.googleConfigured ? "연결" : "미설정"}
                </Badge>
                <Badge className={cn(
                  "border-0 px-1.5 py-0 text-[10px] font-semibold",
                  dashboard.billingSync.anthropicConfigured
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-200 text-gray-500",
                )}>
                  Anthropic {dashboard.billingSync.anthropicConfigured ? "연결" : "미설정"}
                </Badge>
              </div>

              <form action={syncProviderBillingReconciliation} className="grid grid-cols-2 gap-2">
                <select
                  name="syncTarget"
                  defaultValue="ALL"
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[12px] text-gray-700 outline-none focus:border-slate-400"
                >
                  <option value="ALL">Google + Anthropic</option>
                  <option value="GOOGLE">Google</option>
                  <option value="ANTHROPIC">Anthropic</option>
                </select>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  name="syncUsdToKrwRate"
                  defaultValue={dashboard.usdToKrwRate}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
                />
                <input
                  type="date"
                  name="syncPeriodStart"
                  defaultValue={reconciliationPeriodStartValue}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
                />
                <input
                  type="date"
                  name="syncPeriodEnd"
                  defaultValue={reconciliationPeriodEndValue}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
                />
                <button
                  type="submit"
                  disabled={!canSyncBilling}
                  className={cn(
                    "col-span-2 inline-flex h-9 items-center justify-center rounded-md px-3 text-[12px] font-semibold transition-colors",
                    canSyncBilling
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "cursor-not-allowed bg-gray-200 text-gray-400",
                  )}
                >
                  청구 자동 동기화
                </button>
              </form>

              {!canSyncBilling && (
                <p className="mt-2 text-[11px] text-gray-400">
                  {dashboard.billingSync.missingEnv.join(", ")}
                </p>
              )}
            </div>

            <form action={createProviderBillingReconciliation} className="grid grid-cols-2 gap-2">
              <select
                name="provider"
                defaultValue="GOOGLE_GEMINI"
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              >
                <option value="GOOGLE_GEMINI">Google Gemini</option>
                <option value="ANTHROPIC">Anthropic</option>
                <option value="GOOGLE_DOCUMENT_AI">Google Document AI</option>
                <option value="ATLASCLOUD">AtlasCloud</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
              <select
                name="unitType"
                defaultValue="ALL"
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              >
                <option value="ALL">ALL</option>
                <option value="TOKENS">TOKENS</option>
                <option value="PAGE">PAGE</option>
                <option value="IMAGE">IMAGE</option>
                <option value="CALL">CALL</option>
              </select>
              <input
                name="modelPattern"
                placeholder="model pattern"
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <select
                name="source"
                defaultValue="MANUAL"
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              >
                <option value="MANUAL">Manual</option>
                <option value="GOOGLE_BILLING_EXPORT">Google Billing</option>
                <option value="ANTHROPIC_COST_REPORT">Anthropic Report</option>
                <option value="ATLAS_INVOICE">Atlas Invoice</option>
                <option value="INVOICE">Invoice</option>
              </select>
              <input
                type="date"
                name="periodStart"
                defaultValue={reconciliationPeriodStartValue}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <input
                type="date"
                name="periodEnd"
                defaultValue={reconciliationPeriodEndValue}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <input
                type="number"
                step="0.000001"
                min="0"
                name="actualCostUsd"
                placeholder="actual $"
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <input
                type="number"
                step="1"
                min="0"
                name="actualCostKrw"
                placeholder="actual ₩"
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <input
                type="number"
                step="0.0001"
                min="0"
                name="usdToKrwRate"
                defaultValue={dashboard.usdToKrwRate}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <input
                name="referenceId"
                placeholder="invoice / export id"
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <input
                name="notes"
                placeholder="memo"
                className="col-span-2 h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
              />
              <button
                type="submit"
                className="col-span-2 inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800"
              >
                실제 청구액 추가
              </button>
            </form>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 pl-4 text-[12px] font-medium text-gray-400">
                    Provider
                  </TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-gray-400">
                    기간
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    실제
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    예상
                  </TableHead>
                  <TableHead className="h-9 pr-4 text-right text-[12px] font-medium text-gray-400">
                    차이
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.billingReconciliation.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-[13px] text-gray-400">
                      선택 기간에 반영된 실제 청구액이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  dashboard.billingReconciliation.rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-gray-50/50">
                      <TableCell className="pl-4 text-[12px] font-medium text-gray-800">
                        <p>{row.provider}</p>
                        <p className="mt-0.5 max-w-[180px] truncate text-[11px] font-normal text-gray-400">
                          {[row.unitType ?? "ALL", row.modelPattern].filter(Boolean).join(" · ")}
                        </p>
                      </TableCell>
                      <TableCell className="text-[12px] text-gray-500">
                        <p>
                          {formatKstDate(row.periodStart)} - {formatKstInclusiveEndDate(row.periodEnd)}
                        </p>
                        <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-gray-400">
                          {[row.source, row.referenceId].filter(Boolean).join(" · ")}
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-[12px] font-semibold text-gray-900">
                        <p>{formatCurrency(row.actualCostKrw)}</p>
                        <p className="mt-0.5 text-[11px] font-normal text-gray-400">
                          ${row.actualCostUsd.toFixed(4)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-[12px] text-gray-700">
                        {formatCurrency(row.estimatedCostKrw)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "pr-4 text-right text-[12px] font-semibold",
                          row.deltaKrw > 0
                            ? "text-red-600"
                            : row.deltaKrw < 0
                              ? "text-emerald-600"
                              : "text-gray-500",
                        )}
                      >
                        {formatCurrency(row.deltaKrw)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white">
        <div className="border-b border-gray-50 px-5 py-4">
          <h2 className="text-[14px] font-semibold text-gray-800">단가 스냅샷</h2>
          <p className="mt-1 text-[12px] text-gray-400">
            호출별 원장 계산에 적용되는 활성 단가
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[1fr_1.3fr]">
          <form action={createProviderPricing} className="grid grid-cols-2 gap-2">
            <select
              name="provider"
              defaultValue="GOOGLE_GEMINI"
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            >
              <option value="GOOGLE_GEMINI">Google Gemini</option>
              <option value="ANTHROPIC">Anthropic</option>
              <option value="GOOGLE_DOCUMENT_AI">Google Document AI</option>
              <option value="ATLASCLOUD">AtlasCloud</option>
            </select>
            <select
              name="unitType"
              defaultValue="TOKENS"
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            >
              <option value="TOKENS">TOKENS</option>
              <option value="PAGE">PAGE</option>
              <option value="IMAGE">IMAGE</option>
              <option value="CALL">CALL</option>
            </select>
            <input
              name="modelPattern"
              placeholder="model pattern"
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            />
            <input
              type="date"
              name="effectiveFrom"
              defaultValue={pricingEffectiveFromValue}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            />
            <input
              type="number"
              step="0.000001"
              min="0"
              name="inputUsdPer1M"
              placeholder="input $/1M"
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            />
            <input
              type="number"
              step="0.000001"
              min="0"
              name="outputUsdPer1M"
              placeholder="output $/1M"
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            />
            <input
              type="number"
              step="0.000001"
              min="0"
              name="unitUsd"
              placeholder="unit $"
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            />
            <input
              type="number"
              step="0.0001"
              min="0"
              name="usdToKrwRate"
              defaultValue={dashboard.usdToKrwRate}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            />
            <input
              name="notes"
              placeholder="memo"
              className="col-span-2 h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] text-gray-700 outline-none focus:border-slate-400"
            />
            <button
              type="submit"
              className="col-span-2 inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800"
            >
              단가 추가
            </button>
          </form>

          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 pl-4 text-[12px] font-medium text-gray-400">
                    Provider
                  </TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-gray-400">
                    단위
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    입력
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    출력/단위
                  </TableHead>
                  <TableHead className="h-9 pr-4 text-right text-[12px] font-medium text-gray-400">
                    환율
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.providerPricings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-[13px] text-gray-400">
                      활성 단가가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  dashboard.providerPricings.map((pricing) => (
                    <TableRow key={pricing.id} className="hover:bg-gray-50/50">
                      <TableCell className="pl-4 text-[12px] font-medium text-gray-800">
                        {pricing.provider}
                        {pricing.modelPattern && (
                          <span className="ml-1 text-gray-400">{pricing.modelPattern}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-[12px] text-gray-500">
                        {pricing.unitType}
                      </TableCell>
                      <TableCell className="text-right text-[12px] text-gray-700">
                        {pricing.inputUsdPer1M === null ? "-" : `$${pricing.inputUsdPer1M}`}
                      </TableCell>
                      <TableCell className="text-right text-[12px] text-gray-700">
                        {pricing.unitType === "TOKENS"
                          ? pricing.outputUsdPer1M === null ? "-" : `$${pricing.outputUsdPer1M}`
                          : pricing.unitUsd === null ? "-" : `$${pricing.unitUsd}`}
                      </TableCell>
                      <TableCell className="pr-4 text-right text-[12px] text-gray-500">
                        {formatNumber(pricing.usdToKrwRate)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-100 bg-white xl:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-50 px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-gray-800">크레딧 사용</h2>
              <p className="mt-1 text-[12px] text-gray-400">
                환불 반영 후 순사용량 기준
              </p>
            </div>
            <Coins className="size-4 text-gray-400" strokeWidth={1.8} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 pl-5 text-[12px] font-medium text-gray-400">
                    작업
                  </TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                    크레딧
                  </TableHead>
                  <TableHead className="h-9 pr-5 text-right text-[12px] font-medium text-gray-400">
                    거래
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.creditOperations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-[13px] text-gray-400">
                      크레딧 사용 내역이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  dashboard.creditOperations.map((operation) => (
                    <TableRow key={operation.operationType} className="hover:bg-gray-50/50">
                      <TableCell className="pl-5 text-[13px] font-medium text-gray-800">
                        {operation.label}
                      </TableCell>
                      <TableCell className="text-right text-[13px] font-semibold text-gray-900">
                        {formatNumber(operation.credits)}C
                      </TableCell>
                      <TableCell className="pr-5 text-right text-[13px] text-gray-500">
                        {formatNumber(operation.transactionCount)}건
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white">
          <div className="border-b border-gray-50 px-5 py-4">
            <h2 className="text-[14px] font-semibold text-gray-800">추적 현황</h2>
            <p className="mt-1 text-[12px] text-gray-400">
              토큰 단위 원가 산정 범위
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            <SmallStat
              label="워크벤치 작업"
              value={formatNumber(dashboard.untracked.workbenchJobs)}
              sub={`${formatNumber(dashboard.untracked.workbenchCredits)}C`}
            />
            <SmallStat
              label="직접 호출"
              value={formatNumber(dashboard.untracked.directCreditTransactions)}
              sub={`${formatNumber(dashboard.untracked.directCredits)}C`}
            />
            <SmallStat
              label="총 매출"
              value={formatCurrency(dashboard.totals.revenueKrw)}
              sub={dashboard.rangeLabel}
            />
            <SmallStat
              label="총 손익"
              value={formatCurrency(dashboard.totals.profitKrw)}
              sub={`마진 ${formatPercent(dashboard.totals.marginPercent)}`}
            />
          </div>
          <div className="border-t border-gray-50 px-5 py-4">
            <div className="flex items-center gap-2 text-[12px] text-gray-400">
              <WalletCards className="size-3.5" strokeWidth={1.8} />
              고정비 {formatCurrency(dashboard.pricing.fixedMonthlyCostKrw)} / 월
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PeriodLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors",
        active
          ? "bg-slate-900 text-white"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
      )}
    >
      {children}
    </Link>
  );
}

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
    >
      {children}
    </Link>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone: "blue" | "emerald" | "red" | "slate" | "violet";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-600",
    violet: "bg-violet-50 text-violet-600",
  };

  return (
    <div className="flex items-start justify-between rounded-xl border border-gray-100 bg-white p-5">
      <div className="min-w-0">
        <p className="text-[12px] font-medium uppercase tracking-wide text-gray-400">
          {label}
        </p>
        <p className="mt-2 truncate text-[27px] font-bold leading-tight text-gray-900">
          {value}
        </p>
        <p className="mt-1 truncate text-[12px] text-gray-400">{sub}</p>
      </div>
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
        <Icon className="size-5" strokeWidth={1.8} />
      </div>
    </div>
  );
}

function CostBucketRow({ bucket }: { bucket: CostBucket }) {
  const hasProfit = bucket.profitKrw >= 0;
  return (
    <TableRow className="hover:bg-gray-50/50">
      <TableCell className="pl-5 text-[13px] font-medium text-gray-800">
        {bucket.label}
      </TableCell>
      <TableCell className="text-right text-[13px] text-gray-700">
        {formatCurrency(bucket.revenueKrw)}
      </TableCell>
      <TableCell className="text-right text-[13px] text-gray-700">
        {formatCurrency(bucket.totalCostKrw)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right text-[13px] font-semibold",
          hasProfit ? "text-emerald-600" : "text-red-600",
        )}
      >
        {formatCurrency(bucket.profitKrw)}
      </TableCell>
      <TableCell className="text-right text-[13px] text-gray-500">
        {formatPercent(bucket.marginPercent)}
      </TableCell>
      <TableCell className="pr-5 text-right text-[13px] text-gray-500">
        {formatNumber(bucket.apiCalls)}회
      </TableCell>
    </TableRow>
  );
}

function SmallStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-3">
      <p className="text-[11px] font-medium text-gray-400">{label}</p>
      <p className="mt-1 truncate text-[16px] font-semibold text-gray-900">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-gray-400">{sub}</p>
    </div>
  );
}

function summaryMetricLabel(
  mode: "bucket" | "range",
  summaryLabel: string,
  metric: string,
) {
  return mode === "range" ? `선택 기간 ${metric}` : `${summaryLabel} ${metric}`;
}

function buildModeHref(
  mode: CostPeriodMode,
  values: {
    dateValue?: string;
    monthValue?: string;
    startValue: string | null;
    endValue: string | null;
  },
) {
  const params = new URLSearchParams({ mode });
  if (values.startValue && values.endValue) {
    params.set("start", values.startValue);
    params.set("end", values.endValue);
  } else if (mode === "monthly" && values.monthValue) {
    params.set("month", values.monthValue);
  } else if (mode === "daily" && values.dateValue) {
    params.set("date", values.dateValue);
  }
  return `/admin/costs?${params.toString()}`;
}

function buildPreviousNextHref({
  mode,
  dateValue,
  monthValue,
  startValue,
  endValue,
  direction,
}: {
  mode: CostPeriodMode;
  dateValue: string;
  monthValue: string;
  startValue: string | null;
  endValue: string | null;
  direction: -1 | 1;
}) {
  const params = new URLSearchParams({ mode });
  if (startValue && endValue) {
    const span = diffInputDays(startValue, endValue) + 1;
    params.set("start", addDaysInput(startValue, span * direction));
    params.set("end", addDaysInput(endValue, span * direction));
    return `/admin/costs?${params.toString()}`;
  }

  if (mode === "monthly") {
    params.set("month", addMonthsInput(monthValue, direction));
  } else {
    params.set("date", addDaysInput(dateValue, direction));
  }
  return `/admin/costs?${params.toString()}`;
}

function todayKstInput() {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeDateInput(value?: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeMonthInput(value?: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

function addDaysInput(value: string, delta: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addMonthsInput(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
}

function lastDayOfMonthInput(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function diffInputDays(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  return Math.max(
    0,
    Math.round(
      (Date.UTC(endYear, endMonth - 1, endDay) -
        Date.UTC(startYear, startMonth - 1, startDay)) /
        86_400_000,
    ),
  );
}

function formatKstDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return formatKstDateFromMs(date.getTime());
}

function formatKstInclusiveEndDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return formatKstDateFromMs(date.getTime() - 1);
}

function formatKstDateFromMs(ms: number) {
  const shifted = new Date(ms + KST_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join(".");
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function formatBadgeDate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return match ? `${match[2]}.${match[3]}` : dateStr;
}
