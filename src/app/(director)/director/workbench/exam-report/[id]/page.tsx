// 분석 워크스페이스 페이지 골격 — 인증은 (director) 레이아웃이 담당한다.
// 상세 데이터는 workspace-client 가 GET /api/exam-report/analyses/[id] 로 로드.

import { ExamReportWorkspaceClient } from "@/components/exam-report/workspace-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExamReportWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  return <ExamReportWorkspaceClient analysisId={id} />;
}
