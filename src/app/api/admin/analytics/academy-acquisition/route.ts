// GET /api/admin/analytics/academy-acquisition?academyId=… — 회원 상세 「유입 경로」 카드.
// analyticsGet 래퍼는 200/500 만 돌려주므로, 400(파라미터)·404(학원 없음)를 구분하려고
// 같은 규약(requireAdminAuth + no-store + 분석 테이블 누락 안내)을 여기서 직접 적용한다(I7).

import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { ACADEMY_ID_RE, getAcademyAcquisition } from "@/lib/analytics/reports/academy-acquisition";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    await requireAdminAuth();
  } catch {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const academyId = new URL(req.url).searchParams.get("academyId")?.trim() ?? "";
  if (!ACADEMY_ID_RE.test(academyId)) {
    return NextResponse.json({ error: "academyId 가 필요합니다." }, { status: 400, headers: NO_STORE });
  }

  try {
    const data = await getAcademyAcquisition(academyId);
    if (!data) {
      return NextResponse.json({ error: "학원을 찾을 수 없습니다." }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err) {
    console.error("[analytics] academy-acquisition failed", academyId, err);
    const message = err instanceof Error ? err.message : String(err);
    const missingTable = /analytics_[a-z_]+" does not exist|relation "analytics_/i.test(message);
    return NextResponse.json(
      {
        error: missingTable
          ? "분석 테이블이 아직 생성되지 않았습니다 (prisma/migrations-manual/20260917_analytics.sql 적용 필요)."
          : "유입 경로를 불러오지 못했습니다.",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
