"use client";

// ============================================================================
// 프로모션 모니터링 패널 — 프로모션/번들 공유 링크의 사용자 활동을 집계해
// 보여준다. 원가분석 페이지처럼 일별/월별/기간선택으로 기간을 바꿔가며 볼 수
// 있고, 선택 기간의 요약(카드/표)과 추이(막대)를 함께 표시한다.
//   · 방문(VIEW) = 랜딩 도달, 혜택받기(CLAIM) = CTA 클릭.
//   · 학원/회원 식별은 로그인한 원장만, 익명 방문은 총계에만 반영.
//   · 기간 컨트롤·차트·표는 promo-monitoring-panel-parts/ 로 분리.
// ============================================================================

import { useState, useTransition } from "react";
import { Activity, Building2, Eye, MousePointerClick, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  PromoMonitoringPayload,
  PromoMonitoringSelection,
} from "@/actions/admin/credit-promotion-monitoring";
import { getPromotionMonitoring } from "@/actions/admin/credit-promotion-monitoring";
import { AdminEmptyState, SectionCard, StatCard, StatGrid } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import type { Tone } from "@/lib/admin-labels";
import { cn } from "@/lib/utils";
import {
  monitoringSummaryDetail,
  type MonitoringSummaryKey,
} from "./promo-monitoring-panel-parts/monitoring-summary-detail";
import { PromoPeriodControls } from "./promo-monitoring-panel-parts/promo-period-controls";
import { TrendChart } from "./promo-monitoring-panel-parts/trend-chart";
import {
  AcademyTable,
  MemberTable,
  RecentActivityTable,
  TargetTable,
  fmt,
} from "./promo-monitoring-panel-parts/monitoring-tables";

const SUMMARY_CARDS: {
  key: MonitoringSummaryKey;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  value: (t: PromoMonitoringPayload["totals"]) => number;
  sub: (t: PromoMonitoringPayload["totals"]) => string;
}[] = [
  {
    key: "views",
    label: "총 링크 방문",
    icon: Eye,
    tone: "blue",
    value: (t) => t.views,
    sub: (t) => `식별 ${fmt(t.identifiedViews)} · 익명 ${fmt(t.anonViews)}`,
  },
  {
    key: "claims",
    label: "혜택받기 클릭",
    icon: MousePointerClick,
    tone: "emerald",
    value: (t) => t.claims,
    sub: () => "랜딩에서 CTA 누른 수",
  },
  {
    key: "visitors",
    label: "순 방문자",
    icon: Users,
    tone: "violet",
    value: (t) => t.uniqueVisitors,
    sub: () => "로그인+익명(근사)",
  },
  {
    key: "academies",
    label: "방문 학원",
    icon: Building2,
    tone: "amber",
    value: (t) => t.uniqueAcademies,
    sub: () => "링크를 눌러본 학원 수",
  },
];

export function PromoMonitoringPanel({
  initial,
}: {
  initial: PromoMonitoringPayload;
}) {
  const [data, setData] = useState(initial);
  const [selection, setSelection] = useState<PromoMonitoringSelection>(initial.selection);
  const [pending, startTransition] = useTransition();

  function apply(next: PromoMonitoringSelection) {
    setSelection(next);
    startTransition(async () => {
      try {
        const payload = await getPromotionMonitoring(next.mode, {
          date: next.date,
          month: next.month,
          startDate: next.start ?? undefined,
          endDate: next.end ?? undefined,
        });
        setData(payload);
      } catch {
        /* 실패는 조용히 — 기존 데이터 유지 */
      }
    });
  }

  const t = data.totals;
  const modeLabel = data.mode === "monthly" ? "월별" : "일별";

  return (
    <div className="space-y-5">
      {/* 기간 헤더 + 컨트롤 */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-gray-400">집계 기간</p>
          <p
            className={cn(
              "truncate text-[15px] font-bold text-gray-900 transition-opacity",
              pending && "opacity-60",
            )}
          >
            {data.summaryLabel}
          </p>
        </div>
        <PromoPeriodControls selection={selection} pending={pending} onChange={apply} />
      </div>

      {/* 데이터 영역 — 갱신 중엔 옅게 */}
      <div className={cn("space-y-5 transition-opacity", pending && "opacity-60")}>
        {/* 전체 요약 — StatCard 는 props 를 전달하지 않아 호버 상세는 div 로 감싼다. */}
        <StatGrid cols={4}>
          {SUMMARY_CARDS.map((card) => (
            <AdminHoverDetail
              key={card.key}
              title={card.label}
              detail={monitoringSummaryDetail(data, card.key)}
            >
              <div className="cursor-pointer rounded-xl transition-shadow hover:shadow-md">
                <StatCard
                  label={card.label}
                  value={fmt(card.value(t))}
                  sub={card.sub(t)}
                  icon={card.icon}
                  tone={card.tone}
                />
              </div>
            </AdminHoverDetail>
          ))}
        </StatGrid>

        {/* 추이 차트 */}
        <SectionCard
          title="기간 추이"
          description={`${modeLabel} 방문·혜택받기 클릭 (${data.rangeLabel})`}
          icon={Activity}
          padded={false}
        >
          <TrendChart series={data.series} />
        </SectionCard>

        {!data.hasEvents && (
          <AdminEmptyState
            compact
            icon={Activity}
            title={`선택한 기간(${data.summaryLabel})에 기록된 링크 활동이 없습니다.`}
            description="프로모션·번들 링크를 공유하면 방문/혜택받기 클릭이 여기 집계됩니다."
            className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60"
          />
        )}

        {/* 프로모션·번들별 */}
        <SectionCard
          title="프로모션·번들별 현황"
          description="공유 링크마다 방문(VIEW)과 혜택받기(CLAIM) 클릭 수"
          icon={Activity}
          padded={false}
        >
          <TargetTable data={data} />
        </SectionCard>

        {/* 학원별 / 회원별 나란히 */}
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard
            title="학원별 클릭"
            description="로그인한 원장이 링크를 눌러본 학원"
            icon={Building2}
            padded={false}
          >
            <AcademyTable rows={data.perAcademy} />
          </SectionCard>
          <SectionCard
            title="회원별 클릭"
            description="누가 링크를 눌러봤는지(로그인한 원장)"
            icon={User}
            padded={false}
          >
            <MemberTable rows={data.perMember} />
          </SectionCard>
        </div>

        {/* 최근 활동 */}
        <SectionCard
          title="최근 활동"
          description="선택 기간의 가장 최근 링크 방문·혜택받기 클릭"
          icon={Activity}
          padded={false}
        >
          <RecentActivityTable rows={data.recent} />
        </SectionCard>
      </div>
    </div>
  );
}
