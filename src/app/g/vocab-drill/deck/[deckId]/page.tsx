// 덱 허브 — 단어 덱의 단계 게이트 판정(recomputeDeckProgress 정본) + 진입 분기.

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { resolveDeckSenseIds } from "@/lib/vocab-drill/content";
import { recomputeDeckProgress } from "@/lib/vocab-drill/engine";
import type { VocabDeckSpec } from "@/lib/vocab-drill/payload";
import { DeckHubClient } from "./deck-hub-client";

export const dynamic = "force-dynamic";

export default async function VocabDeckHubPage({
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
  });
  if (!deck) notFound();

  const poolIds = await resolveDeckSenseIds(deck.spec as VocabDeckSpec);
  // 단계 게이트 판정 정본 — 드릴 60%·문맥 30% 승급이 여기서 확정된다.
  const progress = await recomputeDeckProgress(
    session.studentId,
    session.academyId,
    deckId,
    poolIds,
  );

  return (
    <DeckHubClient
      deckId={deck.id}
      title={deck.title}
      subtitle={deck.subtitle}
      totalCount={poolIds.length}
      progress={{
        stage: progress?.stage ?? "LEARN",
        seenCount: progress?.seenCount ?? 0,
        masteredCount: progress?.masteredCount ?? 0,
        bestTestScore: progress?.bestTestScore ?? null,
        lastStudiedAt: progress?.lastStudiedAt?.toISOString() ?? null,
      }}
    />
  );
}
