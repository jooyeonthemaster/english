// ============================================================================
// /g/unit/[unitId] — 유닛 허브 (단계 스테퍼 · 개념별 숙달도 · 모드 진입)
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import { UNIT_BY_ID, PART_BY_UNIT_ID } from "@/lib/grammar-drill/curriculum";
import { getGrammarBundle } from "@/lib/grammar-drill/bundle";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";
import { UnitHubClient } from "./unit-hub-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function UnitHubPage({
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

  const [progresses, masteries] = await Promise.all([
    prisma.grammarDrillUnitProgress.findMany({
      where: { studentId: session.studentId },
    }),
    prisma.grammarDrillMastery.findMany({
      where: { studentId: session.studentId, unitId },
    }),
  ]);

  const unlocked = computeUnlockedUnits(progresses);
  if (!unlocked.has(unitId)) redirect("/g/home");

  const progress = progresses.find((p) => p.unitId === unitId);
  const bundle = getGrammarBundle();

  const concepts = unit.conceptIds.map((cid) => {
    const card = bundle.conceptsById.get(cid);
    const m = masteries.find((x) => x.conceptId === cid);
    return {
      id: cid,
      title: card?.title ?? cid,
      oneLiner: card?.oneLiner ?? "",
      mastery: {
        attempts: m?.attempts ?? 0,
        score: Math.round(m?.masteryScore ?? 0),
        streak: m?.streak ?? 0,
        box: m?.box ?? 0,
      },
    };
  });

  return (
    <UnitHubClient
      unit={{
        id: unit.id,
        title: unit.title,
        subtitle: unit.subtitle,
        partName: PART_BY_UNIT_ID.get(unit.id)?.name ?? "",
        frequency: unit.frequency,
        frequencyNote: unit.frequencyNote,
        stage: progress?.stage ?? "CONCEPT",
        bestTestScore: progress?.bestTestScore ?? null,
      }}
      concepts={concepts}
    />
  );
}
