import { Suspense } from "react";
import Link from "next/link";
import { getDashboardOverview, type DashboardOverview } from "@/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  Hourglass,
  UserPlus,
  LifeBuoy,
  Presentation,
  AlertTriangle,
  Building2,
  FileText,
  Coins,
  Activity,
  BatteryLow,
  ArrowRight,
  TimerOff,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DashboardAutoRefresh } from "@/components/admin/dashboard/dashboard-auto-refresh";
import { DeltaBadge } from "@/components/admin/dashboard/delta-badge";
import { TrendChart } from "@/components/admin/dashboard/trend-chart";
import { AnalyticsLiveCard } from "@/components/admin/dashboard/analytics-live-card";
import { RecentSignupsCard } from "@/components/admin/dashboard/recent-signups-card";

export const dynamic = "force-dynamic";

const ACTION_ICONS: Record<string, typeof Banknote> = {
  deposits: Banknote,
  "waiting-topups": Hourglass,
  "waiting-topups-stale": TimerOff,
  registrations: UserPlus,
  support: LifeBuoy,
  seminars: Presentation,
};

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[92px] rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[260px] rounded-2xl lg:col-span-2" />
        <Skeleton className="h-[260px] rounded-2xl" />
      </div>
    </div>
  );
}

function PulseCard({
  label,
  value,
  today,
  yesterday,
  format = formatNumber,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  today: number;
  yesterday: number;
  /** 증감 배지의 「이전 …」 표기 포맷터(매출이면 formatCurrency) */
  format?: (n: number) => string;
  icon: typeof Coins;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-gray-400">{label}</span>
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${iconBg}`}>
          <Icon className={`size-4 ${iconColor}`} strokeWidth={1.9} />
        </div>
      </div>
      <div className="mt-3 text-[30px] font-bold text-gray-900 leading-none tracking-tight">
        {value}
      </div>
      <div className="mt-2">
        <DeltaBadge today={today} yesterday={yesterday} format={format} />
      </div>
    </div>
  );
}

async function DashboardContent() {
  const data: DashboardOverview = await getDashboardOverview();

  const totalActions = data.actionItems.reduce((s, a) => s + a.count, 0);
  const marginPct =
    data.month.revenue > 0
      ? Math.round((data.month.margin / data.month.revenue) * 100)
      : null;

  return (
    <div className="space-y-6">
      {/* ① 액션 필요 스트립 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {data.actionItems.map((item) => {
          const Icon = ACTION_ICONS[item.key] ?? AlertTriangle;
          const active = item.count > 0;
          const tone = !active
            ? "border-gray-100 bg-white"
            : item.urgent
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50";
          const numColor = !active
            ? "text-gray-300"
            : item.urgent
              ? "text-rose-600"
              : "text-amber-600";
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded-2xl border p-4 transition-colors hover:brightness-[0.98] ${tone}`}
            >
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500">
                <Icon className="size-3.5" strokeWidth={1.9} />
                {item.label}
              </div>
              <div className={`mt-2 text-[26px] font-bold leading-none tabular-nums ${numColor}`}>
                {item.count}
              </div>
              {item.hint && (
                <div className="mt-1.5 text-[11px] leading-snug text-gray-400">
                  {item.hint}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* ② 오늘의 맥박 */}
      <div>
        <h2 className="text-[13px] font-semibold text-gray-500 mb-3">오늘 현황</h2>
        <div className="mb-4">
          <AnalyticsLiveCard refreshKey={data.generatedAt} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <PulseCard
            label="오늘 매출"
            value={formatCurrency(data.revenue.today)}
            today={data.revenue.today}
            yesterday={data.revenue.yesterday}
            format={formatCurrency}
            icon={Coins}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <PulseCard
            label="신규 학원"
            value={formatNumber(data.signups.today)}
            today={data.signups.today}
            yesterday={data.signups.yesterday}
            icon={Building2}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
          <PulseCard
            label="생성 문제"
            value={formatNumber(data.questions.today)}
            today={data.questions.today}
            yesterday={data.questions.yesterday}
            icon={FileText}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
          />
          <PulseCard
            label="크레딧 소모"
            value={formatNumber(data.creditsConsumed.today)}
            today={data.creditsConsumed.today}
            yesterday={data.creditsConsumed.yesterday}
            icon={Activity}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-gray-400">활동 학원</span>
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100">
                <Building2 className="size-4 text-slate-600" strokeWidth={1.9} />
              </div>
            </div>
            <div className="mt-3 text-[30px] font-bold text-gray-900 leading-none tracking-tight">
              {formatNumber(data.activeAcademiesToday)}
            </div>
            <div className="mt-2 text-[12px] leading-snug text-gray-400">
              오늘 크레딧 소모 기준
              <br />
              전체 {formatNumber(data.activeAcademiesTotal)}곳(정지·해지 제외)
            </div>
          </div>
        </div>
      </div>

      {/* ③ 이번 달 수익성 */}
      <div>
        <h2 className="text-[13px] font-semibold text-gray-500 mb-3">이번 달 수익성</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <span className="text-[12px] font-medium text-gray-400">이번 달 매출</span>
            <div className="mt-2 text-[26px] font-bold text-gray-900 leading-none">
              {formatCurrency(data.month.revenue)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <span className="text-[12px] font-medium text-gray-400">AI 원가</span>
            <div className="mt-2 text-[26px] font-bold text-gray-700 leading-none">
              {formatCurrency(data.month.aiCostKrw)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <span className="text-[12px] font-medium text-gray-400">AI 원가 차감 마진</span>
            <div
              className={`mt-2 text-[26px] font-bold leading-none ${
                data.month.margin >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatCurrency(data.month.margin)}
            </div>
            <div className="mt-1.5 text-[12px] leading-snug text-gray-400">
              {marginPct !== null && <div>매출 대비 {marginPct}%</div>}
              <div>고정비 미포함 · 원가 분석 손익과 다름</div>
            </div>
          </div>
          <div
            className={`rounded-2xl border p-5 ${
              data.errorsToday > 0
                ? "border-rose-200 bg-rose-50"
                : "border-gray-100 bg-white"
            }`}
          >
            <span className="text-[12px] font-medium text-gray-400">오늘 오류</span>
            <div
              className={`mt-2 text-[26px] font-bold leading-none ${
                data.errorsToday > 0 ? "text-rose-600" : "text-gray-300"
              }`}
            >
              {formatNumber(data.errorsToday)}
            </div>
            <div className="mt-1.5 text-[12px] text-gray-400">
              AI·추출·결제 실패 합계
            </div>
          </div>
        </div>
      </div>

      {/* ④ 추이 + 리스크 (오른쪽 목록이 길어도 차트 카드가 빈 채로 늘어나지 않게 items-start) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:items-start">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2">
          <h3 className="text-[14px] font-semibold text-gray-800 mb-4">
            최근 14일 매출·가입 추이
          </h3>
          <TrendChart data={data.trend} />
        </div>

        <div className="space-y-4">
          {/* 크레딧 소진 임박 */}
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-50">
              <BatteryLow className="size-4 text-amber-500" strokeWidth={1.9} />
              <h3 className="text-[13px] font-semibold text-gray-800">
                크레딧 소진 임박
              </h3>
              {/* 잔액 0(이미 소진·대부분 휴면)과 충전 유도가 유효한 임박을 나눠 센다 */}
              <span className="ml-auto text-[11px] text-gray-400 tabular-nums">
                임박 {formatNumber(data.lowCreditImminent)}곳
                <span className="text-gray-300">
                  {" · "}이미 소진 {formatNumber(data.lowCreditExhausted)}곳
                </span>
              </span>
            </div>
            {data.lowCreditAcademies.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-gray-400">
                해당 학원이 없습니다
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.lowCreditAcademies.map((a) => (
                  <li key={a.academyId}>
                    <Link
                      href={
                        a.directorStaffId
                          ? `/admin/members/${a.directorStaffId}`
                          : `/admin/academies/${a.academyId}`
                      }
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/60"
                    >
                      <span className="text-[13px] text-gray-700 truncate mr-2">
                        {a.name}
                      </span>
                      <span
                        className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                          a.balance === 0 ? "text-gray-400" : "text-amber-600"
                        }`}
                      >
                        {a.balance === 0 ? "소진" : formatNumber(a.balance)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 최근 가입 학원(7일) — 구 「체험 종료 임박」(F9·D5) */}
          <RecentSignupsCard
            items={data.recentSignups}
            total={data.recentSignupsTotal}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>10분마다 자동 새로고침 · 처리 필요 {totalActions}건</span>
        <Link
          href="/admin/costs"
          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
        >
          상세 원가·매출 분석 <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardAutoRefresh />
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">대시보드</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          실시간 운영 현황 · 처리 필요 항목과 오늘의 지표
        </p>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
