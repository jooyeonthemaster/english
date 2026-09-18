import type { ComponentProps, ReactNode } from "react";
import { Scale } from "lucide-react";
import type { FreeCreditBep, FreeGrantItem } from "@/actions/admin/free-credit-bep";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { bepDetails } from "@/components/admin/costs-parts/margin-hover-detail";

function pct(rate: number | null): string {
  return rate == null ? "—" : `${(rate * 100).toFixed(1)}%`;
}
const won = (n: number) => formatCurrency(Math.round(n));
/** 크레딧당 단가처럼 1원 미만이 의미를 갖는 값 — 반올림하면 곱셈이 안 맞는다(₩5 × 50 ≠ ₩259). */
const wonPrecise = (n: number) => `₩${formatNumber(Math.round(n * 10) / 10)}`;
const grantKindLabel: Record<FreeGrantItem["kind"], string> = {
  internal: "내부·테스트",
  large: "단건 대량",
  counted: "반영",
};

export function FreeCreditBepCard({ data }: { data: FreeCreditBep }) {
  const positive = data.netKrw >= 0;
  const belowBep =
    data.conversionRate != null &&
    data.bepConversionRate != null &&
    data.conversionRate < data.bepConversionRate;

  const coverPerPayer =
    data.profitPerPayerKrw != null && data.freeCostPerSignupKrw > 0
      ? Math.floor(data.profitPerPayerKrw / data.freeCostPerSignupKrw)
      : null;
  const { revenue } = data;
  const split = data.freeGrantSplit;
  const excludedCredits = split.internalCredits + split.largeCredits;
  const hasRevenueAdjustments =
    revenue.topUpRefunds > 0 || revenue.subscription > 0 || revenue.manualGrant > 0;
  // 호버=계산식 입력값 팝오버, 클릭=상세 팝업
  const details = bepDetails(data);

  return (
    <section className="rounded-xl border border-gray-100 bg-white">
      <div className="flex flex-col gap-2 border-b border-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Scale className="size-4 shrink-0 text-gray-400" strokeWidth={1.8} />
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">
              무료 크레딧 손익분기(BEP)
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-400">
              {data.rangeLabel} · 가입 증정·미션·쿠폰·관리자 지급 크레딧 원가 대비 유료 매출 손익
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              무료 원가는 내부·테스트 계정 제외 · 단건{" "}
              {formatNumber(split.largeThreshold)}C 이상 지급 분리(매출은 제외하지 않음)
            </p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex h-7 w-fit items-center rounded-full px-3 text-[12px] font-semibold tabular-nums",
            positive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700",
          )}
        >
          이 기간 {positive ? "흑자" : "적자"} {formatCurrency(data.netKrw)}
        </span>
      </div>

      {/* 전환율 핵심 3지표 */}
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
        <AdminHoverDetail title="누적 전환율" detail={details.conversion}>
          <BigStat
            label="누적 전환율"
            value={pct(data.conversionRate)}
            sub={`결제 학원 ${formatNumber(data.payingAcademies)} / 전체 가입 ${formatNumber(data.totalAcademies)}곳`}
            tone={belowBep ? "rose" : "emerald"}
          />
        </AdminHoverDetail>
        <AdminHoverDetail title="BEP 전환율" detail={details.bep}>
          <BigStat
            label="BEP 전환율"
            value={pct(data.bepConversionRate)}
            sub="누적 전환율이 이 이상이면 흑자 · 선택 기간 단가 기준"
            tone="slate"
          />
        </AdminHoverDetail>
        <AdminHoverDetail title="가입 1곳당 무료 원가" detail={details.freePerSignup}>
          <BigStat
            label="가입 1곳당 무료 원가"
            value={won(data.freeCostPerSignupKrw)}
            sub={`가입 지급 ${formatNumber(data.assumedFreeCreditsPerSignup)}C × 평균 원가/크레딧`}
            tone="slate"
          />
        </AdminHoverDetail>
      </div>

      {belowBep && (
        <div className="mx-5 mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          현재 전환율({pct(data.conversionRate)})이 손익분기({pct(data.bepConversionRate)})
          아래입니다 — 무료 회원이 늘수록 순손실이 커지는 구간입니다.
        </div>
      )}

      {/* 상세 */}
      <div className="grid grid-cols-1 gap-px border-t border-gray-50 bg-gray-50 min-[420px]:grid-cols-2 sm:grid-cols-4">
        <AdminHoverDetail title="평균 원가/크레딧" detail={details.avgCost}>
          <Cell
            label="평균 원가/크레딧"
            value={wonPrecise(data.avgCostPerCreditKrw)}
            note={
              data.rateSource === "actual"
                ? `실측 · 순소모 ${formatNumber(data.totalCreditsConsumed)}C${
                    data.refundedCredits > 0
                      ? `(실패 환불 ${formatNumber(data.refundedCredits)}C 차감)`
                      : ""
                  }`
                : "실측 부족 → 추정"
            }
          />
        </AdminHoverDetail>
        <AdminHoverDetail title="무료 지급 원가" detail={details.freeCost}>
          <Cell
            label="무료 지급 원가"
            value={formatCurrency(data.freeCostKrw)}
            note={
              excludedCredits > 0
                ? `${formatNumber(data.freeCreditsGranted)}C 반영 · 총 ${formatNumber(split.totalCredits)}C 중 ${formatNumber(excludedCredits)}C 분리`
                : `${formatNumber(data.freeCreditsGranted)}C 지급`
            }
          />
        </AdminHoverDetail>
        <AdminHoverDetail title="유료 매출 · 이익" detail={details.paid}>
          <Cell
            label="유료 매출 · 이익"
            value={formatCurrency(data.paidRevenueKrw)}
            note={`이익 ${formatCurrency(data.grossProfitKrw)} · 결제 학원 ${formatNumber(data.payersInPeriod)}곳`}
          />
        </AdminHoverDetail>
        <AdminHoverDetail title="유료 1곳당 이익" detail={details.profitPerPayer}>
          <Cell
            label="유료 1곳당 이익"
            value={won(data.profitPerPayerKrw ?? 0)}
            note={coverPerPayer != null ? `무료 가입 ${formatNumber(coverPerPayer)}곳 커버` : "—"}
          />
        </AdminHoverDetail>
      </div>

      {split.totalCount > 0 && (
        <div className="border-t border-gray-50 px-5 py-3">
          <p className="text-[12px] font-medium text-gray-600">
            무료 지급 {formatNumber(split.totalCredits)}C · {formatNumber(split.totalCount)}건
            {excludedCredits > 0 && " — 아래 분리분은 위 배지·원가에서 뺐습니다"}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[12px] tabular-nums text-gray-500">
            <li>
              원가 반영 {formatNumber(split.countedCredits)}C ·{" "}
              {formatNumber(split.countedCount)}건
            </li>
            {split.internalCredits > 0 && (
              <li>
                내부·테스트 계정 제외 {formatNumber(split.internalCredits)}C ·{" "}
                {formatNumber(split.internalCount)}건
              </li>
            )}
            {split.largeCredits > 0 && (
              <li>
                단건 {formatNumber(split.largeThreshold)}C 이상 분리{" "}
                {formatNumber(split.largeCredits)}C · {formatNumber(split.largeCount)}건
              </li>
            )}
          </ul>
          {split.top.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-gray-400">
              {split.top.map((item, i) => (
                <li key={`${item.occurredAt}-${i}`} className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-gray-500">{item.academyName}</span>
                  <span className="tabular-nums text-gray-600">
                    {formatNumber(item.credits)}C
                  </span>
                  <span
                    className={cn(
                      "rounded px-1 py-px text-[10px] font-medium",
                      item.kind === "counted"
                        ? "bg-gray-100 text-gray-500"
                        : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {grantKindLabel[item.kind]}
                  </span>
                  {item.description && (
                    <span className="min-w-0 truncate">{item.description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hasRevenueAdjustments && (
        <p className="border-t border-gray-50 px-5 pt-3 text-[12px] tabular-nums text-gray-500">
          유료 매출 내역: 충전 결제 {formatCurrency(revenue.topUpGross)}
          {revenue.topUpRefunds > 0 && ` − 환불 ${formatCurrency(revenue.topUpRefunds)}`}
          {revenue.subscription > 0 && ` + 구독 ${formatCurrency(revenue.subscription)}`}
          {revenue.manualGrant > 0 && ` + 무통장 수동지급 ${formatCurrency(revenue.manualGrant)}`}
        </p>
      )}

      <p className="px-5 py-3 text-[11px] leading-5 text-gray-400">
        손익 금액은 선택 기간 기준입니다. 누적 전환율만 누적 기준이고,{" "}
        <b className="font-semibold text-gray-500">BEP 전환율·유료 1곳당 이익은 선택 기간의
        평균 원가/크레딧을 누적 매출·크레딧에 적용</b>하므로 기간을 바꾸면 값이 달라집니다
        (같은 누적 전환율과 비교할 때 이 점을 감안하세요). 유료 매출 = 충전 결제액(결제일) −
        환불(환불일) + 구독 결제 + 무통장 수동지급. 누적 전환율 = 결제 완료 1회 이상 학원 ÷
        전체 가입 학원(내부·테스트·해지 학원 포함, 재구매 학원도 1곳으로 셈). 무료 지급 =
        양수 크레딧 지급 중 유료 충전에 연결된 지급을 뺀 전부(가입 지급·미션·쿠폰·추천·관리자
        조정 — 결제와 연결되지 않은 관리자 수동 지급도 여기에 잡힘). 그중 내부·테스트 계정
        지급과 단건 {formatNumber(split.largeThreshold)}C 이상 지급은 원가·배지에서 분리하고
        위에 금액을 그대로 표기합니다(합계 보존 · DB 는 변경하지 않음). 매출은 내부·테스트
        계정을 제외하지 않습니다. 평균 원가/크레딧 = API 원가 ÷ 순소모(실패 자동환불 차감).
        가입 1곳당 무료 원가 = 현재 가입 지급 설정{" "}
        {formatNumber(data.assumedFreeCreditsPerSignup)}C × 평균 원가/크레딧{" "}
        {wonPrecise(data.avgCostPerCreditKrw)}. 원가는 변동 API 원가만 반영(고정 인프라 제외).
        {data.rateSource === "estimate" &&
          " 이 기간 실측 소모 데이터가 부족해 추정 단가(₩17/C)를 사용했습니다."}
      </p>
    </section>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone,
  className,
  ...rest
}: {
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "rose" | "slate";
  /** 나머지 props 는 루트 div 로 전달 — AdminHoverDetail 로 바로 감쌀 수 있게. */
} & Omit<ComponentProps<"div">, "children">) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-gray-900";
  return (
    <div
      className={cn(
        "cursor-pointer rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 transition-colors hover:bg-gray-100/70",
        className,
      )}
      {...rest}
    >
      <p className="text-[12px] text-gray-400">{label}</p>
      <p className={cn("mt-1 text-[24px] font-bold tabular-nums", valueTone)}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>
    </div>
  );
}

function Cell({
  label,
  value,
  note,
  className,
  ...rest
}: {
  label: string;
  value: ReactNode;
  note: string;
  /** 나머지 props 는 루트 div 로 전달 — AdminHoverDetail 로 바로 감쌀 수 있게. */
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      className={cn("cursor-pointer bg-white px-4 py-3 transition-colors hover:bg-gray-50", className)}
      {...rest}
    >
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-gray-900">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-400">{note}</p>
    </div>
  );
}
