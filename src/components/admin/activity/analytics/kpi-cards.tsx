"use client";

// 요약 KPI — 분석 대시보드 최상단. 주요 4카드(md) + 보조 지표 6카드(sm).
// "이 회원은 계속 쓰고 있다 / 가입만 했다 / 3일 연속" 같은 직관을 즉시.
// 카드는 StatCard, 호버·클릭 상세는 바깥 div 가 받는다(카드는 이벤트를 모른다).

import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  CalendarRange,
  Flame,
  Moon,
  Timer,
  TrendingUp,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn, formatNumber } from "@/lib/utils";
import type { AcademyEngagement, AnalyticsKpis } from "@/lib/admin-analytics-types";
import type { Tone } from "@/lib/admin-labels/tone";
import { StatCard, StatGrid } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { buildKpiDetail, type KpiDetailKey } from "./kpi-cards-parts/kpi-hover-detail";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** 어제 대비 증감(건수) — 0 이면 표시하지 않는다 */
function CountDelta({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold",
        up ? "text-emerald-600" : "text-rose-500",
      )}
    >
      <span className="sr-only">{up ? "어제 대비 증가" : "어제 대비 감소"}</span>
      {up ? (
        <ArrowUp className="size-3" strokeWidth={2.5} aria-hidden />
      ) : (
        <ArrowDown className="size-3" strokeWidth={2.5} aria-hidden />
      )}
      {Math.abs(delta)}
    </span>
  );
}

/** 상세가 있으면 호버·클릭을 받는 카드 껍데기 */
function DetailShell({
  label,
  detailKey,
  detailOf,
  interactive,
  children,
}: {
  label: string;
  detailKey: KpiDetailKey;
  detailOf: (key: KpiDetailKey) => ReturnType<typeof buildKpiDetail> | null;
  interactive: boolean;
  children: ReactNode;
}) {
  return (
    <AdminHoverDetail title={label} detail={detailOf(detailKey)} disabled={!interactive}>
      <div
        className={cn(
          "h-full rounded-xl outline-none",
          interactive &&
            "cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-300",
        )}
      >
        {children}
      </div>
    </AdminHoverDetail>
  );
}

type PrimaryCard = {
  label: string;
  detailKey: KpiDetailKey;
  value: string;
  delta?: number;
  sub: string;
  icon: LucideIcon;
  tone: Tone;
};
type SecondaryCard = { label: string; detailKey: KpiDetailKey; value: string; icon: LucideIcon };

export function KpiCards({
  kpis,
  engagement,
}: {
  kpis: AnalyticsKpis;
  /** 학원별 인게이지먼트 — 있으면 카드 호버/클릭 시 해당 학원 목록을 보여준다. */
  engagement?: AcademyEngagement[];
}) {
  // 카드 상세는 이미 받은 학원 행에서 같은 기준으로 다시 골라낸다(추가 조회 없음).
  const detailOf = (key: KpiDetailKey) =>
    engagement ? buildKpiDetail(key, kpis, engagement) : null;
  const interactive = Boolean(engagement);

  const primary: PrimaryCard[] = [
    {
      label: "활성화율",
      detailKey: "activationRate",
      value: pct(kpis.activationRate),
      sub: `${formatNumber(kpis.totalAcademies)}곳 중 ${formatNumber(kpis.activatedAcademies)}곳 활동`,
      icon: TrendingUp,
      tone: "blue",
    },
    {
      label: "오늘 활동 학원",
      detailKey: "activeToday",
      value: formatNumber(kpis.activeToday),
      delta: kpis.activeToday - kpis.activeYesterday,
      sub: `어제 ${formatNumber(kpis.activeYesterday)}곳`,
      icon: Activity,
      tone: "emerald",
    },
    {
      label: "가입만 한 학원",
      detailKey: "signupOnly",
      value: formatNumber(kpis.signupOnly),
      sub: kpis.totalAcademies ? `전체의 ${pct(kpis.signupOnly / kpis.totalAcademies)}` : "—",
      icon: UserMinus,
      tone: "gray",
    },
    {
      label: "3일+ 연속 활동",
      detailKey: "streak3plus",
      value: formatNumber(kpis.streak3plus),
      sub: `7일+ ${formatNumber(kpis.streak7plus)}곳`,
      icon: Flame,
      tone: "violet",
    },
  ];

  const secondary: SecondaryCard[] = [
    { label: "주간 활동 (WAU)", detailKey: "activeWeek", value: formatNumber(kpis.activeWeek), icon: CalendarCheck },
    { label: "월간 활동 (MAU)", detailKey: "activeMonth", value: formatNumber(kpis.activeMonth), icon: CalendarRange },
    {
      label: "신규 가입 7일/30일",
      detailKey: "newAcademies",
      value: `${formatNumber(kpis.newAcademies7d)} / ${formatNumber(kpis.newAcademies30d)}`,
      icon: TrendingUp,
    },
    { label: "휴면 학원", detailKey: "dormant", value: formatNumber(kpis.dormant), icon: Moon },
    { label: "평균 연속일", detailKey: "avgStreak", value: kpis.avgCurrentStreak.toFixed(1), icon: Flame },
    {
      label: "활성화 소요(중앙값)",
      detailKey: "medianActivate",
      value:
        kpis.medianDaysToActivate === null ? "—" : `${Math.round(kpis.medianDaysToActivate)}일`,
      icon: Timer,
    },
  ];

  return (
    <div className="space-y-3">
      <StatGrid cols={4}>
        {primary.map((card) => (
          <DetailShell
            key={card.label}
            label={card.label}
            detailKey={card.detailKey}
            detailOf={detailOf}
            interactive={interactive}
          >
            <StatCard
              label={card.label}
              value={card.value}
              icon={card.icon}
              tone={card.tone}
              delta={card.delta !== undefined ? <CountDelta delta={card.delta} /> : undefined}
              sub={card.sub}
              className="h-full"
            />
          </DetailShell>
        ))}
      </StatGrid>

      <StatGrid cols={6}>
        {secondary.map((item) => (
          <DetailShell
            key={item.label}
            label={item.label}
            detailKey={item.detailKey}
            detailOf={detailOf}
            interactive={interactive}
          >
            <StatCard size="sm" label={item.label} value={item.value} icon={item.icon} className="h-full" />
          </DetailShell>
        ))}
      </StatGrid>
    </div>
  );
}
