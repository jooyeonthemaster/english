"use client";

import { CheckCircle2, Clock3, CreditCard, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatCard, StatGrid } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { getPaymentsBlockDetail } from "@/actions/admin/detail/payments";
import type { PaymentsBlockKey } from "@/lib/admin-block-detail/payments";
import type { AdminDetailRowActionHandler } from "@/lib/admin-detail-types";
import type { Tone } from "@/lib/admin-labels/tone";
import { formatDate } from "@/components/admin/credit-promotion-editor";
import type { AdminTopUp, AdminTopUpStats } from "./types";

// 결제 관리 상단 지표 4장. 카드마다 호버 상세(getPaymentsBlockDetail)가 붙는다.

function HoverStatCard({
  detailKey,
  label,
  value,
  sub,
  icon,
  tone,
  onRowAction,
}: {
  detailKey: PaymentsBlockKey;
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone: Tone;
  /** 상세 팝업 표의 행 버튼 동작(확인 필요 → 실패 건 확인 처리) */
  onRowAction?: AdminDetailRowActionHandler;
}) {
  return (
    <AdminHoverDetail
      title={label}
      load={() => getPaymentsBlockDetail(detailKey)}
      cacheKey={`payments:${detailKey}`}
      onRowAction={onRowAction}
    >
      {/* StatCard 는 DOM 이벤트를 받지 않으므로 호버·클릭은 이 래퍼가 받는다. */}
      <div className="cursor-pointer rounded-xl outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500/30">
        <StatCard label={label} value={value} sub={sub} icon={icon} tone={tone} />
      </div>
    </AdminHoverDetail>
  );
}

export function PaymentMetricCards({
  stats,
  latestCompleted,
  onFailedRowAction,
}: {
  stats: AdminTopUpStats;
  latestCompleted: AdminTopUp | null;
  onFailedRowAction: AdminDetailRowActionHandler;
}) {
  return (
    <StatGrid cols={4}>
      <HoverStatCard
        detailKey="today"
        label="오늘 결제"
        value={`${stats.todayRevenue.toLocaleString("ko-KR")}원`}
        sub={`${stats.todayCount.toLocaleString("ko-KR")}건 · ${stats.todayCredits.toLocaleString("ko-KR")}C`}
        icon={CreditCard}
        tone="blue"
      />
      <HoverStatCard
        detailKey="completed"
        label="충전 완료"
        value={`${stats.completedCredits.toLocaleString("ko-KR")}C`}
        sub={`${stats.completedCount.toLocaleString("ko-KR")}건 · ${stats.completedRevenue.toLocaleString("ko-KR")}원`}
        icon={CheckCircle2}
        tone="emerald"
      />
      <HoverStatCard
        detailKey="pending"
        label="대기"
        value={`${stats.pendingCount.toLocaleString("ko-KR")}건`}
        sub="결제 또는 입금 확인 중"
        icon={Clock3}
        tone="sky"
      />
      <HoverStatCard
        detailKey="failed"
        label="확인 필요"
        value={`${stats.failedCount.toLocaleString("ko-KR")}건`}
        sub={
          latestCompleted ? `최근 ${formatDate(latestCompleted.completedAt)}` : "완료 내역 없음"
        }
        icon={XCircle}
        tone="rose"
        onRowAction={onFailedRowAction}
      />
    </StatGrid>
  );
}
