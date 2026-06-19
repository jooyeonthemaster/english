// 요약 KPI — 분석 대시보드 최상단. 주요 4카드 + 보조 지표 스트립.
// "이 회원은 계속 쓰고 있다 / 가입만 했다 / 3일 연속" 같은 직관을 즉시.

import {
  TrendingUp,
  Activity,
  UserMinus,
  Flame,
  CalendarCheck,
  CalendarRange,
  Moon,
  Timer,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import type { AnalyticsKpis } from "@/lib/admin-analytics-types";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function KpiCards({ kpis }: { kpis: AnalyticsKpis }) {
  const delta = kpis.activeToday - kpis.activeYesterday;
  const primary = [
    {
      label: "활성화율",
      value: pct(kpis.activationRate),
      subtitle: `${formatNumber(kpis.totalAcademies)}곳 중 ${formatNumber(
        kpis.activatedAcademies,
      )}곳 활동`,
      icon: TrendingUp,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      label: "오늘 활동 학원",
      value: formatNumber(kpis.activeToday),
      delta,
      subtitle: `어제 ${formatNumber(kpis.activeYesterday)}곳`,
      icon: Activity,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      label: "가입만 한 학원",
      value: formatNumber(kpis.signupOnly),
      subtitle: kpis.totalAcademies
        ? `전체의 ${pct(kpis.signupOnly / kpis.totalAcademies)}`
        : "—",
      icon: UserMinus,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
    },
    {
      label: "3일+ 연속 활동",
      value: formatNumber(kpis.streak3plus),
      subtitle: `7일+ ${formatNumber(kpis.streak7plus)}곳`,
      icon: Flame,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
    },
  ];

  const secondary = [
    {
      label: "주간 활동 (WAU)",
      value: formatNumber(kpis.activeWeek),
      icon: CalendarCheck,
    },
    {
      label: "월간 활동 (MAU)",
      value: formatNumber(kpis.activeMonth),
      icon: CalendarRange,
    },
    {
      label: "신규 가입 7일/30일",
      value: `${formatNumber(kpis.newAcademies7d)} / ${formatNumber(
        kpis.newAcademies30d,
      )}`,
      icon: TrendingUp,
    },
    {
      label: "휴면 학원",
      value: formatNumber(kpis.dormant),
      icon: Moon,
    },
    {
      label: "평균 연속일",
      value: kpis.avgCurrentStreak.toFixed(1),
      icon: Flame,
    },
    {
      label: "활성화 소요(중앙값)",
      value:
        kpis.medianDaysToActivate === null
          ? "—"
          : `${Math.round(kpis.medianDaysToActivate)}일`,
      icon: Timer,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {primary.map((card) => {
          const Icon = card.icon;
          const showDelta =
            typeof card.delta === "number" && card.delta !== 0;
          const up = (card.delta ?? 0) > 0;
          return (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-gray-100 p-5 flex items-start justify-between"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">
                  {card.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[28px] font-bold text-gray-900 leading-tight">
                    {card.value}
                  </span>
                  {showDelta && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[12px] font-semibold",
                        up ? "text-emerald-600" : "text-rose-500",
                      )}
                    >
                      <span className="sr-only">
                        {up ? "어제 대비 증가" : "어제 대비 감소"}
                      </span>
                      {up ? (
                        <ArrowUp className="size-3" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <ArrowDown
                          className="size-3"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      )}
                      {Math.abs(card.delta as number)}
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-gray-400 truncate">
                  {card.subtitle}
                </span>
              </div>
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
                  card.iconBg,
                )}
              >
                <Icon className={cn("size-5", card.iconColor)} strokeWidth={1.8} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {secondary.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon
                  className="size-3.5 text-gray-300 shrink-0"
                  strokeWidth={1.8}
                  aria-hidden
                />
                <span className="text-[11px] text-gray-400 truncate">
                  {item.label}
                </span>
              </div>
              <span className="text-[15px] font-semibold text-gray-800 tabular-nums shrink-0">
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
