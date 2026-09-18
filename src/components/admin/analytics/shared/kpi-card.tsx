"use client";

// KPI 카드 — 값 + 직전 동일 기간 대비 증감. lowerIsBetter 면 감소가 초록.

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { deltaPct, fmtInt, fmtPct } from "@/lib/analytics/format";

/**
 * 증감률이 이 값을 넘으면 %가 아니라 「이전 N」으로 표기한다.
 * 임계를 previous 크기(구 `< 10`)로 걸면 같은 그리드 안에서 방문자 「이전 5」 옆에 페이지뷰 「13818.8%」
 * (previous=16)가 나란히 찍힌다 — 실측 사례. 규칙은 previous 크기와 무관하게 하나만 쓴다.
 */
const HUGE_DELTA_PCT = 300;

function defaultFormat(n: number): string {
  return Number.isInteger(n) ? fmtInt(n) : String(Math.round(n * 10) / 10);
}

export function KpiCard({
  label,
  value,
  current,
  previous,
  lowerIsBetter = false,
  hint,
  className,
  formatValue = defaultFormat,
  badgeSuffix,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  lowerIsBetter?: boolean;
  hint?: string;
  className?: string;
  /** 「이전 N」에 쓸 포맷터(기본: 정수 천단위, 소수 1자리) */
  formatValue?: (n: number) => string;
  /** 라벨 옆에 붙는 작은 배지(예: 「필터 무관」) */
  badgeSuffix?: React.ReactNode;
}) {
  const d = current !== undefined && previous !== undefined ? deltaPct(current, previous) : undefined;
  let badge: React.ReactNode = null;
  if (d === null) {
    badge = <span className="text-[11.5px] font-semibold text-emerald-600">신규</span>;
  } else if (d !== undefined) {
    if (d === 0) {
      badge = <span className="text-[11.5px] text-gray-400">변화 없음</span>;
    } else {
      const up = d > 0;
      const good = lowerIsBetter ? !up : up;
      // 증감률이 너무 크면 %가 무의미하다 → 이전 값을 그대로 보여준다.
      const huge = previous !== undefined && Math.abs(d) >= HUGE_DELTA_PCT;
      badge = (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[11.5px] font-semibold",
            good ? "text-emerald-600" : "text-rose-500",
          )}
        >
          {up ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
          {huge ? `이전 ${formatValue(previous)}` : fmtPct(Math.abs(d))}
        </span>
      );
    }
  }
  return (
    <div className={cn("rounded-xl border border-gray-100 bg-white p-4", className)}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium text-gray-400">
        <span>{label}</span>
        {badgeSuffix}
      </div>
      <div className="mt-2 text-[24px] font-bold leading-none tracking-tight text-gray-900 tabular-nums">{value}</div>
      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-0.5">
        {badge}
        {hint && <span className="text-[11.5px] text-gray-400">{hint}</span>}
      </div>
    </div>
  );
}
