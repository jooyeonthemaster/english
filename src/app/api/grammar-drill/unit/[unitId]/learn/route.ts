// 개념 학습 — GET: 유닛 개념 카드 전체, POST: 학습 완료(CONCEPT → DRILL).
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { getGrammarBundle } from "@/lib/grammar-drill/bundle";
import { markConceptDone } from "@/lib/grammar-drill/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { unitId } = await params;
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  const bundle = getGrammarBundle();
  const concepts = unit.conceptIds
    .map((cid) => bundle.conceptsById.get(cid))
    .filter(Boolean);
  return NextResponse.json({
    ok: true,
    unit: { id: unit.id, title: unit.title, subtitle: unit.subtitle },
    concepts,
  });
}

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
  await markConceptDone(session.studentId, session.academyId, unitId);
  return NextResponse.json({ ok: true });
}
