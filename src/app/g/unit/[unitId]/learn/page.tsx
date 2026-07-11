// ============================================================================
// /g/unit/[unitId]/learn — 개념 학습 (카드 슬라이드 → 개념 체크 진입)
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { getGrammarBundle } from "@/lib/grammar-drill/bundle";
import type { GrammarConcept } from "@/lib/grammar-drill/types";
import { LearnClient } from "./learn-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { unitId } = await params;
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) redirect("/g/home");

  const bundle = getGrammarBundle();
  const concepts = unit.conceptIds
    .map((cid) => bundle.conceptsById.get(cid))
    .filter((c): c is GrammarConcept => Boolean(c));

  return (
    <LearnClient
      unit={{ id: unit.id, title: unit.title, subtitle: unit.subtitle }}
      concepts={concepts}
    />
  );
}
