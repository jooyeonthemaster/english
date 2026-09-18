// 세션 1건 상세 — 없는 id 는 404 JSON 이 필요해 analyticsGet 래퍼(오류→500) 대신 인증을 직접 건다.

import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getSessionDetail } from "@/lib/analytics/reports/sessions";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    await requireAdminAuth();
  } catch {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401, headers: NO_STORE });
  }

  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id || id.length > 200) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404, headers: NO_STORE });
  }

  try {
    const data = await getSessionDetail(id);
    if (!data) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err) {
    console.error("[analytics] session detail failed", req.url, err);
    const message = err instanceof Error ? err.message : String(err);
    const missingTable = /analytics_[a-z_]+" does not exist|relation "analytics_/i.test(message);
    return NextResponse.json(
      {
        error: missingTable
          ? "분석 테이블이 아직 생성되지 않았습니다 (prisma/migrations-manual/20260917_analytics.sql 적용 필요)."
          : "세션 상세를 불러오지 못했습니다.",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
