// 유닛 테스트 종료 — 서버가 최근 UNIT_TEST 시도로 점수 산출(변조 불가 경로).
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { completeUnitTest } from "@/lib/grammar-drill/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { unitId } = await params;
  if (!UNIT_BY_ID.has(unitId)) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  const result = await completeUnitTest(session.studentId, session.academyId, unitId);
  return NextResponse.json({ ok: true, ...result });
}
