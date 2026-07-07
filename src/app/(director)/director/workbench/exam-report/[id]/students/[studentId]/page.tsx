// 학생 채점+리포트 페이지 골격 — 인증은 (director) 레이아웃이 담당한다.
// 분석 detail 과 학생 detail 은 student-workspace-client 가 로드한다.

import { ExamReportStudentWorkspaceClient } from "@/components/exam-report/student-workspace-client";

interface PageProps {
  params: Promise<{ id: string; studentId: string }>;
}

export default async function ExamReportStudentPage({ params }: PageProps) {
  const { id, studentId } = await params;
  return (
    <ExamReportStudentWorkspaceClient analysisId={id} studentId={studentId} />
  );
}
