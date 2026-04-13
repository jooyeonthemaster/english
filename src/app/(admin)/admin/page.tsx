import { Suspense } from "react";
import { getSystemStats, getRegistrations } from "@/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Users,
  Coins,
  TrendingUp,
  Clock,
  Activity,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/utils";

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
  const [stats, allRegistrations] = await Promise.all([
    getSystemStats(),
    getRegistrations(),
  ]);

  const recentRegistrations = allRegistrations.slice(0, 5);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "지문", value: stats.totalPassages },
          { label: "시험", value: stats.totalExams },
          { label: "문제", value: stats.totalQuestions },
          { label: "대기 중인 가입 신청", value: stats.pendingRegistrations },
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
        {/* Recent Registrations */}
        <div className="bg-white rounded-xl border border-gray-100 lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-gray-400" strokeWidth={1.8} />
              <h3 className="text-[14px] font-semibold text-gray-800">
                최근 가입 신청
              </h3>
            </div>
            {stats.pendingRegistrations > 0 && (
              <Badge
                variant="secondary"
                className="bg-blue-50 text-blue-600 border-0 text-[11px] px-2"
              >
                {stats.pendingRegistrations}건 대기 중
              </Badge>
            )}
          </div>
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9 pl-5">
                    학원명
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                    원장
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                    상태
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9 pr-5">
                    날짜
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRegistrations.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-[13px] text-gray-400 py-8"
                    >
                      가입 신청이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  recentRegistrations.map((reg) => (
                    <TableRow key={reg.id} className="hover:bg-gray-50/50">
                      <TableCell className="text-[13px] font-medium text-gray-800 pl-5">
                        {reg.academyName}
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-600">
                        {reg.directorName}
                      </TableCell>
                      <TableCell>
                        <RegistrationStatusBadge status={reg.status} />
                      </TableCell>
                      <TableCell className="text-[12px] text-gray-400 pr-5">
                        {formatRelativeTime(reg.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* 요약 통계 */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <Activity className="size-4 text-gray-400" strokeWidth={1.8} />
            <h3 className="text-[14px] font-semibold text-gray-800">
              콘텐츠 현황
            </h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-gray-500">전체 지문</span>
              <span className="font-semibold text-gray-800">{formatNumber(stats.totalPassages)}개</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-gray-500">전체 문제</span>
              <span className="font-semibold text-gray-800">{formatNumber(stats.totalQuestions)}개</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-gray-500">전체 시험</span>
              <span className="font-semibold text-gray-800">{formatNumber(stats.totalExams)}개</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-gray-500">전체 학생</span>
              <span className="font-semibold text-gray-800">{formatNumber(stats.totalStudents)}명</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-gray-500">전체 직원</span>
              <span className="font-semibold text-gray-800">{formatNumber(stats.totalStaff)}명</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegistrationStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: "대기 중",
      className: "bg-blue-50 text-blue-600 border-0",
    },
    APPROVED: {
      label: "승인됨",
      className: "bg-emerald-50 text-emerald-600 border-0",
    },
    REJECTED: {
      label: "거절됨",
      className: "bg-red-50 text-red-600 border-0",
    },
    CANCELLED: {
      label: "취소됨",
      className: "bg-gray-100 text-gray-500 border-0",
    },
  };

  const c = config[status] || config.PENDING;
  return (
    <Badge variant="secondary" className={`text-[11px] px-2 ${c.className}`}>
      {c.label}
    </Badge>
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
