import { AlertTriangle } from "lucide-react";
import { getOperationsCostDashboard, type CostPeriodMode } from "@/actions/admin";
import { getFeatureMarginAnalysis } from "@/actions/admin/feature-margin";
import { getFreeCreditBep } from "@/actions/admin/free-credit-bep";
import { PageHeader } from "@/components/admin/kit";
import { formatNumber } from "@/lib/utils";
import { CostTabs } from "./_components/cost-tabs";
import { DashboardView } from "./_components/dashboard-view";
import { MarginView } from "./_components/margin-view";
import { PeriodBar } from "./_components/period-bar";
import { SettingsView } from "./_components/settings-view";
import {
  buildPreviousNextHref,
  lastDayOfMonthInput,
  normalizeDateInput,
  normalizeMonthInput,
  resolveCostView,
  resolveMarginRange,
  todayKstInput,
} from "./_lib/costs-period";

type PageProps = {
  searchParams: Promise<{
    mode?: string;
    date?: string;
    month?: string;
    start?: string;
    end?: string;
    view?: string;
  }>;
};

const PAGE_TITLE = "원가 분석";
const PAGE_DESCRIPTION = "API 사용량, 결제 매출, 운영 손익";

export default async function AdminCostsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = resolveCostView(params.view);

  // 세 화면 모두 같은 기간 파라미터(mode/date/month/start/end)를 쓴다. 기본은 오늘(일별).
  const mode: CostPeriodMode = params.mode === "monthly" ? "monthly" : "daily";
  const today = todayKstInput();
  const dateValue = normalizeDateInput(params.date) ?? today;
  const monthValue = normalizeMonthInput(params.month) ?? dateValue.slice(0, 7);
  const startValue = normalizeDateInput(params.start);
  const endValue = normalizeDateInput(params.end);
  const isRange = Boolean(startValue && endValue);
  const periodArgs = { mode, dateValue, monthValue, startValue, endValue };

  if (view === "margin") {
    const { range, label, displayDate } = resolveMarginRange(periodArgs);
    const [margin, bep] = await Promise.all([
      getFeatureMarginAnalysis(range, displayDate),
      getFreeCreditBep(range, label),
    ]);
    return (
      <div className="space-y-6">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <CostTabs view="margin" />
        <PeriodBar
          caption="원가 집계 기간"
          label={label}
          prevHref={buildPreviousNextHref({ ...periodArgs, direction: -1, view: "margin" })}
          nextHref={buildPreviousNextHref({ ...periodArgs, direction: 1, view: "margin" })}
          period={{ ...periodArgs, isRange, view: "margin" }}
        />
        <MarginView margin={margin} bep={bep} />
      </div>
    );
  }

  const dashboard = await getOperationsCostDashboard(mode, {
    date: dateValue,
    month: monthValue,
    startDate: startValue ?? undefined,
    endDate: endValue ?? undefined,
  });
  const periodView = view === "settings" ? "settings" : undefined;
  const prevHref = buildPreviousNextHref({ ...periodArgs, direction: -1, view: periodView });
  const nextHref = buildPreviousNextHref({ ...periodArgs, direction: 1, view: periodView });

  // 정산·단가 폼 기본값 — 선택 기간의 시작·끝
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

  // 호버·클릭 상세 — 카드 조회와 같은 기간 파라미터
  const detailParams = {
    mode,
    options: {
      date: dateValue,
      month: monthValue,
      startDate: startValue ?? undefined,
      endDate: endValue ?? undefined,
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
      <CostTabs view={view} />

      {view === "dashboard" && dashboard.missingPricingKeys.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden />
          <div>
            <p className="font-semibold">
              단가 미설정으로 {formatNumber(dashboard.unpricedUsage.calls)}회 호출 원가가 0원 처리 중입니다.
            </p>
            <p className="mt-1 text-amber-700">{dashboard.missingPricingKeys.join(", ")}</p>
          </div>
        </div>
      )}

      <PeriodBar
        caption={view === "settings" ? "정산 기간" : "요약 기준"}
        label={dashboard.summaryLabel}
        prevHref={prevHref}
        nextHref={nextHref}
        period={{ ...periodArgs, isRange, view: periodView }}
      />

      {view === "dashboard" ? (
        <DashboardView dashboard={dashboard} detailParams={detailParams} />
      ) : (
        <SettingsView
          dashboard={dashboard}
          reconciliationPeriodStartValue={reconciliationPeriodStartValue}
          reconciliationPeriodEndValue={reconciliationPeriodEndValue}
          pricingEffectiveFromValue={pricingEffectiveFromValue}
        />
      )}
    </div>
  );
}
