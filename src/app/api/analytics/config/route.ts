// ============================================================================
// GET /api/analytics/config — 공개 픽셀 설정(인증 없음). 계약 §8.2
// 응답 {pixels:{활성·유효 ID만}} · enabled=false 면 {pixels:{}} · CDN 5분 캐시.
// DB 오류 시 env 폴백(readPixelConfig 가 삼킨다). 이 라우트는 절대 500 을 내지 않는다(I4).
// ============================================================================

import { NextResponse } from "next/server";
import { readPixelConfig, toPublicPixels, type PublicPixels } from "@/lib/analytics/pixels";

// 빌드 시점 정적화 금지 — 관리자 저장이 재배포 없이 반영돼야 한다(캐시는 CDN s-maxage 로만).
export const dynamic = "force-dynamic";

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

export async function GET() {
  let pixels: PublicPixels = {};
  try {
    const state = await readPixelConfig();
    pixels = toPublicPixels(state.config);
  } catch (err) {
    console.error("[analytics] public pixel config failed", err);
  }
  return NextResponse.json({ pixels }, { headers: CACHE_HEADERS });
}
