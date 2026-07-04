import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { GeneratePageClient } from "../../workbench/generate/generate-page-client";

export const metadata: Metadata = { title: "국어 문제 생성" };

// C1/C2 공유 계약 prop — C2 가 클라이언트 측 subjectScope 를 구현한다. 스프레드로
// 넘겨 C2 착륙 전에도 컴파일이 깨지지 않게 한다(런타임 전달은 동일).
const KOREAN_SCOPE = { subjectScope: "KOREAN" } as const;

/**
 * 국어 문제 생성 — 영어 workbench/generate 페이지의 국어 대칭 라우트.
 * 페이지 복제 없이 동일 클라이언트를 재사용하고 subjectScope="KOREAN" 만 넘긴다
 * (스코프 동작 자체는 GeneratePageClient 내부 계약 — 국어 지문·KO_* 유형 전용).
 */
export default async function KoreanGeneratePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <GeneratePageClient academyId={staff.academyId} {...KOREAN_SCOPE} />;
}
