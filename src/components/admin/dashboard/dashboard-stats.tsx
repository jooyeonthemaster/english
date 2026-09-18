"use client";

// 대시보드 지표 타일 — 처리 필요 스트립 · 오늘 현황 · 이번 달 수익성.
// 타일은 StatCard(md) 를 DashboardDetailBlock 으로 감싸 호버 상세·클릭 팝업이 붙는다.
// 서버 컴포넌트에서 아이콘(함수)을 넘길 수 없어 아이콘은 여기서 키로 고른다.
//
// analytics-spec §9.2 의 수리를 이 구조 위에 다시 얹었다:
//  · F2/F8 — 액션 타일의 보조 설명(hint: 「30분 이내 진행 중」·「미완료(이탈·만료) …」)을 렌더한다.
//    숫자의 정의가 타일 라벨에 없으면 「입금 대기 0 / 미완료 입금 14」가 무슨 뜻인지 화면에서 알 수 없다.
//  · 상세 팝오버는 getDashboardDetail 이 아는 키에만 붙인다 — 모르는 키(waiting-topups 계열)를 넘기면
//    팝오버가 「알 수 없는 상세 항목입니다.」 오류를 띄운다. 그 타일은 대신 목록으로 가는 링크로 만든다.
//  · D1 각주 — 일 단위 순매출은 음수가 될 수 있다(실측 2026-06-10 KST −19,800). 증감 배지는
//    분모에 |어제| 를 쓰고 부호가 바뀌는 전이는 % 대신 절대값을 적는 DeltaBadge 로 통일한다.
//    kit 의 Delta 는 분모가 부호 있는 yesterday 라 음수일에서 개선이 하락으로 뒤집힌다.

import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  Coins,
  FileText,
  Hourglass,
  LifeBuoy,
  Presentation,
  TimerOff,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardOverview } from "@/actions/admin";
import type { DashboardActionItem } from "@/actions/admin/dashboard";
import type { DashboardDetailKey } from "@/lib/admin-dashboard-detail-types";
import type { Tone } from "@/lib/admin-labels/tone";
import { StatCard, StatGrid } from "@/components/admin/kit";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DashboardDetailBlock } from "./dashboard-detail-block";
import { DeltaBadge } from "./delta-badge";

const ACTION_ICONS: Record<string, LucideIcon> = {
  deposits: Banknote,
  "waiting-topups": Hourglass,
  "waiting-topups-stale": TimerOff,
  support: LifeBuoy,
  seminars: Presentation,
};

/**
 * 상세 조회(getDashboardDetail)가 아는 액션 키. 여기 없는 키를 DashboardDetailBlock 에 넘기면
 * 팝오버가 오류 문구를 띄우므로, 모르는 키는 목록 링크 타일로 낸다.
 */
const ACTION_DETAIL_KEYS: readonly DashboardDetailKey[] = ["deposits", "support", "seminars"];

function actionDetailKey(key: string): DashboardDetailKey | null {
  return ACTION_DETAIL_KEYS.find((k) => k === key) ?? null;
}

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
  delta?: ReactNode;
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

/** 보조 설명(hint) — 숫자의 정의. 길어도 잘리지 않게 줄바꿈을 허용한다. */
function Hint({ text }: { text: string }) {
  return <span className="leading-snug">{text}</span>;
}

/** 처리 필요 스트립 타일 하나 */
function ActionTile({ item }: { item: DashboardActionItem }) {
  const active = item.count > 0;
  const tone: Tone = !active ? "gray" : item.urgent ? "rose" : "amber";
  const card = (
    <StatCard
      label={item.label}
      value={zeroMuted(item.count)}
      icon={ACTION_ICONS[item.key] ?? AlertTriangle}
      tone={tone}
      valueTone={active ? tone : undefined}
      alert={active}
      sub={item.hint ? <Hint text={item.hint} /> : undefined}
      className="h-full transition-shadow hover:shadow-md"
    />
  );

  const detailKey = actionDetailKey(item.key);
  if (detailKey) {
    return (
      <DashboardDetailBlock detailKey={detailKey} label={item.label} className="rounded-xl">
        {card}
      </DashboardDetailBlock>
    );
  }
  return (
    <Link
      href={item.href}
      aria-label={`${item.label} 목록으로 이동`}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      {card}
    </Link>
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
  // D1 각주 ③ — 분모 매출이 0 이하면 비율은 0.0% 가 아니라 「—」
  const marginPct =
    data.month.revenue > 0 ? Math.round((data.month.margin / data.month.revenue) * 100) : null;
  const revenueNegative = data.revenue.today < 0;

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
          {data.actionItems.map((item) => (
            <ActionTile key={item.key} item={item} />
          ))}
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
            valueTone={revenueNegative ? "rose" : undefined}
            delta={
              <DeltaBadge
                today={data.revenue.today}
                yesterday={data.revenue.yesterday}
                format={formatCurrency}
              />
            }
            sub={
              <Hint text={revenueNegative ? "환불만 있는 날 · 순매출 음수" : "환불 차감 후 순매출"} />
            }
            icon={Coins}
            tone="blue"
          />
          <DashboardStat
            detailKey="signups-today"
            label="신규 학원"
            value={formatNumber(data.signups.today)}
            delta={
              <DeltaBadge
                today={data.signups.today}
                yesterday={data.signups.yesterday}
                format={formatNumber}
              />
            }
            icon={Building2}
            tone="emerald"
          />
          <DashboardStat
            detailKey="questions-today"
            label="생성 문제"
            value={formatNumber(data.questions.today)}
            delta={
              <DeltaBadge
                today={data.questions.today}
                yesterday={data.questions.yesterday}
                format={formatNumber}
              />
            }
            icon={FileText}
            tone="violet"
          />
          <DashboardStat
            detailKey="credits-today"
            label="크레딧 소모"
            value={formatNumber(data.creditsConsumed.today)}
            delta={
              <DeltaBadge
                today={data.creditsConsumed.today}
                yesterday={data.creditsConsumed.yesterday}
                format={formatNumber}
              />
            }
            icon={Activity}
            tone="amber"
          />
          <DashboardStat
            detailKey="active-academies"
            label="활동 학원"
            value={formatNumber(data.activeAcademiesToday)}
            sub={<Hint text={`전체 활성 ${formatNumber(data.activeAcademiesTotal)}곳`} />}
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
            sub={<Hint text="환불 차감 후 순매출" />}
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
            sub={<Hint text={marginPct !== null ? `매출 대비 ${marginPct}%` : "매출 대비 —"} />}
          />
          <DashboardStat
            detailKey="errors-today"
            label="오늘 오류"
            value={zeroMuted(data.errorsToday)}
            valueTone={data.errorsToday > 0 ? "rose" : undefined}
            alert={data.errorsToday > 0}
            sub={<Hint text="AI·추출·결제 실패 합계" />}
          />
        </StatGrid>
      </section>
    </>
  );
}
