// 유닛 허브 페이로드 — 단계·개념 카드 요약·개념별 숙달도.
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import { UNIT_BY_ID, PART_BY_UNIT_ID } from "@/lib/grammar-drill/curriculum";
import { getGrammarBundle } from "@/lib/grammar-drill/bundle";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";

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

  const [progresses, masteries] = await Promise.all([
    prisma.grammarDrillUnitProgress.findMany({
      where: { studentId: session.studentId },
    }),
    prisma.grammarDrillMastery.findMany({
      where: { studentId: session.studentId, unitId },
    }),
  ]);

  const unlocked = computeUnlockedUnits(progresses);
  const progress = progresses.find((p) => p.unitId === unitId);
  const bundle = getGrammarBundle();

  const concepts = unit.conceptIds.map((cid) => {
    const card = bundle.conceptsById.get(cid);
    const mastery = masteries.find((m) => m.conceptId === cid);
    return {
      id: cid,
      title: card?.title ?? cid,
      oneLiner: card?.oneLiner ?? "",
      hasCard: Boolean(card),
      mastery: {
        attempts: mastery?.attempts ?? 0,
        correct: mastery?.correct ?? 0,
        score: Math.round(mastery?.masteryScore ?? 0),
        streak: mastery?.streak ?? 0,
        box: mastery?.box ?? 0,
      },
    };
  });

  return NextResponse.json({
    ok: true,
    unit: {
      id: unit.id,
      title: unit.title,
      subtitle: unit.subtitle,
      part: unit.part,
      partName: PART_BY_UNIT_ID.get(unit.id)?.name ?? "",
      frequency: unit.frequency,
      frequencyNote: unit.frequencyNote,
      locked: !unlocked.has(unitId),
      stage: unlocked.has(unitId) ? (progress?.stage ?? "CONCEPT") : "LOCKED",
      bestTestScore: progress?.bestTestScore ?? null,
      concepts,
    },
  });
}
