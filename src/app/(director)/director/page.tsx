import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  Users,
  Banknote,
  CalendarCheck,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatNumber, formatRelativeTime, formatKoreanDate } from "@/lib/utils";
import {
  getDashboardKPIs,
  getStudentTrend,
  getPaymentSummary,
  getTodayClasses,
  getOverdueInvoices,
  getRecentConsultations,
} from "@/actions/dashboard";
import type {
  KPIData,
  StudentTrendPoint,
  PaymentSummaryItem,
  TodayClassItem,
  OverdueInvoiceItem,
  ConsultationItem,
} from "@/actions/dashboard";
import { StudentTrendChart, PaymentDonutChart } from "./dashboard-charts";

// ============================================================================
// Page
// ============================================================================

export default async function DirectorDashboardPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director");

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          대시보드
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {formatKoreanDate(new Date())} 기준 실시간 현황
        </p>
      </div>

      {/* KPI Cards */}
      <Suspense fallback={<KPICardsSkeleton />}>
        <KPICards academyId={staff.academyId} />
      </Suspense>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<ChartSkeleton title="재원생 추이" />}>
          <StudentTrendSection academyId={staff.academyId} />
        </Suspense>
        <Suspense fallback={<ChartSkeleton title="수납 현황" />}>
          <PaymentStatusSection academyId={staff.academyId} />
        </Suspense>
      </div>

      {/* Bottom Three Columns */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<ListSkeleton title="오늘의 수업" />}>
          <TodayClassesSection academyId={staff.academyId} />
        </Suspense>
        <Suspense fallback={<ListSkeleton title="미납 알림" />}>
          <OverdueAlertsSection academyId={staff.academyId} />
        </Suspense>
        <Suspense fallback={<ListSkeleton title="최근 상담" />}>
          <RecentConsultationsSection academyId={staff.academyId} />
        </Suspense>
      </div>
    </div>
  );
}

// ============================================================================
// KPI Cards (Server Component)
// ============================================================================

