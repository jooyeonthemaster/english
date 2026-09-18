"use client";

import { useState, type ReactNode } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Coins,
  Activity,
  Settings2,
  CalendarClock,
  MapPin,
  Users,
} from "lucide-react";
import { cn, formatDate as kstDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AdminTabs,
  PageHeader,
  StatCard,
  StatusBadge,
  useUrlTab,
} from "@/components/admin/kit";
import { ACADEMY_STATUS } from "@/lib/admin-labels";
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
  MiniStat,
  SectionCard,
} from "@/components/admin/member-detail/atoms";
import { MemoSection } from "@/components/admin/member-detail/memo-section";
import { CreditSummaryCards } from "@/components/admin/member-detail/credit-summary-cards";
import { PurchasesSection } from "@/components/admin/member-detail/purchases-section";
import { MemberBlock } from "@/components/admin/member-detail/member-block";
import { AcquisitionCard } from "@/components/admin/member-detail/acquisition-card";
import type { MemberDetail, MemberPurchaseItem } from "@/actions/admin-members";

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

// 시각 표기는 KST 고정 포매터(lib/utils)를 쓴다 — toLocale* 는 서버(UTC)·브라우저(KST) 결과가
// 달라 hydration 이 깨진다.
function formatDate(d: Date | string | null | undefined): string {
  return d ? kstDate(d) : "—";
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
  // 탭 상태는 ?tab= 에 남긴다(새로고침·링크 공유 시 같은 탭).
  const [tab, setTab] = useUrlTab<TabKey>("tab", initialTab, { defaultKey: "overview" });

  const balance = member.creditBalance?.balance ?? null;
  const totalAllocated = member.creditBalance?.totalAllocated ?? 0;
  const totalConsumed = member.creditBalance?.totalConsumed ?? 0;
  const monthlyAllocation = member.creditBalance?.monthlyAllocation ?? 0;
  const inflow = member.creditInflow;
  const expiresAtRaw = member.creditBalance?.expiresAt ?? null;
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;

  // dailyConsumption 은 「순증감」(사용 − 실패 환급)이라 드물게 음수 날이 있다
  // (전 기간 실측 1/587일, 최저 −19). 합계는 순증감 그대로 써야 「최근 30일 ≤ 누적 사용」이
  // 성립하고, 막대는 0 아래로 내려가면 안 되므로 그리기용 계열만 0 으로 막는다.
  const last30dTotal = member.dailyConsumption.reduce((sum, d) => sum + d.total, 0);
  const dailyChart = member.dailyConsumption.map((d) => ({
    day: d.day,
    total: Math.max(0, d.total),
  }));
  const activeDays = member.dailyConsumption.filter((d) => d.total > 0).length;

  const knownOperationTypes = member.consumptionByOp
    .map((c) => c.operationType)
    .filter((op): op is string => op !== null);

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

      <AdminTabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="학원 상세 탭"
        size="sm"
      />

      {/* 개요 */}
      {tab === "overview" && (
        <div className="space-y-4">
          <MemoSection memberId={member.id} initialMemo={member.academy.memo} />

          <CreditSummaryCards
            totalAllocated={totalAllocated}
            totalConsumed={totalConsumed}
            inflow={inflow}
            paidTopUps={member.paidTopUps}
            last30dTotal={last30dTotal}
          />

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
                  data={dailyChart}
                  width={400}
                  height={64}
                  className="w-full h-auto"
                />
              </div>
              <div className="grid grid-cols-3 mt-3 pt-3 border-t border-gray-50 text-center">
                <MiniStat
                  label="기본 배정"
                  value={`${monthlyAllocation.toLocaleString("ko-KR")}`}
                />
                <MiniStat
                  label="활성 일수"
                  value={`${activeDays}`}
                  suffix="일"
                />
                <MiniStat
                  label="활성일 평균"
                  value={
                    activeDays > 0
                      ? `${Math.round(last30dTotal / activeDays).toLocaleString("ko-KR")}`
                      : "—"
                  }
                />
              </div>
            </SectionCard>

            <SectionCard title="상품별 사용 분포" icon={<Settings2 />}>
              <UsageBreakdown data={member.consumptionByOp} />
            </SectionCard>
          </div>

          <AcquisitionCard academyId={member.academy.id} />

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
  const counts = member.academy.counts;
  const memberCount = member.academyStaff.length;
  const lowThreshold = member.creditBalance?.lowCreditThreshold ?? 50;
  const isLow = balance !== null && balance < lowThreshold;
  const dday =
    expiresAt !== null
      ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
      : null;

  return (
    <>
      <PageHeader
        title={member.academy.name}
        back={{ href: "/admin/members", label: "학원 · 회원 목록" }}
        crumbs={[{ label: member.academy.name }]}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge map={ACADEMY_STATUS} value={member.academy.status} />
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
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onToggle}
              title={`${member.name} 원장 ${member.isActive ? "비활성화" : "활성화"}`}
            >
              {member.isActive ? (
                <>
                  <ShieldOff className="size-3.5 text-gray-500" strokeWidth={2} aria-hidden />
                  원장 비활성화
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3.5 text-emerald-600" strokeWidth={2} aria-hidden />
                  원장 활성화
                </>
              )}
            </Button>
            <Button size="sm" onClick={onAdjust}>
              <Coins className="size-3.5" strokeWidth={2} aria-hidden />
              크레딧 조정
            </Button>
          </>
        }
      />

      {/* 학원 지표 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
    </>
  );
}

/** 학원 상세 상단 지표 — kit StatCard 의 sm 형태를 그대로 쓴다. */
function HeaderStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return <StatCard size="sm" label={label} value={value} sub={sub} />;
}
