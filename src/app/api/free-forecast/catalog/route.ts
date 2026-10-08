import { NextResponse } from "next/server";
import { getFfCatalog } from "@/lib/free-forecast/catalog";

// 공개 — 무료 신청 페이지의 「기출 DB 에서 고르기」 목록. 시험지·문항번호·유형만(본문 없음).
// 정적 코퍼스라 빌드 때 한 번 만들어 캐시한다.
export const dynamic = "force-static";
export const revalidate = 86400;

export function GET() {
  return NextResponse.json({ papers: getFfCatalog() }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
