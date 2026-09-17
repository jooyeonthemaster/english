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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[260px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[260px] rounded-xl" />
      </div>
    </div>
  );
}

async function DashboardContent() {
  const data: DashboardOverview = await getDashboardOverview();

  return (
    <div className="space-y-6">
      <DashboardStats data={data} />

      {/* ④ 추이 + 리스크 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="최근 14일 매출·가입 추이" className="lg:col-span-2">
          <TrendChart data={data.trend} />
        </SectionCard>
        <DashboardRiskLists
          lowCredit={data.lowCreditAcademies}
          trialEnding={data.trialEndingSoon}
        />
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
