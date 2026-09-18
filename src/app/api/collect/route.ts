// ============================================================================
// POST /api/collect — 1st-party 유입 분석 수집 (전 방문자, 로그인 무관).
// 계약: docs/analytics/analytics-spec.md §3.2
//
// 기존 /api/track(로그인 스태프 전용, app_events)과 별개다 — 그쪽은 건드리지 않는다(I6).
// 응답: 페이지뷰가 포함된 요청은 200 {c:[전환 지시]}, 그 외 204. 실패도 조용히 204(I4).
// ============================================================================

import { ingest } from "@/lib/analytics/ingest";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const result = await ingest(req);
  if (!result || !result.hadPageview) {
    return new Response(null, { status: 204, headers: NO_STORE });
  }
  return Response.json({ c: result.conversions }, { headers: NO_STORE });
}
