import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  BookOpen,
  ClipboardList,
  FileWarning,
  Users,
  Clock,
  ChevronRight,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber, formatKoreanDate, formatDate } from "@/lib/utils";
import {
  getTeacherKPIs,
  getTeacherTodayClasses,
  getTeacherRecentExams,
  getTeacherPendingAssignments,
} from "@/actions/dashboard";
import type {
  TeacherKPIData,
  TeacherClassItem,
  RecentExamResult,
  PendingAssignmentItem,
} from "@/actions/dashboard";

// ============================================================================
// Page
// ============================================================================

export default async function TeacherDashboardPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/teacher");

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {staff.name} 선생님
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {formatKoreanDate(new Date())} 수업 현황
        </p>
      </div>

      {/* KPI Cards */}
      <Suspense fallback={<TeacherKPISkeleton />}>
        <TeacherKPICards academyId={staff.academyId} staffId={staff.id} />
      </Suspense>

      {/* Main Content - Two Column */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Classes (takes more space) */}
        <Suspense fallback={<ListSkeleton title="오늘 수업 일정" />}>
          <TodayClassesSection academyId={staff.academyId} staffId={staff.id} />
        </Suspense>

        <div className="space-y-6">
          {/* Recent Exam Results */}
          <Suspense fallback={<ListSkeleton title="최근 시험 결과" />}>
            <RecentExamsSection academyId={staff.academyId} staffId={staff.id} />
          </Suspense>

          {/* Pending Assignments */}
          <Suspense fallback={<ListSkeleton title="과제 현황" />}>
            <PendingAssignmentsSection
              academyId={staff.academyId}
              staffId={staff.id}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Teacher KPI Cards
// ============================================================================

