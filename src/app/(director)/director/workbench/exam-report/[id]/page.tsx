// 분석 워크스페이스 — 인증은 (director) 레이아웃이 담당한다.
// 상세 데이터는 workspace-client 가 GET /api/exam-report/analyses/[id] 로 로드.
//
// 이 파일은 **주소 직접 진입/새로고침** 경로다(허브에서 카드를 누르면 @modal 의
// (.)[id] 가 가로채 팝업으로 연다). 두 경로가 같은 화면이어야 하므로 여기서도
// 팝업 셸로 감싼다 — 새로고침했다고 레이아웃이 바뀌면 같은 URL 이 다른 화면을
// 주는 셈이고, 여백 넓은 전체 페이지로 되돌아가 버린다.
//
// 닫기는 back() 이 아니라 허브로 replace — 직접 진입엔 돌아갈 앱 히스토리가 없어
// back() 하면 앱 밖(직전 사이트)으로 나가버린다.
//
// ※ 소프트 내비게이션 때는 children 슬롯이 허브를 유지하고 @modal 이 팝업을 그리므로
//   이 페이지는 렌더되지 않는다 → 팝업이 두 겹으로 뜨지 않는다.

import { ExamReportWorkspaceClient } from "@/components/exam-report/workspace-client";
import { WorkspaceModal } from "@/components/exam-report/workspace-modal";

const HUB_HREF = "/director/workbench/exam-report";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExamReportWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  return (
    <WorkspaceModal closeHref={HUB_HREF}>
      <ExamReportWorkspaceClient analysisId={id} embedded />
    </WorkspaceModal>
  );
}
