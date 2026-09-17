// 허브에서 소프트 내비게이션으로 들어온 워크스페이스 — 팝업으로 가로챈다.
// 주소 직접 진입/새로고침은 이 파일을 타지 않고 [id]/page.tsx(전체 페이지)로 폴백된다.

import { ExamReportWorkspaceClient } from "@/components/exam-report/workspace-client";
import { WorkspaceModal } from "@/components/exam-report/workspace-modal";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * [id] 와 같은 층에 있는 **정적 형제 라우트**들. 인터셉팅 슬롯의 [id] 는 동적
 * 세그먼트라 "library" 같은 형제 경로까지 분석 id 로 물어버린다 — 그러면 사이드바
 * 「내신 리포트 관리」를 누를 때(소프트 내비게이션) 목록 위에 "분석을 찾을 수
 * 없습니다" 팝업이 덮인다. 새 형제 라우트를 추가하면 여기에도 반드시 넣을 것.
 * (하드 진입은 인터셉터를 타지 않아 증상이 안 보이므로 놓치기 쉽다.)
 *
 * 26-09-01: "library" 는 좌측 메뉴에서 빠졌지만(허브로 통합) 라우트 자체는 기존
 * 북마크 보존용 redirect 로 남아 있다 — 형제 세그먼트인 건 그대로라 이 가드도
 * 그대로 유지한다. 지우면 남은 링크를 탈 때 팝업이 덮인다.
 */
const NON_ANALYSIS_SEGMENTS = new Set(["library"]);

export default async function InterceptedWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  // 형제 정적 라우트면 슬롯을 비워 children(해당 페이지)만 보이게 한다.
  if (NON_ANALYSIS_SEGMENTS.has(id)) return null;

  return (
    <WorkspaceModal>
      <ExamReportWorkspaceClient analysisId={id} embedded />
    </WorkspaceModal>
  );
}