async function TeacherKPICards({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const kpi: TeacherKPIData = await getTeacherKPIs(academyId, staffId);

  const cards = [
    {
      title: "내 수업",
      value: formatNumber(kpi.myClassesToday),
      suffix: "개",
      description: "오늘 수업",
      icon: BookOpen,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      title: "미채점 시험",
      value: formatNumber(kpi.ungradedExams),
      suffix: "건",
      description: "채점 대기",
      icon: ClipboardList,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      alert: kpi.ungradedExams > 0,
    },
    {
      title: "미제출 과제",
      value: formatNumber(kpi.missingAssignments),
      suffix: "건",
      description: "마감 초과",
      icon: FileWarning,
      iconBg: "bg-red-50",
      iconColor: "text-red-600",
      alert: kpi.missingAssignments > 0,
    },
    {
      title: "담당 학생",
      value: formatNumber(kpi.myStudents),
      suffix: "명",
      description: "전체 담당",
      icon: Users,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={cn(
            "kpi-card border border-gray-200/80 shadow-card animate-float-up",
            card.alert && "border-amber-200/80",
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
                  <span className="text-base font-medium text-gray-500">
                    {card.suffix}
                  </span>
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
            <p className="mt-2 text-xs text-gray-400">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Today's Classes Section
// ============================================================================

async function TodayClassesSection({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const classes: TeacherClassItem[] = await getTeacherTodayClasses(
    academyId,
    staffId
  );

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            오늘 수업 일정
          </CardTitle>
          <p className="text-xs text-gray-500">{classes.length}개 수업</p>
        </div>
        <Clock className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {classes.length > 0 ? (
          <div className="space-y-3">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  cls.status === "in-progress"
                    ? "border-blue-200 bg-blue-50/50"
                    : cls.status === "completed"
                      ? "border-gray-100 bg-gray-50/30"
                      : "border-gray-200 bg-white"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold",
                        cls.status === "in-progress"
                          ? "bg-blue-100 text-blue-700"
                          : cls.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {cls.startTime.split(":")[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {cls.name}
                      </p>
                      <p className="text-xs text-gray-500">{cls.time}</p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px]",
                      cls.status === "in-progress" && "bg-blue-100 text-blue-700",
                      cls.status === "upcoming" && "bg-gray-100 text-gray-600",
                      cls.status === "completed" && "bg-emerald-100 text-emerald-700"
                    )}
                  >
                    {cls.status === "in-progress"
                      ? "수업 중"
                      : cls.status === "upcoming"
                        ? "예정"
                        : "완료"}
                  </Badge>
                </div>
                <div className="mt-2.5 flex items-center gap-4 text-xs text-gray-500">
                  {cls.room && (
                    <span className="flex items-center gap-1">
                      교실: {cls.room}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {cls.attendedCount}/{cls.studentCount}명 출석
                  </span>
                  <div className="flex-1" />
                  {cls.studentCount > 0 && (
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          cls.status === "completed"
                            ? "bg-emerald-500"
                            : "bg-blue-500"
                        )}
                        style={{
                          width: `${Math.round(
                            (cls.attendedCount / cls.studentCount) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
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
// Recent Exams Section
// ============================================================================

async function RecentExamsSection({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const exams: RecentExamResult[] = await getTeacherRecentExams(
    academyId,
    staffId
  );

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            최근 시험 결과
          </CardTitle>
        </div>
        <BarChart3 className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {exams.length > 0 ? (
          <div className="space-y-2.5">
            {exams.map((exam) => (
              <div
                key={exam.id}
                className="group flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {exam.examTitle}
                    </span>
                    {exam.className && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {exam.className}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <span>{formatDate(exam.date)}</span>
                    <span className="text-gray-300">|</span>
                    <span>
                      {exam.submissionCount}/{exam.totalStudents}명 제출
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {exam.avgScore !== null ? (
                    <p
                      className={cn(
                        "text-lg font-bold",
                        exam.avgScore >= 90
                          ? "text-emerald-600"
                          : exam.avgScore >= 70
                            ? "text-blue-600"
                            : exam.avgScore >= 50
                              ? "text-amber-600"
                              : "text-red-600"
                      )}
                    >
                      {exam.avgScore}
                      <span className="text-xs font-normal text-gray-400">점</span>
                    </p>
                  ) : (
                    <span className="text-xs text-gray-400">미채점</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="최근 시험 기록이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Pending Assignments Section
// ============================================================================

async function PendingAssignmentsSection({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const assignments: PendingAssignmentItem[] =
    await getTeacherPendingAssignments(academyId, staffId);

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            과제 현황
          </CardTitle>
        </div>
        <CheckCircle2 className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {assignments.length > 0 ? (
          <div className="space-y-2.5">
            {assignments.map((a) => {
              const rate =
                a.totalStudents > 0
                  ? Math.round((a.submittedCount / a.totalStudents) * 100)
                  : 0;
              const isPastDue = new Date(a.dueDate) < new Date();

              return (
                <div
                  key={a.id}
                  className="group flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {a.title}
                      </span>
                      {a.className && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          {a.className}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span
                        className={cn(isPastDue && "font-medium text-red-500")}
                      >
                        마감: {formatDate(a.dueDate)}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span>
                        {a.submittedCount}/{a.totalStudents}명 제출
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          rate >= 80
                            ? "bg-emerald-500"
                            : rate >= 50
                              ? "bg-amber-500"
                              : "bg-red-500"
                        )}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                  <div className="ml-3 shrink-0">
                    <span
                      className={cn(
                        "text-lg font-bold",
                        rate >= 80
                          ? "text-emerald-600"
                          : rate >= 50
                            ? "text-amber-600"
                            : "text-red-600"
                      )}
                    >
                      {rate}
                      <span className="text-xs font-normal text-gray-400">%</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="과제 현황이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

// ============================================================================
// Skeletons
// ============================================================================

function TeacherKPISkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border border-gray-200/80">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-24" />
              </div>
              <Skeleton className="h-11 w-11 rounded-xl" />
            </div>
            <Skeleton className="mt-2 h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
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
