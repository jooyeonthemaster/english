// 단어 훈련 — 내 기록 집계 (일자별·유형별·티어별·복습 큐·취약 표제어·시험 기록).
// 어법 me 라우트의 집계 형상을 승계하되, 학생×sense 는 수만 행이라
// 그리드 대신 box 분포·티어 분포로 요약한다(init.sql Q3 — 전량 로드 금지).
import { NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import { MASTERED_SCORE, WEAK_SCORE } from "@/lib/vocab-drill/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS = 14;
const ATTEMPT_WINDOW = 600;

function seoulDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function GET() {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { studentId } = session;
  const now = new Date();

  const [attempts, boxDist, weakRows, dueCount, stat, deckProgress] =
    await Promise.all([
      prisma.vocabDrillAttempt.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: ATTEMPT_WINDOW,
        select: {
          senseId: true,
          lemmaId: true,
          itemType: true,
          correct: true,
          timeMs: true,
          hintUsed: true,
          source: true,
          deckId: true,
          createdAt: true,
        },
      }),
      prisma.vocabDrillMastery.groupBy({
        by: ["box"],
        where: { studentId },
        _count: { _all: true },
      }),
      prisma.vocabDrillMastery.findMany({
        where: { studentId, masteryScore: { lt: WEAK_SCORE }, attempts: { gte: 2 } },
        orderBy: { masteryScore: "asc" },
        take: 10,
        select: {
          senseId: true,
          lemmaId: true,
          masteryScore: true,
          attempts: true,
          lapses: true,
        },
      }),
      prisma.vocabDrillMastery.count({
        where: { studentId, dueAt: { lte: now } },
      }),
      prisma.vocabDrillStat.findUnique({ where: { studentId } }),
      prisma.vocabDrillDeckProgress.findMany({
        where: { studentId },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);

  // 취약 표제어에 단어·뜻을 붙인다(화이트리스트 — 제출 이력이 있는 것만이라 노출 무해).
  const weakSenses = weakRows.length
    ? await prisma.vocabDrillSense.findMany({
        where: { id: { in: weakRows.map((r) => r.senseId) } },
        select: { id: true, lemma: true, pos: true, senseKo: true, tier: true },
      })
    : [];
  const senseById = new Map(weakSenses.map((s) => [s.id, s]));

  // 일자별 14일 — 서울 기준.
  const days: { date: string; solved: number; correct: number }[] = [];
  const dayIndex = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const key = seoulDayKey(new Date(now.getTime() - i * 86_400_000));
    dayIndex.set(key, days.length);
    days.push({ date: key, solved: 0, correct: 0 });
  }
  const byItemType: Record<string, { solved: number; correct: number }> = {};
  let totalTime = 0;
  let hintCount = 0;
  for (const a of attempts) {
    const key = seoulDayKey(a.createdAt);
    const idx = dayIndex.get(key);
    if (idx !== undefined) {
      days[idx].solved += 1;
      if (a.correct) days[idx].correct += 1;
    }
    const t = (byItemType[a.itemType] ??= { solved: 0, correct: 0 });
    t.solved += 1;
    if (a.correct) t.correct += 1;
    totalTime += a.timeMs;
    if (a.hintUsed > 0) hintCount += 1;
  }

  // 일자별 「단어 시험 기록」 — DECK_TEST 시도를 날짜×덱으로 묶는다.
  const testByDayDeck = new Map<
    string,
    { date: string; deckId: string | null; solved: number; correct: number }
  >();
  for (const a of attempts) {
    if (a.source !== "DECK_TEST") continue;
    const date = seoulDayKey(a.createdAt);
    const key = `${date}|${a.deckId ?? "-"}`;
    const row = testByDayDeck.get(key) ?? {
      date,
      deckId: a.deckId,
      solved: 0,
      correct: 0,
    };
    row.solved += 1;
    if (a.correct) row.correct += 1;
    testByDayDeck.set(key, row);
  }
  const deckIds = [
    ...new Set(
      [...testByDayDeck.values()].map((r) => r.deckId).filter((x): x is string => !!x),
    ),
  ];
  // 덱 제목은 **자기 학원 것만** — academyId 스코프가 없으면 타 학원 덱 제목이 샌다.
  // 시험 기록에 안 나오는 진행 중 덱의 제목도 여기서 함께 얻는다.
  const progressDeckIds = deckProgress.map((p) => p.deckId);
  const allDeckIds = [...new Set([...deckIds, ...progressDeckIds])];
  const decks = allDeckIds.length
    ? await prisma.vocabDrillDeck.findMany({
        where: { id: { in: allDeckIds }, academyId: session.academyId },
        select: { id: true, title: true },
      })
    : [];
  const deckTitleById = new Map(decks.map((d) => [d.id, d.title]));
  const testRecords = [...testByDayDeck.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30)
    .map((r) => ({
      date: r.date,
      deckId: r.deckId,
      deckTitle: r.deckId ? (deckTitleById.get(r.deckId) ?? "덱") : "일반",
      solved: r.solved,
      correct: r.correct,
      score: Math.round((r.correct / Math.max(1, r.solved)) * 100),
    }));

  const boxes = [0, 1, 2, 3, 4, 5].map((b) => ({
    box: b,
    count: boxDist.find((r) => r.box === b)?._count._all ?? 0,
  }));
  const totalSolvedWindow = attempts.length;

  return NextResponse.json({
    ok: true,
    me: {
      totals: {
        solved: totalSolvedWindow,
        correct: attempts.filter((a) => a.correct).length,
        avgTimeMs: totalSolvedWindow
          ? Math.round(totalTime / totalSolvedWindow)
          : 0,
        hintRate: totalSolvedWindow
          ? Math.round((hintCount / totalSolvedWindow) * 100)
          : 0,
      },
      stat: stat
        ? {
            xp: stat.xp,
            sensesSeen: stat.sensesSeen,
            sensesMastered: stat.sensesMastered,
            decksCompleted: stat.decksCompleted,
            reviewsDone: stat.reviewsDone,
            bestCombo: stat.bestCombo,
            streakDays: stat.streakDays,
            tierXp: stat.tierXp,
          }
        : null,
      days,
      byItemType,
      boxes,
      dueCount,
      masteredScore: MASTERED_SCORE,
      weak: weakRows.map((r) => {
        const s = senseById.get(r.senseId);
        return {
          senseId: r.senseId,
          lemma: s?.lemma ?? "",
          pos: s?.pos ?? "",
          senseKo: s?.senseKo ?? "",
          tier: s?.tier ?? "core",
          score: r.masteryScore,
          attempts: r.attempts,
          lapses: r.lapses,
        };
      }),
      testRecords,
      decks: deckProgress.map((p) => ({
        deckId: p.deckId,
        title: deckTitleById.get(p.deckId) ?? "단어장",
        stage: p.stage,
        totalCount: p.totalCount,
        seenCount: p.seenCount,
        masteredCount: p.masteredCount,
        bestTestScore: p.bestTestScore,
        lastStudiedAt: p.lastStudiedAt?.toISOString() ?? null,
      })),
    },
  });
}
