import Link from "next/link";
import type { ReactNode } from "react";
import { BatteryLow, TimerReset } from "lucide-react";
import type { LowCreditAcademy, TrialEndingAcademy } from "@/actions/admin/dashboard";
import { AdminEmptyState, SectionCard } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import { lowCreditRowDetail, trialEndingRowDetail } from "./dashboard-list-hover-detail";

// 대시보드 우측 리스크 목록 — 크레딧 소진 임박 · 체험 종료 임박.
// 행은 호버 상세(추가 조회 없음) + 클릭 시 회원 관리 검색으로 이동.

function RiskRow({
  name,
  right,
  detail,
}: {
  name: string;
  right: ReactNode;
  detail: ReturnType<typeof lowCreditRowDetail>;
}) {
  return (
    <li>
      <AdminHoverDetail title={name} detail={detail} click="none" side="left">
        <Link
          href={`/admin/members?search=${encodeURIComponent(name)}`}
          className="flex items-center justify-between gap-2 px-5 py-2.5 transition-colors hover:bg-gray-50/60"
        >
          <span className="truncate text-[13px] text-gray-700">{name}</span>
          {right}
        </Link>
      </AdminHoverDetail>
    </li>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-[11px] tabular-nums text-gray-400">{formatNumber(n)}곳</span>;
}

export function DashboardRiskLists({
  lowCredit,
  trialEnding,
}: {
  lowCredit: LowCreditAcademy[];
  trialEnding: TrialEndingAcademy[];
}) {
  return (
    <div className="space-y-4">
      <SectionCard
        title="크레딧 소진 임박"
        icon={BatteryLow}
        actions={<Count n={lowCredit.length} />}
        padded={false}
      >
        {lowCredit.length === 0 ? (
          <AdminEmptyState compact title="해당 학원이 없습니다" />
        ) : (
          <ul className="divide-y divide-gray-50">
            {lowCredit.map((a) => (
              <RiskRow
                key={a.academyId}
                name={a.name}
                detail={lowCreditRowDetail(a)}
                right={
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-amber-600">
                    {formatNumber(a.balance)}
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="체험 종료 임박 (7일)"
        icon={TimerReset}
        actions={<Count n={trialEnding.length} />}
        padded={false}
      >
        {trialEnding.length === 0 ? (
          <AdminEmptyState compact title="해당 학원이 없습니다" />
        ) : (
          <ul className="divide-y divide-gray-50">
            {trialEnding.map((a) => (
              <RiskRow
                key={a.academyId}
                name={a.name}
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
    </div>
  );
}
