"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Eye, FileText, Settings, TabletSmartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { publishExam } from "@/actions/exams";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { AnalyticsData, ExamDetail } from "./exam-detail-client-parts/types";
import { ExamDetailPaperPreview } from "./exam-detail-paper-preview";
import { AnalyticsTab } from "./exam-detail-client-parts/analytics-tab";
import { DeploymentTab } from "./exam-detail-client-parts/deployment-tab";
import { ExamQuestionCard } from "./exam-detail-client-parts/exam-question-card";
import { HeaderSection } from "./exam-detail-client-parts/header-section";
import { SettingsTab } from "./exam-detail-client-parts/settings-tab";
import { SubmissionsTab } from "./exam-detail-client-parts/submissions-tab";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  exam: ExamDetail;
  analytics: AnalyticsData | null;
}

// ---------------------------------------------------------------------------
// 시험 상세 화면 — 헤더 + 통계 카드 + 4 개의 탭으로 구성.
// 각 탭/카드는 ./exam-detail-client-parts/* 로 분리되어 있다.
// ---------------------------------------------------------------------------
export function ExamDetailClient({ exam, analytics }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("preview");
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;
  const deploymentEnabled = FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT;

  // ?tab=deployment 딥링크(배포 모달 등 외부 진입) — window 조회 관례로
  // useSearchParams Suspense 경계 요구를 피한다(students-tab.tsx 미러).
  useEffect(() => {
    if (!deploymentEnabled) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "deployment") setActiveTab("deployment");
  }, [deploymentEnabled]);

  const gradedCount = exam.submissions.filter((s) => s.status === "GRADED").length;
  const totalSubs = exam.submissions.length;

  function handlePublish() {
    startTransition(async () => {
      const result = await publishExam(exam.id);
      if (result.success) {
        toast.success("시험이 배포되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error || "배포에 실패했습니다.");
      }
    });
  }

  return (
    <div className="p-6 space-y-6">
      <HeaderSection exam={exam} isPending={isPending} onPublish={handlePublish} />

      {/* Stats Cards */}
      <div className={showResults ? "grid grid-cols-4 gap-4" : "grid grid-cols-1 gap-4"}>
        <StatCard label="문제 수" value={String(exam.questions.length)} />
        {showResults && (
          <>
            <StatCard label="응시 인원" value={String(totalSubs)} />
            <StatCard label="채점 완료" value={`${gradedCount}/${totalSubs}`} />
            <StatCard label="평균 점수" value={analytics ? String(analytics.avgScore) : "-"} />
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#F7F8FA] border border-[#E5E8EB]">
          <TabsTrigger
            value="preview"
            className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
          >
            <Eye className="size-4 mr-1.5" />
            용지 미리보기
          </TabsTrigger>
          <TabsTrigger
            value="questions"
            className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
          >
            <FileText className="size-4 mr-1.5" />
            문제 목록
          </TabsTrigger>
          {deploymentEnabled && (
            <TabsTrigger
              value="deployment"
              className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
            >
              <TabletSmartphone className="size-4 mr-1.5" />
              학생 응시
            </TabsTrigger>
          )}
          {showResults && (
            <TabsTrigger
              value="submissions"
              className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
            >
              <Users className="size-4 mr-1.5" />
              응시 현황
            </TabsTrigger>
          )}
          {showResults && (
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
            >
              <BarChart3 className="size-4 mr-1.5" />
              성적 분석
            </TabsTrigger>
          )}
          <TabsTrigger
            value="settings"
            className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
          >
            <Settings className="size-4 mr-1.5" />
            설정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4">
          <ExamDetailPaperPreview exam={exam} />
        </TabsContent>

        {/* Questions Tab */}
        <TabsContent value="questions" className="mt-4">
          {exam.questions.length === 0 ? (
            <div className="rounded-xl border border-[#E5E8EB] bg-white p-12 text-center text-[#8B95A1]">
              <FileText className="size-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">등록된 문제가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {exam.questions.map((eq) => (
                <ExamQuestionCard key={eq.id} eq={eq} />
              ))}
            </div>
          )}
        </TabsContent>

        {deploymentEnabled && (
          <TabsContent value="deployment" className="mt-4">
            <DeploymentTab
              examId={exam.id}
              examTitle={exam.title}
              questionCount={exam.questions.length}
              subject={exam.subject ?? null}
            />
          </TabsContent>
        )}

        {showResults && (
          <TabsContent value="submissions" className="mt-4">
            <SubmissionsTab submissions={exam.submissions} />
          </TabsContent>
        )}

        {showResults && (
          <TabsContent value="analytics" className="mt-4">
            <AnalyticsTab analytics={analytics} />
          </TabsContent>
        )}

        <TabsContent value="settings" className="mt-4">
          <SettingsTab exam={exam} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
      <p className="text-xs text-[#8B95A1] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#191F28]">{value}</p>
    </div>
  );
}
