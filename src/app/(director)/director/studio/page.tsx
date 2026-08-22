import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import { listStudioClasses } from "@/actions/studio/classes";
import { StudioHomeClient } from "./studio-home-client";

// ============================================================================
// 클래스 스튜디오 — /director/studio (docs/class-studio-spec.md §3.1 워크벤치)
//
// 좌 클래스 트리 · 중앙 「내 지문함」 임베드 · 우 클래스 패널 · 하단 생성 도크의
// 전고정 높이 3분할 워크벤치 엔트리. 게이트는 wordbook 관용구(플래그+스태프 세션).
// academyId 는 중앙 라이브러리 훅·큐 cacheKey 가 요구한다(§3.1.2·§3.7.2).
// ============================================================================

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  // ⚠️ "/director" 로 보내면 안 된다 — 26-08-22 부터 /director 는 이 페이지로
  // 리다이렉트한다(next.config.ts). 플래그 OFF 폴백은 문제 생성으로 직행.
  if (!FEATURE_FLAGS.ENABLE_CLASS_STUDIO) redirect("/director/workbench/questions/generate");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const res = await listStudioClasses();

  return (
    <StudioHomeClient
      academyId={staff.academyId}
      initialClasses={res.success ? (res.data ?? []) : []}
    />
  );
}
