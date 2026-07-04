import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getCreditSummary } from "@/lib/credits";
import {
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import { BulkExtractClient } from "../../workbench/passages/import/_components/bulk-extract-client";

export const metadata: Metadata = { title: "국어 자료 추출" };
export const dynamic = "force-dynamic";

// C1/C2 공유 계약 prop — 동일 클라이언트를 재사용하고 subjectScope="KOREAN" 만
// 넘긴다. 미전달=영어 기본이므로 영어 라우트 동작은 한 줄도 달라지지 않는다.
const KOREAN_SCOPE = { subjectScope: "KOREAN" } as const;

/**
 * 국어 자료 추출 — 영어 workbench/extraction( = passages/import) 페이지의 국어
 * 대칭 라우트. 페이지 복제 없이 동일 클라이언트(BulkExtractClient)를 재사용하되
 * subjectScope="KOREAN" 만 넘긴다:
 *  - 업로드/텍스트 잡 생성 시 subject="KOREAN" 이 잡 metadata.subject 로 전파돼
 *    승급 Passage 가 국어로 스코프된다(영어 승급 누수 방지).
 *  - 하단 자료 관리 임베드·이어하기 네비게이션이 /director/korean/extraction 으로
 *    스코프된다.
 * NOTE: 자료 폴더(M1PassageDraftCollection)는 아직 subject 컬럼이 없어 과목 분리가
 * 불가 — 폴더는 영어/국어 공용으로 남는다(자료 카드 자체는 subject 스코프됨).
 */
export default async function KoreanExtractionPage() {
  const staff = await getStaffSession();
  if (!staff) {
    redirect("/login?callbackUrl=/director/korean/extraction");
  }

  const [credit, collections, membershipRaw] = await Promise.all([
    getCreditSummary(staff.academyId),
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
  ]);

  const collectionMembership = Object.fromEntries(
    Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
  );

  return (
    <BulkExtractClient
      academyId={staff.academyId}
      {...KOREAN_SCOPE}
      initialCreditBalance={credit.balance}
      initialCollections={collections}
      initialCollectionMembership={collectionMembership}
    />
  );
}
