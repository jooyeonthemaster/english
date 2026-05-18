import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import { formatKoreanDate } from "@/lib/utils";

import { PendingAssignmentsSection } from "./_components/pending-assignments";
import { RecentExamsSection } from "./_components/recent-exams";
import {
  ListSkeleton,
  TeacherKPISkeleton,
} from "./_components/skeletons";
import { TeacherKPICards } from "./_components/teacher-kpi-cards";
import { TodayClassesSection } from "./_components/today-classes";

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
            <RecentExamsSection
              academyId={staff.academyId}
              staffId={staff.id}
            />
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
