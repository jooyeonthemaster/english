// 덱 LEARN — 플래시 카드 학습 플레이어 진입(서버 가드).

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { FlashPlayer } from "./flash-player";

export const dynamic = "force-dynamic";

export default async function VocabLearnPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_VOCAB_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { deckId } = await params;
  const deck = await prisma.vocabDrillDeck.findFirst({
    where: { id: deckId, academyId: session.academyId, status: "ACTIVE" },
    select: { id: true, title: true },
  });
  if (!deck) notFound();

  return <FlashPlayer deckId={deck.id} deckTitle={deck.title} />;
}
