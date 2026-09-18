"use client";

import { CheckCircle2, Clock3, CreditCard, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatCard, StatGrid } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { getPaymentsBlockDetail } from "@/actions/admin/detail/payments";
import type { PaymentsBlockKey } from "@/lib/admin-block-detail/payments";
import type { AdminDetailRowActionHandler } from "@/lib/admin-detail-types";
import type { Tone } from "@/lib/admin-labels/tone";
import { formatKstDateTimeShort } from "@/lib/admin-kst-format";
import type { AdminTopUp, AdminTopUpStats } from "./types";

// 결제 관리 상단 지표 4장. 카드마다 호버 상세(getPaymentsBlockDetail)가 붙는다.
// 숫자·자구의 기준은 서버 집계(src/lib/admin-credit-topup-stats.ts) — 매출 정의는
// admin-revenue.ts(D1), 대기는 「진행 중 / 미완료(이탈·만료)」로 갈라 부른다(§9.2 F2·D3).
// DB 상태는 바꾸지 않는다: 시간창을 넘긴 주문도 PENDING/WAITING 그대로 두고 표시만 나눈다.

function HoverStatCard({
  detailKey,
  label,
  value,
  sub,
  icon,
  tone,
  title,
  onRowAction,
}: {
  detailKey: PaymentsBlockKey;
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone: Tone;
  /** 집계 기준 설명(툴팁) */
  title?: string;
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
        <StatCard label={label} value={value} sub={sub} icon={icon} tone={tone} title={title} />
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
  const won = (v: number) => v.toLocaleString("ko-KR");
  const todaySub = `${won(stats.todayCount)}건 · ${won(stats.todayCredits)}C${
    stats.todayRefundCount > 0
      ? ` · 환불 ${won(stats.todayRefundAmount)}원(${stats.todayRefundCount}건)`
      : ""
  }`;
  // 「최근 …」은 마지막 충전 완료 시각이므로 완료 카드에 붙는다(실패 카드가 아니라).
  const completedSub =
    `${won(stats.completedCount)}건 · ${won(stats.completedRevenue)}원 · 환불 건 제외` +
    (latestCompleted ? ` · 최근 ${formatKstDateTimeShort(latestCompleted.completedAt)}` : "");

  return (
    <StatGrid cols={4}>
      <HoverStatCard
        detailKey="today"
        label="오늘 결제(완료 · KST)"
        value={`${won(stats.todayRevenue)}원`}
        sub={todaySub}
        icon={CreditCard}
        tone="blue"
      />
      <HoverStatCard
        detailKey="completed"
        label="누적 충전 완료(전체 기간)"
        value={`${won(stats.completedCredits)}C`}
        sub={completedSub}
        icon={CheckCircle2}
        tone="emerald"
      />
      <HoverStatCard
        detailKey="pending"
        label="결제 진행 중"
        value={`${won(stats.pendingActiveCount)}건`}
        sub={`미완료(이탈·만료) ${won(stats.pendingStaleCount)}건 · 주문 ${won(stats.pendingStaleAmount)}원 — 매출 아님`}
        title={`카드 결제 ${stats.pendingStaleMinutes}분 · 무통장 입금 ${stats.bankStaleMinutes}분(자동 매칭 창) 이내면 「진행 중」, 넘기면 「미완료(이탈·만료)」로 봅니다. DB 상태는 바꾸지 않습니다.`}
        icon={Clock3}
        tone="sky"
      />
      <HoverStatCard
        detailKey="failed"
        label={`확인 필요 · 결제 실패(최근 ${stats.reviewWindowDays}일 주문)`}
        value={`${won(stats.failedCount)}건`}
        sub={`최근 ${stats.reviewWindowDays}일 주문 중 취소 ${won(stats.cancelledCount)}건 · 같은 기간 환불 ${won(stats.refundedCount)}건(환불일 기준)`}
        title="실패·취소는 주문 생성일 기준, 환불은 환불일 기준으로 셉니다(매출 정의와 동일). 관리자가 「확인」 처리한 실패 건은 빠집니다."
        icon={XCircle}
        tone="rose"
        onRowAction={onFailedRowAction}
      />
    </StatGrid>
  );
}
