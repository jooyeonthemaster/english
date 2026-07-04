import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getWebtoonCollections,
  getAcademyWebtoonCollectionMembership,
} from "@/actions/workbench";
import { WebtoonLibraryClient } from "../../../workbench/webtoon/library/library-page-client";

export const metadata: Metadata = { title: "국어 웹툰 관리" };

/**
 * 국어 웹툰 관리(보관함) — 영어 workbench/webtoon/library 의 국어 대칭 라우트.
 * 동일 클라이언트(WebtoonLibraryClient)를 재사용하되:
 *  - 웹툰 폴더는 subject="KOREAN" 으로 좁힌다(영어 웹툰 폴더 완전 배제).
 *  - subjectScope="KOREAN" 으로 목록 API(scope=KOREAN·국어 웹툰만)와 내부
 *    네비게이션(/director/korean/webtoon)을 국어로 분기한다.
 */
export default async function KoreanWebtoonLibraryPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [collections, membershipRaw] = await Promise.all([
    getWebtoonCollections(staff.academyId, "KOREAN"),
    getAcademyWebtoonCollectionMembership(staff.academyId),
  ]);

  return (
    <WebtoonLibraryClient
      academyId={staff.academyId}
      subjectScope="KOREAN"
      collections={collections}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
      )}
    />
  );
}
