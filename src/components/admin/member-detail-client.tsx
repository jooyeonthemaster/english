"use client";

import { useState } from "react";
import {
  Mail,
  Phone,
  Building2,
  ShieldCheck,
  ShieldOff,
  Coins,
  Wallet,
  TrendingDown,
  TrendingUp,
  Activity,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "@/components/admin/provider-badge";
import { CreditAdjustModal } from "@/components/admin/member-detail/credit-adjust-modal";
import { ActiveToggleModal } from "@/components/admin/member-detail/active-toggle-modal";
import { UsageBreakdown } from "@/components/admin/member-detail/usage-breakdown";
import { UsageSparkline } from "@/components/admin/member-detail/usage-sparkline";
import { TransactionTable } from "@/components/admin/member-detail/transaction-table";
import {
  Avatar,
  CreditKpi,
  MiniStat,
  SectionCard,
} from "@/components/admin/member-detail/atoms";
import { IdentitySection } from "@/components/admin/member-detail/identity-section";
import { AcademySection } from "@/components/admin/member-detail/academy-section";
import { SubscriptionSection } from "@/components/admin/member-detail/subscription-section";
import type { MemberDetail } from "@/actions/admin-members";

interface MemberDetailClientProps {
  member: MemberDetail;
  initialTransactions: {
    items: Array<{
      id: string;
      type: string;
      typeLabel: string;
      amount: number;
      balanceAfter: number;
      operationType: string | null;
      operationLabel: string;
      description: string | null;
      referenceId: string | null;
      referenceType: string | null;
      staffId: string | null;
      adminId: string | null;
      metadata: string | null;
      createdAt: Date | string;
    }>;
    nextCursor: string | null;
  };
}

export function MemberDetailClient({
  member,
  initialTransactions,
}: MemberDetailClientProps) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const balance = member.creditBalance?.balance ?? null;
  const totalAllocated = member.creditBalance?.totalAllocated ?? 0;
  const totalConsumed = member.creditBalance?.totalConsumed ?? 0;
  const monthlyAllocation = member.creditBalance?.monthlyAllocation ?? 0;
  const bonusCredits = member.creditBalance?.bonusCredits ?? 0;

  const last30dTotal = member.dailyConsumption.reduce(
    (sum, d) => sum + d.total,
    0,
  );

  const activeSubscription =
    member.subscriptions.find(
      (s) => s.status === "ACTIVE" || s.status === "TRIAL",
    ) ?? member.subscriptions[0] ?? null;

  const knownOperationTypes = member.consumptionByOp
    .map((c) => c.operationType)
    .filter((op): op is string => op !== null);

  return (
    <>
      <HeroHeader
        member={member}
        onAdjust={() => setAdjustOpen(true)}
        onToggle={() => setToggleOpen(true)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <IdentitySection member={member} />
          <AcademySection academy={member.academy} />
          <SubscriptionSection activeSubscription={activeSubscription} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CreditKpi
              label="현재 잔고"
              value={balance}
              icon={<Wallet />}
              accent="primary"
              suffix={
                balance !== null && balance < 50 ? (
                  <span className="text-[11px] text-rose-600 font-medium">
                    잔고 낮음
                  </span>
                ) : null
              }
            />
            <CreditKpi
              label="누적 충전"
              value={totalAllocated}
              icon={<TrendingUp />}
              accent="emerald"
              suffix={
                <span className="text-[11px] text-gray-400">
                  보너스 {bonusCredits.toLocaleString("ko-KR")}
                </span>
              }
            />
            <CreditKpi
              label="누적 사용"
              value={totalConsumed}
              icon={<TrendingDown />}
              accent="rose"
              suffix={
                <span className="text-[11px] text-gray-400 tabular-nums">
                  최근 30일 {last30dTotal.toLocaleString("ko-KR")}
                </span>
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="최근 30일 사용 추이" icon={<Activity />}>
              <div className="flex items-end justify-between mb-2">
                <span className="text-[22px] font-bold text-gray-900 tabular-nums leading-none">
                  {last30dTotal.toLocaleString("ko-KR")}
                  <span className="text-[12px] font-normal text-gray-400 ml-1">
                    C
                  </span>
                </span>
                <span className="text-[11px] text-gray-400 uppercase tracking-wider">
                  30 days
                </span>
              </div>
              <div className="-mx-1 overflow-hidden">
                <UsageSparkline
                  data={member.dailyConsumption}
                  width={400}
                  height={64}
                  className="w-full h-auto"
                />
              </div>
              <div className="grid grid-cols-3 mt-3 pt-3 border-t border-gray-50 text-center">
                <MiniStat
                  label="월 정기"
                  value={`${monthlyAllocation.toLocaleString("ko-KR")}`}
                />
                <MiniStat
                  label="활성 일수"
                  value={`${member.dailyConsumption.length}`}
                  suffix="일"
                />
                <MiniStat
                  label="활성일 평균"
                  value={
                    member.dailyConsumption.length > 0
                      ? `${Math.round(last30dTotal / member.dailyConsumption.length).toLocaleString("ko-KR")}`
                      : "—"
                  }
                />
              </div>
            </SectionCard>

            <SectionCard title="상품별 사용 분포" icon={<Settings2 />}>
              <UsageBreakdown data={member.consumptionByOp} />
            </SectionCard>
          </div>

          {/* Keyed on initial transactions identity so router.refresh()
              after credit-adjust remounts the table with new server props
              instead of stale local state. */}
          <TransactionTable
            key={`${initialTransactions.items[0]?.id ?? "empty"}-${initialTransactions.items.length}`}
            memberId={member.id}
            initial={initialTransactions}
            knownOperationTypes={knownOperationTypes}
          />
        </div>
      </div>

      <CreditAdjustModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        memberId={member.id}
        memberName={member.name}
        currentBalance={balance}
      />
      <ActiveToggleModal
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        memberId={member.id}
        memberName={member.name}
        currentlyActive={member.isActive}
      />
    </>
  );
}

// ─── Hero header ────────────────────────────────────────────────────────────

function HeroHeader({
  member,
  onAdjust,
  onToggle,
}: {
  member: MemberDetail;
  onAdjust: () => void;
  onToggle: () => void;
}) {
  return (
    <header className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <Avatar name={member.name} avatarUrl={member.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] font-bold text-gray-900 truncate">
                {member.name}
              </h1>
              <ProviderBadge provider={member.authProvider} size="md" />
              {member.isActive ? (
                <Badge
                  variant="secondary"
                  className="bg-emerald-50 text-emerald-700 border-0 text-[11px] font-medium px-2"
                >
                  활성
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-gray-100 text-gray-500 border-0 text-[11px] font-medium px-2"
                >
                  비활성
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-[12px] text-gray-500 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Mail
                  className="size-3.5 text-gray-400"
                  strokeWidth={1.8}
                  aria-hidden
                />
                {member.email}
              </span>
              {member.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone
                    className="size-3.5 text-gray-400"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                  {member.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Building2
                  className="size-3.5 text-gray-400"
                  strokeWidth={1.8}
                  aria-hidden
                />
                {member.academy.name}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[12px]"
            onClick={onToggle}
          >
            {member.isActive ? (
              <>
                <ShieldOff
                  className="size-3.5 mr-1.5 text-gray-500"
                  strokeWidth={2}
                  aria-hidden
                />
                비활성화
              </>
            ) : (
              <>
                <ShieldCheck
                  className="size-3.5 mr-1.5 text-emerald-600"
                  strokeWidth={2}
                  aria-hidden
                />
                활성화
              </>
            )}
          </Button>
          <Button
            size="sm"
            className="h-9 text-[12px] bg-blue-600 hover:bg-blue-700"
            onClick={onAdjust}
          >
            <Coins className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
            크레딧 조정
          </Button>
        </div>
      </div>
    </header>
  );
}
