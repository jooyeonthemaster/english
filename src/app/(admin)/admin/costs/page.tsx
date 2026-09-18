import { AlertTriangle, Info } from "lucide-react";
import { getOperationsCostDashboard, type CostPeriodMode } from "@/actions/admin";
import { getFeatureMarginAnalysis } from "@/actions/admin/feature-margin";
import { getFreeCreditBep } from "@/actions/admin/free-credit-bep";
import { getPaidSubscriptionPaymentCount } from "@/actions/admin/operations-cost";
import { PageHeader } from "@/components/admin/kit";
import { formatCurrency, formatNumber } from "@/lib/utils";
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

  // 구독 결제 누적 건수는 대시보드 조회와 병렬로 — 매출 카드 보조문구·매출 정의 주석(F10)의 근거다.
  const [dashboard, paidSubscriptionPayments] = await Promise.all([
    getOperationsCostDashboard(mode, {
      date: dateValue,
      month: monthValue,
      startDate: startValue ?? undefined,
      endDate: endValue ?? undefined,
    }),
    getPaidSubscriptionPaymentCount(),
  ]);
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
        <>
          <RevenueDefinitionNote
            refundKrw={dashboard.current.refundKrw}
            paidSubscriptionPayments={paidSubscriptionPayments}
          />
          <DashboardView
            dashboard={dashboard}
            detailParams={detailParams}
            paidSubscriptionPayments={paidSubscriptionPayments}
          />
        </>
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

/**
 * 매출 정의 고정 표기 — 카드 호버 상세는 터치 기기에서 열리지 않으므로 화면에 박아 둔다.
 * D1: 환불은 결제일 매출을 지우지 않고 환불일에 차감한다(단일 진실원 src/lib/admin-revenue.ts).
 * F10: 구독 결제 이력이 0건이면 예상 MRR 은 실현 매출이 아니다.
 */
function RevenueDefinitionNote({
  refundKrw,
  paidSubscriptionPayments,
}: {
  refundKrw: number;
  paidSubscriptionPayments: number;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-[12px] leading-5 text-gray-500">
      <Info className="mt-0.5 size-3.5 shrink-0 text-gray-400" strokeWidth={1.8} aria-hidden />
      <p>
        매출 = 충전 결제액(결제일) − 환불(환불일) + 구독 결제 + 무통장 수동지급, 모두 KST 기준입니다.
        환불은 결제일 매출을 지우지 않고 환불일에 차감하므로, 환불이 결제보다 큰 날은 매출이 음수가 되고
        마진율은 정의되지 않습니다.
        {refundKrw > 0 && ` 이 기간에는 환불 −${formatCurrency(refundKrw)}이 반영돼 있습니다.`}
        {paidSubscriptionPayments === 0 &&
          " 구독 결제 이력은 0건 — 예상 MRR 은 미결제 ACTIVE 구독의 월 요금 합이라 실현 매출이 아닙니다."}
      </p>
    </div>
  );
}
