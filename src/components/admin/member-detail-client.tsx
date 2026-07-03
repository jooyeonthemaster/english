"use client";

import { useState, type ReactNode } from "react";
import {
  Building2,
  ShieldCheck,
  ShieldOff,
  Coins,
  TrendingDown,
  TrendingUp,
  Activity,
  Settings2,
  CalendarClock,
  MapPin,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditAdjustModal } from "@/components/admin/member-detail/credit-adjust-modal";
import { CreditExpiryModal } from "@/components/admin/member-detail/credit-expiry-modal";
import { ActiveToggleModal } from "@/components/admin/member-detail/active-toggle-modal";
import { UsageBreakdown } from "@/components/admin/member-detail/usage-breakdown";
import { UsageSparkline } from "@/components/admin/member-detail/usage-sparkline";
import { TransactionTable } from "@/components/admin/member-detail/transaction-table";
import { ActivityTimeline } from "@/components/admin/member-detail/activity-timeline";
import { AcademyContentBrowser } from "@/components/admin/academy-content-browser";
import type { ActivityItem } from "@/lib/admin-activity-types";
import {
  CreditKpi,
  MiniStat,
  SectionCard,
} from "@/components/admin/member-detail/atoms";
import { MemoSection } from "@/components/admin/member-detail/memo-section";
import { PurchasesSection } from "@/components/admin/member-detail/purchases-section";
import { MemberBlock } from "@/components/admin/member-detail/member-block";
import type { MemberDetail, MemberPurchaseItem } from "@/actions/admin-members";

// Academy.status → 가입 경로 중심 뱃지(목록과 동일 규칙).
const ACADEMY_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  TRIAL: { label: "자가 가입", className: "bg-sky-50 text-sky-600" },
  ACTIVE: { label: "관리자 승인", className: "bg-emerald-50 text-emerald-600" },
  SUSPENDED: { label: "정지", className: "bg-rose-50 text-rose-600" },
  DEACTIVATED: { label: "비활성", className: "bg-gray-100 text-gray-500" },
};

type TabKey = "overview" | "members" | "transactions" | "content" | "activity";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "members", label: "회원" },
  { key: "transactions", label: "거래 이력" },
  { key: "activity", label: "활동" },
  { key: "content", label: "학원자료" },
];

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
      actorName: string | null;
      actorType: "staff" | "admin" | null;
      metadata: string | null;
      createdAt: Date | string;
    }>;
    nextCursor: string | null;
  };
  initialActivity: {
    items: ActivityItem[];
    nextBefore: string | null;
  };
  purchases: MemberPurchaseItem[];
  initialTab: TabKey;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function MemberDetailClient({
  member,
  initialTransactions,
  initialActivity,
  purchases,
  initialTab,
}: MemberDetailClientProps) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>(initialTab);

  const balance = member.creditBalance?.balance ?? null;
  const totalAllocated = member.creditBalance?.totalAllocated ?? 0;
  const totalConsumed = member.creditBalance?.totalConsumed ?? 0;
  const monthlyAllocation = member.creditBalance?.monthlyAllocation ?? 0;
  const bonusCredits = member.creditBalance?.bonusCredits ?? 0;
  const expiresAtRaw = member.creditBalance?.expiresAt ?? null;
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;

  const last30dTotal = member.dailyConsumption.reduce((sum, d) => sum + d.total, 0);

  const knownOperationTypes = member.consumptionByOp
    .map((c) => c.operationType)
    .filter((op): op is string => op !== null);

  function changeTab(next: TabKey) {
    if (next === tab) return;
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  return (
    <>
      <AcademyHeader
        member={member}
        balance={balance}
        expiresAt={expiresAt}
        onAdjust={() => setAdjustOpen(true)}
        onToggle={() => setToggleOpen(true)}
        onExpiry={() => setExpiryOpen(true)}
      />

      {/* Tabs */}
      <div className="border-b border-gray-100">
        <div className="flex gap-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              className={cn(
                "relative px-1 py-2.5 text-[13px] font-medium transition-colors outline-none",
                tab === t.key
                  ? "text-gray-900"
                  : "text-gray-400 hover:text-gray-600",
              )}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 개요 */}
      {tab === "overview" && (
        <div className="space-y-4">
          <MemoSection memberId={member.id} initialMemo={member.academy.memo} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <span className="text-[12px] font-normal text-gray-400 ml-1">C</span>
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

          <PurchasesSection purchases={purchases} />
        </div>
      )}

      {/* 회원 — 회원별로 [회원 정보 + 맞춤 문자] 블록이 아래로 쌓임 */}
      {tab === "members" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Users className="size-4 text-gray-400" strokeWidth={1.8} aria-hidden />
            <h3 className="text-[14px] font-semibold text-gray-800">
              소속 회원 {member.academyStaff.length}명
            </h3>
            <span className="text-[11px] text-gray-400">
              · 크레딧·구입·콘텐츠는 학원 단위로 공유됩니다
            </span>
          </div>
          {member.academyStaff.map((s) => (
            <MemberBlock
              key={s.id}
              staff={s}
              academyName={member.academy.name}
              consumptionByOp={member.consumptionByOp}
              dailyConsumption={member.dailyConsumption}
              isCurrent={s.id === member.id}
            />
          ))}
        </div>
      )}

      {/* 거래 이력 */}
      {tab === "transactions" && (
        <TransactionTable
          key={`${initialTransactions.items[0]?.id ?? "empty"}-${initialTransactions.items.length}`}
          memberId={member.id}
          initial={initialTransactions}
          knownOperationTypes={knownOperationTypes}
        />
      )}

      {/* 콘텐츠 */}
      {tab === "content" && (
        <AcademyContentBrowser
          academyId={member.academy.id}
          passageCount={member.academy.counts.passages}
          questionCount={member.academy.counts.questions}
          examCount={member.academy.counts.exams}
        />
      )}

      {/* 활동 */}
      {tab === "activity" && (
        <ActivityTimeline memberId={member.id} initial={initialActivity} />
      )}

      <CreditAdjustModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        memberId={member.id}
        memberName={member.name}
        currentBalance={balance}
      />
      <CreditExpiryModal
        open={expiryOpen}
        onOpenChange={setExpiryOpen}
        memberId={member.id}
        memberName={member.name}
        currentBalance={balance}
        currentExpiresAt={expiresAt}
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

