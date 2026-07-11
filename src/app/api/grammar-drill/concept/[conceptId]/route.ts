// 개념 카드 조회 — 문제 풀이 중 "개념 보기" 시트가 소비.
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { getGrammarConcept } from "@/lib/grammar-drill/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conceptId: string }> },
) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { conceptId } = await params;
  const concept = getGrammarConcept(conceptId);
  if (!concept) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, concept });
}
