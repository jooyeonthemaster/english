import { Suspense } from "react";
import Link from "next/link";
import { getSystemStats } from "@/actions/admin";
import { getMembers } from "@/actions/admin-members";
import { getProviderLabel } from "@/lib/admin-members-labels";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Users,
  Coins,
  TrendingUp,
  Clock,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/utils";
import { DirectorProviderCard } from "@/components/admin/director-provider-card";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[300px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}

async function DashboardContent() {
  const [stats, recentMembers] = await Promise.all([
    getSystemStats(),
    getMembers({ limit: 5 }),
  ]);

  const kpiCards = [
    {
      label: "전체 학원 수",
      value: formatNumber(stats.totalAcademies),
      subtitle: `${stats.activeAcademies}개 활성`,
      icon: Building2,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      label: "전체 학생 수",
      value: formatNumber(stats.totalStudents),
      subtitle: `직원 ${stats.totalStaff}명`,
      icon: Users,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      label: "크레딧 사용량",
      value: formatNumber(stats.totalCreditsConsumed),
      subtitle: `최근 30일 거래 ${stats.transactionsLast30Days}건`,
      icon: Coins,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
    },
    {
      label: "월 매출",
      value: formatCurrency(stats.estimatedMonthlyRevenue),
      subtitle: `문제 ${formatNumber(stats.totalQuestions)}개 생성`,
      icon: TrendingUp,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-gray-100 p-5 flex items-start justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">
                  {card.label}
                </span>
                <span className="text-[28px] font-bold text-gray-900 leading-tight">
                  {card.value}
                </span>
                <span className="text-[12px] text-gray-400">{card.subtitle}</span>
              </div>
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-xl ${card.iconBg}`}
              >
                <Icon className={`size-5 ${card.iconColor}`} strokeWidth={1.8} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "지문", value: stats.totalPassages },
          { label: "시험", value: stats.totalExams },
          { label: "문제", value: stats.totalQuestions },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between"
          >
            <span className="text-[12px] text-gray-400">{item.label}</span>
            <span className="text-[16px] font-semibold text-gray-800">
              {formatNumber(item.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Members */}
        <div className="bg-white rounded-xl border border-gray-100 lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-gray-400" strokeWidth={1.8} />
              <h3 className="text-[14px] font-semibold text-gray-800">
                최근 가입 회원
              </h3>
            </div>
            <Link
              href="/admin/members"
              className="text-[12px] text-blue-600 hover:underline"
            >
              전체 보기
            </Link>
          </div>
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9 pl-5">
                    회원
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                    학원
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                    가입 경로
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9 pr-5">
                    가입일
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentMembers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-[13px] text-gray-400 py-8"
                    >
                      회원이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  recentMembers.map((m) => (
                    <TableRow
                      key={m.id}
                      className="hover:bg-gray-50/50"
                    >
                      <TableCell className="pl-5">
                        <Link
                          href={`/admin/members/${m.id}`}
                          className="text-[13px] font-medium text-gray-800 hover:text-blue-600"
                        >
                          {m.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-600">
                        {m.academy.name}
                      </TableCell>
                      <TableCell className="text-[12px] text-gray-500">
                        {getProviderLabel(m.authProvider)}
                      </TableCell>
                      <TableCell className="text-[12px] text-gray-400 pr-5">
                        {formatRelativeTime(m.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DirectorProviderCard stats={stats.directorsByProvider} />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">대시보드</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          플랫폼 현황 및 시스템 상태
        </p>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
