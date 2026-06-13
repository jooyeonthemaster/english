// @ts-nocheck
"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { StudentDetailHeader } from "./student-detail-header";
import { StudentDetailOverviewTab } from "./student-detail-overview-tab";
import { StudentDetailGradesTab } from "./student-detail-grades-tab";
import { StudentDetailAttendanceTab } from "./student-detail-attendance-tab";
import { StudentDetailConsultationTab } from "./student-detail-consultation-tab";
import { StudentDetailParentTab } from "./student-detail-parent-tab";
import { StudentAccessCard } from "./devices/student-access-card";
import { StudentBillingSection } from "./billing/student-billing-section";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

interface StudentDetailClientProps {
  student: any;
  stats: any;
  isDirector: boolean;
}

export function StudentDetailClient({
  student,
  stats,
  isDirector,
}: StudentDetailClientProps) {
  const basePath = isDirector ? "/director/students" : "/teacher/students";
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;

  return (
    <div className="flex flex-col h-full">
      <StudentDetailHeader
        student={student}
        stats={stats}
        isDirector={isDirector}
        basePath={basePath}
      />

      {/* ===== Tabs Content ===== */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <Tabs defaultValue="overview">
          <TabsList variant="line">
            <TabsTrigger value="overview">개요</TabsTrigger>
            {showResults && <TabsTrigger value="grades">성적</TabsTrigger>}
            <TabsTrigger value="attendance">출결</TabsTrigger>
            <TabsTrigger value="billing">수납</TabsTrigger>
            <TabsTrigger value="consultation">상담</TabsTrigger>
            <TabsTrigger value="parent">학부모</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <StudentDetailOverviewTab student={student} stats={stats} />
            <StudentAccessCard
              studentId={student.id}
              studentCode={student.studentCode}
              isDirector={isDirector}
            />
          </TabsContent>

          {showResults && (
            <TabsContent value="grades" className="mt-6">
              <StudentDetailGradesTab stats={stats} />
            </TabsContent>
          )}

          <TabsContent value="attendance" className="mt-6">
            <StudentDetailAttendanceTab stats={stats} />
          </TabsContent>

          <TabsContent value="billing" className="mt-6">
            <StudentBillingSection studentId={student.id} isDirector={isDirector} />
          </TabsContent>

          <TabsContent value="consultation" className="mt-6">
            <StudentDetailConsultationTab stats={stats} />
          </TabsContent>

          <TabsContent value="parent" className="mt-6">
            <StudentDetailParentTab student={student} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
