// 덱 시험 종료 — 서버가 최근 DECK_TEST 시도로 점수 산출(변조 불가 경로).
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import { resolveDeckSenseIds } from "@/lib/vocab-drill/content";
import { completeDeckTest } from "@/lib/vocab-drill/engine";
import type { VocabDeckSpec } from "@/lib/vocab-drill/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { deckId } = await params;
  const deck = await prisma.vocabDrillDeck.findFirst({
    where: { id: deckId, academyId: session.academyId },
    select: { id: true, spec: true },
  });
  if (!deck) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  // 채점 대상을 덱 풀 소속 sense 로 한정한다 — 남의 sense 로 원장을 채워
  // 점수를 만드는 우회를 막는다(engine.completeDeckTest 의 ② 잠금).
  const poolIds = await resolveDeckSenseIds(deck.spec as VocabDeckSpec);
  const result = await completeDeckTest(
    session.studentId,
    session.academyId,
    deckId,
    poolIds,
  );
  if (!result) {
    return NextResponse.json({ ok: false, error: "NO_ATTEMPTS" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...result });
}
