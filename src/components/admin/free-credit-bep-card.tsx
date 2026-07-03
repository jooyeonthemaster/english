import type { ReactNode } from "react";
import { Scale } from "lucide-react";
import type { FreeCreditBep } from "@/actions/admin/free-credit-bep";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

function pct(rate: number | null): string {
  return rate == null ? "—" : `${(rate * 100).toFixed(1)}%`;
}
const won = (n: number) => formatCurrency(Math.round(n));

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

  return (
    <section className="rounded-xl border border-gray-100 bg-white">
      <div className="flex flex-col gap-2 border-b border-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-gray-400" strokeWidth={1.8} />
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">
              무료 크레딧 손익분기(BEP)
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-400">
              {data.rangeLabel} · 신규 증정·보너스 크레딧 원가 대비 유료 전환 손익
            </p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex h-7 w-fit items-center rounded-full px-3 text-[12px] font-semibold",
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
        <BigStat
          label="누적 전환율"
          value={pct(data.conversionRate)}
          sub={`누적 유료 ${formatNumber(data.payingAcademies)} / 전체 ${formatNumber(data.totalAcademies)}학원`}
          tone={belowBep ? "rose" : "emerald"}
        />
        <BigStat
          label="BEP 전환율"
          value={pct(data.bepConversionRate)}
          sub="이 이상이면 흑자"
          tone="slate"
        />
        <BigStat
          label="1인당 무료 원가"
          value={won(data.freeCostPerSignupKrw)}
          sub={`무료 ${formatNumber(data.assumedFreeCreditsPerSignup)}C × ${won(data.avgCostPerCreditKrw)}/C`}
          tone="slate"
        />
      </div>

      {belowBep && (
        <div className="mx-5 mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          현재 전환율({pct(data.conversionRate)})이 손익분기({pct(data.bepConversionRate)})
          아래입니다 — 무료 회원이 늘수록 순손실이 커지는 구간입니다.
        </div>
      )}

      {/* 상세 */}
      <div className="grid grid-cols-2 gap-px border-t border-gray-50 bg-gray-50 sm:grid-cols-4">
        <Cell
          label="평균 원가/크레딧"
          value={won(data.avgCostPerCreditKrw)}
          note={
            data.rateSource === "actual"
              ? `실측 · 소모 ${formatNumber(data.totalCreditsConsumed)}C`
              : "실측 부족 → 추정"
          }
        />
        <Cell
          label="무료 지급 원가"
          value={formatCurrency(data.freeCostKrw)}
          note={`${formatNumber(data.freeCreditsGranted)}C 지급`}
        />
        <Cell
          label="유료 매출 · 이익"
          value={formatCurrency(data.paidRevenueKrw)}
          note={`이익 ${formatCurrency(data.grossProfitKrw)} · 이 기간 전환 ${formatNumber(data.payersInPeriod)}건`}
        />
        <Cell
          label="전환 1인 이익"
          value={won(data.profitPerPayerKrw ?? 0)}
          note={coverPerPayer != null ? `무료 ${coverPerPayer}명 커버` : "—"}
        />
      </div>

      <p className="px-5 py-3 text-[11px] leading-5 text-gray-400">
        손익 금액은 선택 기간 기준, 전환율·BEP는 누적 기준(가입-결제 시점 불일치로
        하루 단위 전환율은 왜곡되기 때문). 1인당 무료 원가 = 가입 증정{" "}
        {formatNumber(data.assumedFreeCreditsPerSignup)}C × 평균 원가/크레딧. 원가는
        변동 API 원가만 반영(고정 인프라 제외).
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
}: {
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "rose" | "slate";
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
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
}: {
  label: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-gray-900">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-400">{note}</p>
    </div>
  );
}
