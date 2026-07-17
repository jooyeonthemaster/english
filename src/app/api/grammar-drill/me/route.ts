// 내 기록 — 유닛×개념 숙달 그리드(+개념 레슨 진행) · 유형별 정답률 · 최근 14일 활동.
//
// 개념 행에는 드릴 숙달도만이 아니라 **레슨 진행**(학습 중/완료/자신 없음)이 함께
// 실린다. 학습(레슨) → 훈련(드릴) 순서가 커리큘럼의 규범이므로, 내 기록이 그
// 순서를 그대로 비추어야 "다음 행동"을 흐리지 않는다(docs/study-os-spec.md §4).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import {
  GRAMMAR_UNITS,
  CONCEPT_SKELETON_BY_ID,
} from "@/lib/grammar-drill/curriculum";
import { seoulDayStart } from "@/lib/grammar-drill/home";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";
import { getLessonBundle } from "@/lib/study-os/lesson-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { studentId } = session;

  const since = new Date(seoulDayStart().getTime() - 13 * 86_400_000);
  const [masteries, attempts, progresses, lessonRows] = await Promise.all([
    prisma.grammarDrillMastery.findMany({ where: { studentId } }),
    prisma.grammarDrillAttempt.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        itemType: true,
        correct: true,
        createdAt: true,
        hintUsed: true,
        timeMs: true,
        difficulty: true,
      },
    }),
    prisma.grammarDrillUnitProgress.findMany({
      where: { studentId },
      select: { unitId: true, drillDoneAt: true },
    }),
    prisma.grammarDrillLessonProgress.findMany({
      where: { studentId },
      select: {
        conceptId: true,
        lastBlockIndex: true,
        blocksTotal: true,
        confidence: true,
        completedAt: true,
      },
    }),
  ]);
  const unlocked = computeUnlockedUnits(progresses);

  // 레슨 존재 여부·총 블록 수의 정본은 레슨 번들이다(DB blocksTotal 은 진행 시점의
  // 스냅샷이라 레슨이 개정되면 낡는다). 레슨이 아직 없는 개념은 lesson: null 로
  // 내려보내고, 화면은 그 개념을 드릴로만 안내한다.
  const lessons = getLessonBundle().lessonsById;
  const lessonProgressById = new Map(lessonRows.map((r) => [r.conceptId, r]));

  const grid = GRAMMAR_UNITS.map((u) => ({
    unitId: u.id,
    title: u.title,
    part: u.part,
    locked: !unlocked.has(u.id),
    concepts: u.conceptIds.map((cid) => {
      const m = masteries.find((x) => x.conceptId === cid);
      const lesson = lessons.get(cid);
      const lp = lessonProgressById.get(cid);
      const blocksTotal = lesson?.blocks.length ?? lp?.blocksTotal ?? 0;
      return {
        conceptId: cid,
        title: lesson?.title ?? CONCEPT_SKELETON_BY_ID.get(cid)?.title ?? cid,
        score: Math.round(m?.masteryScore ?? 0),
        attempts: m?.attempts ?? 0,
        correct: m?.correct ?? 0,
        box: m?.box ?? 0,
        lesson: lesson
          ? {
              completed: Boolean(lp?.completedAt),
              // 이어보기 지점(0-based). 0 = 아직 첫 블록에 머무름 = 미시작 취급.
              lastBlockIndex: Math.min(lp?.lastBlockIndex ?? 0, blocksTotal),
              blocksTotal,
              confidence: lp?.confidence ?? null,
            }
          : null,
      };
    }),
  }));

  const byType: Record<string, { total: number; correct: number }> = {};
  const byDifficulty: Record<string, { total: number; correct: number }> = {};
  let hintCount = 0;
  let totalTimeMs = 0;
  for (const a of attempts) {
    byType[a.itemType] ??= { total: 0, correct: 0 };
    byType[a.itemType].total++;
    if (a.correct) byType[a.itemType].correct++;
    byDifficulty[a.difficulty] ??= { total: 0, correct: 0 };
    byDifficulty[a.difficulty].total++;
    if (a.correct) byDifficulty[a.difficulty].correct++;
    if (a.hintUsed > 0) hintCount++;
    totalTimeMs += a.timeMs;
  }

  const SEOUL = 9 * 3600_000;
  const days: { day: string; solved: number; correct: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(seoulDayStart().getTime() - i * 86_400_000);
    const key = new Date(start.getTime() + SEOUL).toISOString().slice(5, 10);
    days.push({ day: key, solved: 0, correct: 0 });
  }
  for (const a of attempts) {
    if (a.createdAt < since) continue;
    const idx =
      13 -
      Math.floor(
        (seoulDayStart().getTime() - seoulDayStart(a.createdAt).getTime()) /
          86_400_000,
      );
    if (idx >= 0 && idx < 14) {
      days[idx].solved++;
      if (a.correct) days[idx].correct++;
    }
  }

  return NextResponse.json({
    ok: true,
    me: {
      studentName: session.studentName,
      grid,
      byType,
      byDifficulty,
      days,
      totals: {
        solved: attempts.length,
        correct: attempts.filter((a) => a.correct).length,
        hintRate: attempts.length ? hintCount / attempts.length : 0,
        avgTimeMs: attempts.length ? Math.round(totalTimeMs / attempts.length) : 0,
      },
    },
  });
}