// ─── Academy header (학원 요약 + KPI + 액션) ──────────────────────────────────

function AcademyHeader({
  member,
  balance,
  expiresAt,
  onAdjust,
  onToggle,
  onExpiry,
}: {
  member: MemberDetail;
  balance: number | null;
  expiresAt: string | null;
  onAdjust: () => void;
  onToggle: () => void;
  onExpiry: () => void;
}) {
  const originBadge = ACADEMY_STATUS_BADGE[member.academy.status];
  const counts = member.academy.counts;
  const memberCount = member.academyStaff.length;
  const lowThreshold = member.creditBalance?.lowCreditThreshold ?? 50;
  const isLow = balance !== null && balance < lowThreshold;
  const dday =
    expiresAt !== null
      ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
      : null;

  return (
    <header className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div
            className="size-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"
            aria-hidden
          >
            <Building2 className="size-7" strokeWidth={1.7} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] font-bold text-gray-900 truncate">
                {member.academy.name}
              </h1>
              {originBadge && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "border-0 text-[11px] font-medium px-2",
                    originBadge.className,
                  )}
                >
                  {originBadge.label}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[12px] text-gray-400 flex-wrap">
              <span>/{member.academy.slug}</span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" strokeWidth={1.8} aria-hidden />
                {formatDate(member.academy.createdAt)} 개설
              </span>
              {member.academy.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" strokeWidth={1.8} aria-hidden />
                  {member.academy.address}
                </span>
              )}
              <span className="text-gray-500">원장 {member.name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[12px]"
            onClick={onToggle}
            title={`${member.name} 원장 ${member.isActive ? "비활성화" : "활성화"}`}
          >
            {member.isActive ? (
              <>
                <ShieldOff className="size-3.5 mr-1.5 text-gray-500" strokeWidth={2} aria-hidden />
                원장 비활성화
              </>
            ) : (
              <>
                <ShieldCheck className="size-3.5 mr-1.5 text-emerald-600" strokeWidth={2} aria-hidden />
                원장 활성화
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

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HeaderStat
          label="크레딧 잔고"
          value={
            <span className={cn(isLow && "text-rose-600")}>
              {balance === null ? "미생성" : `${balance.toLocaleString("ko-KR")} C`}
            </span>
          }
          sub={
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-400">
                {dday === null ? "소멸기한 없음" : dday < 0 ? "만료됨" : `D-${dday} 소멸`}
              </span>
              <button
                type="button"
                onClick={onExpiry}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                소멸기한
              </button>
            </div>
          }
        />
        <HeaderStat label="회원" value={`${memberCount}명`} />
        <HeaderStat label="학생" value={`${counts.students.toLocaleString("ko-KR")}명`} />
        <HeaderStat
          label="학원자료"
          value={
            <span className="text-[13px] font-semibold text-gray-800 tabular-nums">
              지문 {counts.passages} · 문제 {counts.questions} · 시험 {counts.exams}
            </span>
          }
        />
      </div>
    </header>
  );
}

function HeaderStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 px-3.5 py-2.5">
      <div className="text-[11px] font-medium text-gray-400">{label}</div>
      <div className="mt-1 text-[18px] font-bold text-gray-900 leading-none tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  );
}
