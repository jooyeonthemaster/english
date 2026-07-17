// 인터랙티브 레슨 — 서버 조립.
// 유닛 잠금을 서버에서 강제한다(클라 잠금 ≠ 서버 잠금 — 과거에 learn 라우트가 뚫렸다).

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";
import { getLesson, toSafeLesson } from "@/lib/study-os/lesson-bundle";
import { getLessonProgress } from "@/lib/study-os/lesson-progress";
import { LessonPlayer } from "@/components/study-os/lesson-player";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ unitId: string; conceptId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { unitId, conceptId } = await params;
  const unit = UNIT_BY_ID.get(unitId);
  const lesson = getLesson(conceptId);
  if (!unit || !lesson || lesson.unitId !== unitId) redirect("/g/home");

  // 서버 잠금 게이트 — 유닛 허브·큐 API와 동일 정책
  const progresses = await prisma.grammarDrillUnitProgress.findMany({
    where: { studentId: session.studentId },
    select: { unitId: true, drillDoneAt: true },
  });
  if (!computeUnlockedUnits(progresses).has(unitId)) redirect("/g/home");

  const progress = await getLessonProgress(session.studentId, conceptId);

  const order = unit.conceptIds.indexOf(conceptId);
  const nextConceptId =
    order >= 0 && order + 1 < unit.conceptIds.length ? unit.conceptIds[order + 1] : null;

  return (
    <LessonPlayer
      lesson={toSafeLesson(lesson)}
      resumeIndex={progress?.lastBlockIndex ?? 0}
      alreadyCompleted={Boolean(progress?.completedAt)}
      savedNote={progress?.note ?? ""}
      nextConceptId={nextConceptId}
    />
  );
}
