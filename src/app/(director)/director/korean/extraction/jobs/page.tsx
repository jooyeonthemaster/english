import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import { ExtractionManageClient } from "../../../workbench/passages/import/_components/extraction-manage-client";

export const metadata: Metadata = { title: "국어 자료 관리" };
export const dynamic = "force-dynamic";

// C1/C2 공유 계약 prop — 동일 클라이언트를 재사용하고 subjectScope="KOREAN" 만
// 넘긴다. 미전달=영어 기본이므로 영어 라우트 동작은 한 줄도 달라지지 않는다.
const KOREAN_SCOPE = { subjectScope: "KOREAN" } as const;

/**
 * 국어 자료 관리(추출 잡/자료 목록) — 영어 workbench/extraction/jobs 의 국어 대칭.
 * 동일 클라이언트(ExtractionManageClient)를 재사용하되 subjectScope="KOREAN" 로
 * 잡 목록·자료 카드 조회를 국어로 스코프한다(영어 자료 완전 배제).
 */
export default async function KoreanExtractionJobsPage() {
  const staff = await getStaffSession();
  if (!staff) {
    redirect("/login?callbackUrl=/director/korean/extraction/jobs");
  }

  const [collections, membershipRaw] = await Promise.all([
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
  ]);

  const collectionMembership = Object.fromEntries(
    Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
  );

  return (
    <ExtractionManageClient
      academyId={staff.academyId}
      {...KOREAN_SCOPE}
      initialCollections={collections}
      initialCollectionMembership={collectionMembership}
    />
  );
}
