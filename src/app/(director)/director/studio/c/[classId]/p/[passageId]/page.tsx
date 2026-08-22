import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import { getStudioClassHeader } from "@/actions/studio/classes";
import { getStudioPassageDetail } from "@/actions/studio/passages";
import { PassageStudioClient } from "./passage-studio-client";

// ============================================================================
// 클래스 스튜디오 — 지문 스튜디오 (docs/class-studio-spec.md §3.0·§3.4)
//
// 모듈 그리드 → 배포 바 → 이력 + 우측 학생 에뮬레이터가 공통 셸(§3.0) 안에
// 흐르는 RSC 엔트리. 게이트는 wordbook 관용구(플래그+스태프 세션). 클래스에
// 등록되지 않은 지문(detail null)은 클래스 홈 지문 탭으로 돌려보낸다.
// 브레드크럼에 클래스명이 필요해 헤더 액션을 같이 조회한다(§3.0 — 클래스
// 컨텍스트 상실 금지). 조회 실패는 치명 아님: 라벨 폴백 "클래스".
// ============================================================================

export const dynamic = "force-dynamic";

export default async function PassageStudioPage({
  params,
}: {
  params: Promise<{ classId: string; passageId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_CLASS_STUDIO) redirect("/director");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const { classId, passageId } = await params;
  const [res, header] = await Promise.all([
    getStudioPassageDetail({ classId, passageId }),
    getStudioClassHeader(classId),
  ]);
  if (!res.success || !res.data) {
    redirect(`/director/studio/c/${classId}?tab=passages`);
  }

  return (
    <PassageStudioClient
      classId={classId}
      passageId={passageId}
      classTitle={header.success && header.data ? header.data.name : "클래스"}
      initialDetail={res.data}
    />
  );
}
