import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getAcademyPaymentHistory } from "@/lib/admin-academy-payments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ academyId: string }>;
}

/** 학원 1곳의 충전 결제 이력(요약 + 최신순 최대 200건). 계약: analytics-spec.md §9.3 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    await requireAdminAuth();
  } catch {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const { academyId } = await ctx.params;
  try {
    const history = await getAcademyPaymentHistory(academyId);
    if (!history) {
      return NextResponse.json({ error: "학원을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[admin/credits/academies/top-ups] failed", academyId, err);
    return NextResponse.json({ error: "결제 이력을 불러오지 못했습니다." }, { status: 500 });
  }
}
