// 유닛 허브 — 개념 레슨(인터랙티브 교과서) + 단계 스테퍼 + 다음 한 수.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { PART_BY_UNIT_ID, UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";
import { getGrammarBundle } from "@/lib/grammar-drill/bundle";
import { getLessonBundle } from "@/lib/study-os/lesson-bundle";
import { getUnitLessonProgress } from "@/lib/study-os/lesson-progress";
import { UnitHubClient } from "./unit-hub-client";

export const dynamic = "force-dynamic";

export default async function UnitPage({
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

  const [progresses, masteries, lessonProgress] = await Promise.all([
    prisma.grammarDrillUnitProgress.findMany({
      where: { studentId: session.studentId },
      select: { unitId: true, drillDoneAt: true, stage: true, bestTestScore: true },
    }),
    prisma.grammarDrillMastery.findMany({
      where: { studentId: session.studentId, unitId },
    }),
    getUnitLessonProgress(session.studentId, unitId),
  ]);

  if (!computeUnlockedUnits(progresses).has(unitId)) redirect("/g/home");

  const progress = progresses.find((p) => p.unitId === unitId);
  const bundle = getGrammarBundle();
  const lessons = getLessonBundle().lessonsById;

  const concepts = unit.conceptIds.map((cid) => {
    const card = bundle.conceptsById.get(cid);
    const lesson = lessons.get(cid);
    const lp = lessonProgress.get(cid);
    const m = masteries.find((x) => x.conceptId === cid);
    return {
      id: cid,
      title: lesson?.title ?? card?.title ?? cid,
      oneLiner: lesson?.oneLiner ?? card?.oneLiner ?? "",
      lesson: lesson
        ? {
            blocks: lesson.blocks.length,
            minutes: lesson.estimatedMinutes,
            seen: lp?.lastBlockIndex ?? 0,
            completed: Boolean(lp?.completedAt),
            confidence: lp?.confidence ?? null,
          }
        : null,
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
        stageSet: unit.stageSet,
        stage: progress?.stage ?? "CONCEPT",
        bestTestScore: progress?.bestTestScore ?? null,
      }}
      concepts={concepts}
    />
  );
}
