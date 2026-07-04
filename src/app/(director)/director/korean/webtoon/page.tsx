import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getWebtoonCollections,
  getAcademyWebtoonCollectionMembership,
} from "@/actions/workbench";
import { WebtoonPageClient } from "../../workbench/webtoon/webtoon-page-client";

export const metadata: Metadata = { title: "국어 웹툰 생성" };

/**
 * 국어 웹툰 생성 — 영어 workbench/webtoon 페이지의 국어 대칭 라우트.
 * 동일 클라이언트(WebtoonPageClient)를 재사용하되:
 *  - 웹툰 폴더는 subject="KOREAN" 으로 좁힌다(영어 웹툰 폴더 완전 배제).
 *  - 클라이언트에 계약 prop subjectScope="KOREAN" 만 넘긴다 — 지문 picker(국어
 *    지문만)·내부 네비게이션(/director/korean/webtoon/*)·임베드 보관함
 *    (국어 웹툰만)이 그 스코프로 동작한다.
 */
export default async function KoreanWebtoonPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [collections, membershipRaw] = await Promise.all([
    getWebtoonCollections(staff.academyId, "KOREAN"),
    getAcademyWebtoonCollectionMembership(staff.academyId),
  ]);

  return (
    <WebtoonPageClient
      academyId={staff.academyId}
      subjectScope="KOREAN"
      collections={collections}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
      )}
    />
  );
}
