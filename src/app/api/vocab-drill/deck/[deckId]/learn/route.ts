// 덱 LEARN 완료 — 서버가 FLASH 커버리지(80%)를 검증하고 LEARN→DRILL 로 올린다.
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import { resolveDeckSenseIds } from "@/lib/vocab-drill/content";
import { markDeckLearnDone } from "@/lib/vocab-drill/engine";
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
    where: { id: deckId, academyId: session.academyId, status: "ACTIVE" },
  });
  if (!deck) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  const poolIds = await resolveDeckSenseIds(deck.spec as VocabDeckSpec);
  const result = await markDeckLearnDone(
    session.studentId,
    session.academyId,
    deckId,
    poolIds,
  );
  return NextResponse.json({ ok: true, ...result });
}
