"use client";

// 대시보드 지표 타일 — 처리 필요 스트립 · 오늘 현황 · 이번 달 수익성.
// 모든 타일은 StatCard(md) 를 DashboardDetailBlock 으로 감싸 호버 상세·클릭 팝업이 붙는다.
// 서버 컴포넌트에서 아이콘(함수)을 넘길 수 없어 아이콘은 여기서 키로 고른다.

import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  Coins,
  FileText,
  LifeBuoy,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DashboardOverview } from "@/actions/admin";
import type { DashboardDetailKey } from "@/lib/admin-dashboard-detail-types";
import type { Tone } from "@/lib/admin-labels/tone";
import { StatCard, StatGrid } from "@/components/admin/kit";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DashboardDetailBlock } from "./dashboard-detail-block";

const ACTION_ICONS: Record<string, LucideIcon> = {
  deposits: Banknote,
  support: LifeBuoy,
  seminars: Presentation,
};

/** 상세 블록 + 통계 카드 한 벌 */
function DashboardStat({
  detailKey,
  label,
  value,
  icon,
  tone,
  valueTone,
  delta,
  sub,
  alert,
}: {
  detailKey: DashboardDetailKey;
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  valueTone?: Tone;
  delta?: { today: number; yesterday: number };
  sub?: ReactNode;
  alert?: boolean;
}) {
  return (
    <DashboardDetailBlock detailKey={detailKey} label={label} className="rounded-xl">
      <StatCard
        label={label}
        value={value}
        icon={icon}
        tone={tone}
        valueTone={valueTone}
        delta={delta}
        sub={sub}
        alert={alert}
        className="h-full transition-shadow hover:shadow-md"
      />
    </DashboardDetailBlock>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-[13px] font-semibold text-gray-500">{children}</h2>;
}

/** 0 은 옅게 — 처리할 것이 없다는 뜻 */
function zeroMuted(n: number, formatted = formatNumber(n)): ReactNode {
  return n > 0 ? formatted : <span className="text-gray-300">{formatted}</span>;
}

export function DashboardStats({ data }: { data: DashboardOverview }) {
  const totalActions = data.actionItems.reduce((s, a) => s + a.count, 0);
  const marginPct =
    data.month.revenue > 0 ? Math.round((data.month.margin / data.month.revenue) * 100) : null;

  return (
    <>
      {/* ① 처리 필요 스트립 */}
      <section>
        <GroupTitle>
          처리 필요{" "}
          <span className={totalActions > 0 ? "text-rose-600" : "text-gray-400"}>
            {formatNumber(totalActions)}건
          </span>
        </GroupTitle>
        <StatGrid cols={3}>
          {data.actionItems.map((item) => {
            const active = item.count > 0;
            const tone: Tone = !active ? "gray" : item.urgent ? "rose" : "amber";
            return (
              <DashboardStat
                key={item.key}
                detailKey={item.key as DashboardDetailKey}
                label={item.label}
                value={zeroMuted(item.count)}
                icon={ACTION_ICONS[item.key] ?? AlertTriangle}
                tone={tone}
                valueTone={active ? tone : undefined}
                alert={active}
              />
            );
          })}
        </StatGrid>
      </section>

      {/* ② 오늘 현황 */}
      <section>
        <GroupTitle>오늘 현황</GroupTitle>
        <StatGrid cols={5}>
          <DashboardStat
            detailKey="revenue-today"
            label="오늘 매출"
            value={formatCurrency(data.revenue.today)}
            delta={data.revenue}
            icon={Coins}
            tone="blue"
          />
          <DashboardStat
            detailKey="signups-today"
            label="신규 학원"
            value={formatNumber(data.signups.today)}
            delta={data.signups}
            icon={Building2}
            tone="emerald"
          />
          <DashboardStat
            detailKey="questions-today"
            label="생성 문제"
            value={formatNumber(data.questions.today)}
            delta={data.questions}
            icon={FileText}
            tone="violet"
          />
          <DashboardStat
            detailKey="credits-today"
            label="크레딧 소모"
            value={formatNumber(data.creditsConsumed.today)}
            delta={data.creditsConsumed}
            icon={Activity}
            tone="amber"
          />
          <DashboardStat
            detailKey="active-academies"
            label="활동 학원"
            value={formatNumber(data.activeAcademiesToday)}
            sub={`전체 활성 ${formatNumber(data.activeAcademiesTotal)}`}
            icon={Building2}
            tone="gray"
          />
        </StatGrid>
      </section>

      {/* ③ 이번 달 수익성 */}
      <section>
        <GroupTitle>이번 달 수익성</GroupTitle>
        <StatGrid cols={4}>
          <DashboardStat
            detailKey="month-revenue"
            label="이번 달 매출"
            value={formatCurrency(data.month.revenue)}
          />
          <DashboardStat
            detailKey="month-ai-cost"
            label="AI 원가"
            value={formatCurrency(data.month.aiCostKrw)}
          />
          <DashboardStat
            detailKey="month-margin"
            label="마진"
            value={formatCurrency(data.month.margin)}
            valueTone={data.month.margin >= 0 ? "emerald" : "rose"}
            sub={marginPct !== null ? `매출 대비 ${marginPct}%` : undefined}
          />
          <DashboardStat
            detailKey="errors-today"
            label="오늘 오류"
            value={zeroMuted(data.errorsToday)}
            valueTone={data.errorsToday > 0 ? "rose" : undefined}
            alert={data.errorsToday > 0}
            sub="AI·추출·결제 실패 합계"
          />
        </StatGrid>
      </section>
    </>
  );
}
