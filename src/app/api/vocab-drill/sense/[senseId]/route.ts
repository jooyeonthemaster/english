// 단어 카드 상세 — **이미 학습한 단어만** 열람할 수 있다.
//
// ★ 2026-08-04 적대검수: 초판은 세션만 있으면 임의 senseId 의 뜻·예문·함정을 줬다.
//   단어 훈련은 모든 유형에서 뜻 열람이 곧 정답 노출이라, 큐가 실어 보내는 senseId 로
//   이 라우트를 부르면 완벽한 정답 오라클이 된다(EXAMPLE_MATCH 는 짝까지 역산됐다).
//   해법: **제출 이력이 있는 sense 만** 200 을 준다. 대시보드·복습 카드 등 이 라우트의
//   정당한 용처는 전부 "이미 푼 단어"이므로 기능 손실이 없다.
import { NextRequest, NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import {
  exampleSourceLabel,
  getExamplesForSense,
  getSenseById,
  getSiblingSenses,
  getTrapsForSense,
} from "@/lib/vocab-drill/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ senseId: string }> },
) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { senseId } = await params;
  const sense = await getSenseById(senseId);
  if (!sense) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  // 정답 오라클 차단 — 이 단어를 실제로 푼 적이 있어야 뜻·예문·함정을 준다.
  const studied = await prisma.vocabDrillAttempt.findFirst({
    where: { studentId: session.studentId, senseId: sense.id },
    select: { id: true },
  });
  if (!studied) {
    return NextResponse.json({ ok: false, error: "NOT_STUDIED" }, { status: 403 });
  }
  const [examples, traps, siblings, lemma, mastery] = await Promise.all([
    getExamplesForSense(sense.id, 5),
    getTrapsForSense(sense.id, 4),
    getSiblingSenses(sense.lemmaId),
    prisma.vocabDrillLemma.findFirst({
      where: { id: sense.lemmaId },
      select: { collocations: true, per10k: true, trendLabel: true, gradeTop: true },
    }),
    prisma.vocabDrillMastery.findUnique({
      where: {
        studentId_senseId: { studentId: session.studentId, senseId: sense.id },
      },
      select: {
        masteryScore: true,
        box: true,
        streak: true,
        attempts: true,
        correct: true,
        dueAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    card: {
      senseId: sense.id,
      lemma: sense.lemma,
      pos: sense.pos,
      tier: sense.tier,
      difficulty: sense.difficulty,
      senseKo: sense.senseKo,
      senseEn: sense.senseEn,
      per10k: lemma?.per10k ?? null,
      trendLabel: lemma?.trendLabel ?? null,
      gradeTop: lemma?.gradeTop ?? null,
      collocations: (Array.isArray(lemma?.collocations)
        ? lemma.collocations
        : []
      )
        .filter((x): x is string => typeof x === "string")
        .slice(0, 6),
      examples: examples.map((e) => ({
        en: e.en,
        ko: e.ko,
        sourceLabel: exampleSourceLabel(e),
      })),
      traps: traps.map((t) => ({ kind: t.kind, note: t.note })),
      otherSenses: siblings
        .filter((s) => s.id !== sense.id)
        .map((s) => ({ senseId: s.id, senseKo: s.senseKo, senseEn: s.senseEn })),
      mastery: mastery
        ? {
            score: mastery.masteryScore,
            box: mastery.box,
            streak: mastery.streak,
            attempts: mastery.attempts,
            correct: mastery.correct,
            dueAt: mastery.dueAt?.toISOString() ?? null,
          }
        : null,
    },
  });
}
