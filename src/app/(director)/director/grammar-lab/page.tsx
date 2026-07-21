// ============================================================================
// /director/grammar-lab → /director/students/grammar 리다이렉트 (v3 §D4-1, C-2)
//
// 어법 현황 목록은 students/(manage)/grammar 로 이관 완료 — 이 경로는 구
// 백링크·북마크 호환용 redirect 만 남긴다(쿼리 승계). 동반 UI(grammar-lab-
// list-client 등 5파일)는 이 디렉토리에 잔존하며 신 페이지가 임포트한다.
// [studentId] redirect 는 별도 존치(F-3 계열 — 무접촉).
//
// ⚠️ 실제 리다이렉트 정본은 next.config.ts redirects()(HTTP 307) — 페이지 레벨
// redirect() 풀 로드는 Next 16 Router React #310 크래시를 밟는다(/director 선례).
// 이 파일은 config 제거 시의 폴백으로만 남는다.
// ============================================================================

import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GrammarLabRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (typeof value === "string") {
      qs.set(key, value);
    }
  }
  const query = qs.toString();
  redirect(
    query ? `/director/students/grammar?${query}` : "/director/students/grammar",
  );
}
