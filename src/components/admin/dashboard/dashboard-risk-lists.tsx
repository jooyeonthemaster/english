import Link from "next/link";
import type { ReactNode } from "react";
import { BatteryLow, TimerReset } from "lucide-react";
import type { LowCreditAcademy, TrialEndingAcademy } from "@/actions/admin/dashboard";
import { AdminEmptyState, SectionCard } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import type { AdminDetail } from "@/lib/admin-detail-types";
import { cn, formatNumber, formatRelativeTime } from "@/lib/utils";
import { lowCreditRowDetail, trialEndingRowDetail } from "./dashboard-list-hover-detail";

// 대시보드 우측 리스크 목록 — 크레딧 소진 임박 · 체험 종료 임박.
// 행은 호버 상세(추가 조회 없음) + 클릭 시 해당 학원 화면으로 이동.
//
// analytics-spec §9.2 의 수리를 이 구조 위에 얹었다:
//  · §9.3 — 행 클릭은 이름 검색(`/admin/members?search=…`)이 아니라 원장 회원 상세로 직행한다.
//    동명 학원·공백이 섞이면 검색은 0건이 나온다. 원장이 없으면 학원 상세로 보낸다.
//  · F6/D6 — 「임박(잔액이 남은 곳)」과 「이미 소진(잔액 0)」을 나눠 센다. 합쳐 세면 대부분 휴면인
//    0잔액이 충전 유도가 유효한 학원 수를 덮어쓴다(실측 임박 62곳 · 이미 소진 149곳).
//    머릿수를 안 넘기면 표시 행 수(최대 8)로 떨어지므로 「8곳」처럼 잘린 수를 세지 않게 주의.
//  · F9/D5 — 「체험 종료 임박」은 전 체험 종료 뒤 실DB 0건이다(26-09-18 재실측도 0건).
//    같은 자리에 「최근 가입 학원(7일)」(recent-signups-card.tsx)을 함께 두되, 빈 카드가 자리를
//    차지하지 않도록 hideWhenEmpty 로 접을 수 있게 했다.

function RiskRow({
  name,
  href,
  right,
  detail,
}: {
  name: string;
  href: string;
  right: ReactNode;
  detail: AdminDetail;
}) {
  return (
    <li>
      <AdminHoverDetail title={name} detail={detail} click="none" side="left">
        <Link
          href={href}
          className="flex items-center justify-between gap-2 px-5 py-2.5 transition-colors hover:bg-gray-50/60"
        >
          <span className="truncate text-[13px] text-gray-700">{name}</span>
          {right}
        </Link>
      </AdminHoverDetail>
    </li>
  );
}

/** 원장 회원 상세로, 원장이 없으면 학원 상세로(§9.3) */
function academyHref(a: { academyId: string; directorStaffId?: string | null }): string {
  return a.directorStaffId ? `/admin/members/${a.directorStaffId}` : `/admin/academies/${a.academyId}`;
}

function Count({ n }: { n: number }) {
  return <span className="text-[11px] tabular-nums text-gray-400">{formatNumber(n)}곳</span>;
}

/**
 * 크레딧 소진 임박. imminent/exhausted 를 주면 F6/D6 정의대로 나눠 세고,
 * 없으면 표시 행 수로 떨어진다(구 동작 유지).
 */
export function LowCreditCard({
  items,
  imminent,
  exhausted,
}: {
  items: LowCreditAcademy[];
  imminent?: number;
  exhausted?: number;
}) {
  const split = imminent !== undefined && exhausted !== undefined;
  return (
    <SectionCard
      title="크레딧 소진 임박"
      icon={BatteryLow}
      padded={false}
      actions={
        split ? (
          <span className="text-[11px] tabular-nums text-gray-400">
            임박 {formatNumber(imminent)}곳
            <span className="text-gray-300">
              {" · "}이미 소진 {formatNumber(exhausted)}곳
            </span>
          </span>
        ) : (
          <Count n={items.length} />
        )
      }
    >
      {items.length === 0 ? (
        <AdminEmptyState compact title="해당 학원이 없습니다" />
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((a) => (
            <RiskRow
              key={a.academyId}
              name={a.name}
              href={academyHref(a)}
              detail={lowCreditRowDetail(a)}
              right={
                <span
                  className={cn(
                    "shrink-0 text-[12px] font-semibold tabular-nums",
                    a.balance === 0 ? "text-gray-400" : "text-amber-600",
                  )}
                >
                  {a.balance === 0 ? "소진" : formatNumber(a.balance)}
                </span>
              }
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/**
 * 체험 종료 임박(7일). 실DB 0건이 기본값이라(F9) hideWhenEmpty 를 주면 카드 자체를 내지 않는다 —
 * 「최근 가입 학원(7일)」과 같은 열에 둘 때 빈 카드가 자리를 먹지 않게 하기 위한 것.
 */
export function TrialEndingCard({
  items,
  hideWhenEmpty = false,
}: {
  items: TrialEndingAcademy[];
  hideWhenEmpty?: boolean;
}) {
  if (hideWhenEmpty && items.length === 0) return null;
  return (
    <SectionCard
      title="체험 종료 임박 (7일)"
      icon={TimerReset}
      actions={<Count n={items.length} />}
      padded={false}
    >
      {items.length === 0 ? (
        <AdminEmptyState compact title="해당 학원이 없습니다" />
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((a) => (
            <RiskRow
              key={a.academyId}
              name={a.name}
              href={academyHref(a)}
              detail={trialEndingRowDetail(a)}
              right={
                <span className="shrink-0 text-[12px] text-gray-400">
                  {formatRelativeTime(a.trialEndsAt)}
                </span>
              }
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function DashboardRiskLists({
  lowCredit,
  trialEnding,
  lowCreditImminent,
  lowCreditExhausted,
  hideEmptyTrial = false,
}: {
  lowCredit: LowCreditAcademy[];
  trialEnding: TrialEndingAcademy[];
  /** F6/D6 — 잔액이 남은 임박 학원 수(표시 행 수가 아니다) */
  lowCreditImminent?: number;
  /** F6/D6 — 이미 소진(잔액 0) 학원 수 */
  lowCreditExhausted?: number;
  /** 체험 종료 임박이 0건이면 카드를 내지 않는다(F9) */
  hideEmptyTrial?: boolean;
}) {
  return (
    <div className="space-y-4">
      <LowCreditCard
        items={lowCredit}
        imminent={lowCreditImminent}
        exhausted={lowCreditExhausted}
      />
      <TrialEndingCard items={trialEnding} hideWhenEmpty={hideEmptyTrial} />
    </div>
  );
}
