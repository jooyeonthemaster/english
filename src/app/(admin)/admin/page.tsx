import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDashboardOverview, type DashboardOverview } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, SectionCard } from "@/components/admin/kit";
import { DashboardAutoRefresh } from "@/components/admin/dashboard/dashboard-auto-refresh";
import { DashboardStats } from "@/components/admin/dashboard/dashboard-stats";
import { DashboardRiskLists } from "@/components/admin/dashboard/dashboard-risk-lists";
import { TrendChart } from "@/components/admin/dashboard/trend-chart";
import { AnalyticsLiveCard } from "@/components/admin/dashboard/analytics-live-card";
import { RecentSignupsCard } from "@/components/admin/dashboard/recent-signups-card";

export const dynamic = "force-dynamic";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
      {/* 유입 실시간 카드 */}
      <Skeleton className="h-[112px] rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[260px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[260px] rounded-xl" />
      </div>
    </div>
  );
}

/**
 * 크레딧 소진 임박 — 어드민 UI 규약(SectionCard·AdminHoverDetail·AdminEmptyState) 위에
 * analytics-spec §9.2 의 수정을 얹은 목록.
 *  · F6/D6 — 「임박」과 「이미 소진(잔액 0)」을 나눠 센다. 합쳐 세면 대부분 휴면인 0잔액이
 *    충전 유도가 유효한 학원 수를 덮어써 숫자가 부풀려진다.
 *  · §9.3 — 행 클릭은 이름 검색이 아니라 원장 회원 상세(원장이 없으면 학원 상세)로 직행한다.
 * 호버 상세는 추가 조회 없이 DashboardOverview 값만으로 만든다(lowCreditRowDetail).
 */
async function DashboardContent() {
  const data: DashboardOverview = await getDashboardOverview();

  return (
    <div className="space-y-6">
      {/* ①②③ 처리 필요 · 오늘 현황 · 이번 달 수익성 — 타일은 kit StatCard + 호버 상세.
          아이콘(함수)은 서버 컴포넌트에서 넘길 수 없어 클라이언트 쪽에서 키로 고른다. */}
      <DashboardStats data={data} />

      {/* 지표 정의 각주 — analytics-spec §9.2 F4·F5 / 결정 D1·D6.
          타일 라벨만으로는 드러나지 않는 정의를 화면에 못 박는다. */}
      <p className="text-[11px] leading-relaxed text-gray-400">
        「마진」은 결제 매출에서 AI 원가만 뺀 값입니다 — 고정비가 빠져 있어 원가 분석의 손익과
        다릅니다. 「활동 학원」은 오늘 크레딧을 쓴 곳, 「전체 활성」은 정지·해지를 뺀 학원
        수입니다.
      </p>

      {/* 유입 실시간 — 1st-party 수집(analytics-spec §5·§10).
          자체 폴링 없이 10분 자동 새로고침(generatedAt 변경)에 편승한다. */}
      <AnalyticsLiveCard refreshKey={data.generatedAt} />

      {/* ④ 추이 + 리스크 — 오른쪽 목록이 길어도 차트 카드가 빈 채로 늘어나지 않게 items-start */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <SectionCard title="최근 14일 매출·가입 추이" className="lg:col-span-2">
          <TrendChart data={data.trend} />
        </SectionCard>

        <div className="space-y-4">
          {/* 크레딧 소진 임박 + 체험 종료 임박(있을 때만) — 협업자 카드 모듈에 우리 F6/D6·F9 수리가 이식돼 있다. */}
          <DashboardRiskLists
            lowCredit={data.lowCreditAcademies}
            trialEnding={data.trialEndingSoon}
            lowCreditImminent={data.lowCreditImminent}
            lowCreditExhausted={data.lowCreditExhausted}
            hideEmptyTrial
          />
          {/* 최근 가입 학원(7일) — 구 「체험 종료 임박」 자리(§9.2 F9·D5).
              전 체험이 종료돼 항상 빈 목록이던 카드를 실제로 쓰이는 목록으로 바꿨다. */}
          <RecentSignupsCard
            items={data.recentSignups}
            total={data.recentSignupsTotal}
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardAutoRefresh />
      <PageHeader
        title="대시보드"
        description="실시간 운영 현황 · 처리 필요 항목과 오늘의 지표 · 10분마다 자동 새로고침"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/costs">
              상세 원가·매출 분석
              <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
