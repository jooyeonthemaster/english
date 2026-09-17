import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStaffSession } from "@/lib/auth";
import { getStudioClassHeader } from "@/actions/studio/classes";
import { ClassHomeClient } from "./class-home-client";

// ============================================================================
// 클래스 스튜디오 — 클래스 홈 /director/studio/c/[classId] (docs/class-studio-spec.md §3.2)
//
// 탭: 지문 | 학생 | 결과 | 설정 (?tab=, 기본 지문). 게이트는 스튜디오 엔트리와
// 동일 관용구(플래그 + 스태프 세션) + 클래스 소유 검증(getStudioClassHeader).
// ============================================================================

export const dynamic = "force-dynamic";

const TAB_IDS = ["passages", "students", "results", "settings"] as const;
type TabId = (typeof TAB_IDS)[number];

function normalizeTab(raw: string | undefined): TabId {
  return TAB_IDS.includes(raw as TabId) ? (raw as TabId) : "passages";
}

export default async function ClassHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_CLASS_STUDIO) redirect("/director");
  const staff = await getStaffSession();
  if (!staff) redirect("/auth/login");

  const { classId } = await params;
  const sp = await searchParams;

  const res = await getStudioClassHeader(classId);
  if (!res.success || !res.data) redirect("/director/studio");

  return <ClassHomeClient header={res.data} initialTab={normalizeTab(sp.tab)} />;
}