async function KPICards({ academyId }: { academyId: string }) {
  const kpi: KPIData = await getDashboardKPIs(academyId);

  const cards = [
    {
      title: "총 재원생",
      value: formatNumber(kpi.totalStudents),
      suffix: "명",
      delta: kpi.studentDelta,
      deltaLabel: "전월 대비",
      icon: Users,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      title: "이번 달 매출",
      value: formatCurrency(kpi.monthlyRevenue),
      suffix: "",
      delta: kpi.collectionRate,
      deltaLabel: "수납률",
      deltaIsPercent: true,
      icon: Banknote,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      title: "출석률",
      value: `${kpi.attendanceRate}`,
      suffix: "%",
      delta: null,
      deltaLabel: `${kpi.presentCount}/${kpi.totalAttendanceCount}명 출석`,
      icon: CalendarCheck,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      title: "신규 등록",
      value: formatNumber(kpi.newRegistrations),
      suffix: "명",
      delta: kpi.newRegDelta,
      deltaLabel: "전월 대비",
      icon: UserPlus,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={cn(
            "kpi-card border border-gray-200/80 shadow-card animate-float-up",
            i === 0 && "stagger-1",
            i === 1 && "stagger-2",
            i === 2 && "stagger-3",
            i === 3 && "stagger-4"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">{card.title}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-gray-900">
                    {card.value}
                  </span>
                  {card.suffix && (
                    <span className="text-base font-medium text-gray-500">
                      {card.suffix}
                    </span>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  card.iconBg
                )}
              >
                <card.icon className={cn("h-5 w-5", card.iconColor)} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              {card.delta !== null && card.delta !== undefined ? (
                <>
                  {card.deltaIsPercent ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold",
                        card.delta >= 80
                          ? "bg-emerald-50 text-emerald-700"
                          : card.delta >= 50
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                      )}
                    >
                      {card.delta}%
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold",
                        card.delta > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : card.delta < 0
                            ? "bg-red-50 text-red-700"
                            : "bg-gray-50 text-gray-600"
                      )}
                    >
                      {card.delta > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : card.delta < 0 ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : null}
                      {card.delta > 0 ? "+" : ""}
                      {card.delta}
                    </Badge>
                  )}
                  <span className="text-xs text-gray-400">{card.deltaLabel}</span>
                </>
              ) : (
                <span className="text-xs text-gray-400">{card.deltaLabel}</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Student Trend Section
// ============================================================================

async function StudentTrendSection({ academyId }: { academyId: string }) {
  const trend: StudentTrendPoint[] = await getStudentTrend(academyId);

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-900">
          재원생 추이
        </CardTitle>
        <p className="text-xs text-gray-500">최근 6개월</p>
      </CardHeader>
      <CardContent className="pt-0">
        {trend.length > 0 ? (
          <StudentTrendChart data={trend} />
        ) : (
          <EmptyState message="재원생 데이터가 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Payment Status Section
// ============================================================================

async function PaymentStatusSection({ academyId }: { academyId: string }) {
  const summary: PaymentSummaryItem[] = await getPaymentSummary(academyId);
  const total = summary.reduce((s, item) => s + item.amount, 0);

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-900">
          수납 현황
        </CardTitle>
        <p className="text-xs text-gray-500">이번 달 청구 기준</p>
      </CardHeader>
      <CardContent className="pt-0">
        {total > 0 ? (
          <PaymentDonutChart data={summary} total={total} />
        ) : (
          <EmptyState message="청구 내역이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Today's Classes Section
// ============================================================================

async function TodayClassesSection({ academyId }: { academyId: string }) {
  const classes: TodayClassItem[] = await getTodayClasses(academyId);

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            오늘의 수업
          </CardTitle>
          <p className="text-xs text-gray-500">{classes.length}개 수업</p>
        </div>
        <Clock className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {classes.length > 0 ? (
          <div className="space-y-2.5">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50"
              >
                <div
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    cls.status === "in-progress" && "bg-blue-500 animate-pulse-ring",
                    cls.status === "upcoming" && "bg-gray-400",
                    cls.status === "completed" && "bg-emerald-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {cls.name}
                    </span>
                    {cls.room && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {cls.room}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <span>{cls.time}</span>
                    <span className="text-gray-300">|</span>
                    <span>{cls.teacherName}</span>
                    <span className="text-gray-300">|</span>
                    <span>{cls.studentCount}명</span>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "shrink-0 text-[10px]",
                    cls.status === "in-progress" && "bg-blue-50 text-blue-700",
                    cls.status === "upcoming" && "bg-gray-100 text-gray-600",
                    cls.status === "completed" && "bg-emerald-50 text-emerald-700"
                  )}
                >
                  {cls.status === "in-progress"
                    ? "수업 중"
                    : cls.status === "upcoming"
                      ? "예정"
                      : "완료"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="오늘 예정된 수업이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Overdue Alerts Section
// ============================================================================

async function OverdueAlertsSection({ academyId }: { academyId: string }) {
  const overdue: OverdueInvoiceItem[] = await getOverdueInvoices(academyId);

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            미납 알림
          </CardTitle>
          <p className="text-xs text-gray-500">{overdue.length}건 연체</p>
        </div>
        <AlertTriangle className="h-4 w-4 text-amber-500" />
      </CardHeader>
      <CardContent className="pt-0">
        {overdue.length > 0 ? (
          <div className="space-y-2.5">
            {overdue.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-red-100/60 bg-red-50/30 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {item.studentName}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{item.title}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-red-600">
                    {formatCurrency(item.amount)}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-red-500">
                    {item.daysOverdue}일 연체
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="미납 내역이 없습니다." positive />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Recent Consultations Section
// ============================================================================

async function RecentConsultationsSection({ academyId }: { academyId: string }) {
  const consultations: ConsultationItem[] = await getRecentConsultations(academyId);

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            최근 상담
          </CardTitle>
          <p className="text-xs text-gray-500">최근 기록</p>
        </div>
        <MessageSquare className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {consultations.length > 0 ? (
          <div className="space-y-2.5">
            {consultations.map((c) => (
              <div
                key={c.id}
                className="group flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {c.studentName || "일반 상담"}
                    </span>
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[10px]"
                    >
                      {c.typeLabel}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <span>{formatRelativeTime(c.date)}</span>
                    {c.staffName && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>{c.staffName}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="최근 상담 기록이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function EmptyState({
  message,
  positive = false,
}: {
  message: string;
  positive?: boolean;
}) {
  return (
    <div className="flex min-h-[120px] items-center justify-center">
      <p
        className={cn(
          "text-sm",
          positive ? "text-emerald-600" : "text-gray-400"
        )}
      >
        {message}
      </p>
    </div>
  );
}

// ============================================================================
// Skeletons
// ============================================================================

function KPICardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border border-gray-200/80">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-11 w-11 rounded-xl" />
            </div>
            <Skeleton className="mt-3 h-4 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <Card className="border border-gray-200/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-900">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[240px] w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ title }: { title: string }) {
  return (
    <Card className="border border-gray-200/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-900">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
