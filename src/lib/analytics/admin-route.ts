// ============================================================================
// 관리자 분석 API 라우트 래퍼 — 인증(requireAdminAuth) + 쿼리 파싱 + 오류 JSON.
// 모든 /api/admin/analytics/* GET 은 이걸로 감싼다(I7).
// ============================================================================

import "server-only";
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { parseAnalyticsQuery, type AnalyticsQuery } from "./query";

type Handler<T> = (q: AnalyticsQuery, sp: URLSearchParams, req: Request) => Promise<T>;

export function analyticsGet<T>(handler: Handler<T>) {
  return async function GET(req: Request) {
    try {
      await requireAdminAuth();
    } catch {
      return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
    }
    const sp = new URL(req.url).searchParams;
    const q = parseAnalyticsQuery(sp);
    try {
      const data = await handler(q, sp, req);
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      console.error("[analytics] report failed", req.url, err);
      const message = err instanceof Error ? err.message : String(err);
      const missingTable = /analytics_[a-z_]+" does not exist|relation "analytics_/i.test(message);
      return NextResponse.json(
        {
          error: missingTable
            ? "분석 테이블이 아직 생성되지 않았습니다 (prisma/migrations-manual/20260917_analytics.sql 적용 필요)."
            : "리포트를 불러오지 못했습니다.",
        },
        { status: 500 },
      );
    }
  };
}
