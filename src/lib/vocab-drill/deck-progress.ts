// 단어 훈련 — 덱 단계 전환·시험 채점 (server-only)
//
// 단계: LEARN → DRILL → CONTEXT → TEST → MASTERED (어법 유닛 단계의 단어판).
// 이 모듈이 학습 진도의 **서버측 정본**이다 — 클라이언트의 잠금 표시는 안내일 뿐이고,
// 큐 발급(queue.ts)과 시험 채점이 여기의 deckStageAllows 로 실제 진입을 막는다.
import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DECK_TEST_SIZE,
  GRADED_ITEM_TYPES,
  MASTERED_SCORE,
  STAGE_ORDER,
  TEST_PASS_SCORE,
  type DeckStage,
} from "./constants";

// LEARN→DRILL: 덱 sense 의 80% 이상 FLASH 시도.
// DRILL→CONTEXT / CONTEXT→TEST: 덱 허브 서버 렌더가 recomputeDeckProgress 로 판정.
// TEST→MASTERED: completeDeckTest 점수 ≥ 70.

export async function markDeckLearnDone(
  studentId: string,
  academyId: string,
  deckId: string,
  poolIds: string[],
): Promise<{ advanced: boolean; seen: number; total: number }> {
  const total = poolIds.length;
  if (!total) return { advanced: false, seen: 0, total: 0 };
  const seen = await prisma.vocabDrillAttempt.groupBy({
    by: ["senseId"],
    where: {
      studentId,
      deckId,
      itemType: "FLASH",
      senseId: { in: poolIds },
    },
  });
  const advanced = seen.length >= Math.ceil(total * 0.8);
  if (advanced) {
    const existing = await prisma.vocabDrillDeckProgress.findUnique({
      where: { studentId_deckId: { studentId, deckId } },
      select: { stage: true, learnDoneAt: true },
    });
    // ★ 승급만 한다, 격하하지 않는다. 무조건 "DRILL" 을 쓰면 MASTERED 덱에
    //   학습으로 재진입한 학생이 완성 상태를 잃는다(적대검수 2026-08-04).
    const promoting = !existing || existing.stage === "LEARN";
    await prisma.vocabDrillDeckProgress.upsert({
      where: { studentId_deckId: { studentId, deckId } },
      create: {
        academyId,
        studentId,
        deckId,
        stage: "DRILL",
        learnDoneAt: new Date(),
        totalCount: total,
        seenCount: seen.length,
        lastStudiedAt: new Date(),
      },
      update: {
        ...(promoting
          ? { stage: "DRILL", learnDoneAt: existing?.learnDoneAt ?? new Date() }
          : {}),
        totalCount: total,
        seenCount: seen.length,
        lastStudiedAt: new Date(),
      },
    });
  }
  return { advanced, seen: seen.length, total };
}

/**
 * 덱 시험 채점 — 서버가 이번 응시의 DECK_TEST 시도로 점수를 산출한다(변조 불가).
 * 세 겹으로 잠근다(적대검수 2026-08-04):
 *   ① **채점형 유형만** 센다 — FLASH 자기평가를 source=DECK_TEST 로 밀어넣어
 *      100점을 자가부여하던 경로를 봉인.
 *   ② **덱 풀 소속 sense 만** 센다 — 남의 sense 로 원장을 채우는 우회 차단.
 *   ③ **이번 응시분만** 센다 — sinceMs 창 밖(직전 응시)의 시도를 섞지 않는다.
 * 승급은 stage 가 TEST 일 때만 — 단계를 건너뛴 MASTERED 자가부여를 막는다.
 */
export async function completeDeckTest(
  studentId: string,
  academyId: string,
  deckId: string,
  poolIds: string[],
): Promise<{ score: number; passed: boolean; graded: number } | null> {
  const existing = await prisma.vocabDrillDeckProgress.findUnique({
    where: { studentId_deckId: { studentId, deckId } },
  });
  // 응시 창 — 시험 큐를 받고 푸는 시간. 이 밖의 시도는 다른 응시분이다.
  const since = new Date(Date.now() - 3 * 60 * 60_000);
  const attempts = await prisma.vocabDrillAttempt.findMany({
    where: {
      studentId,
      deckId,
      source: "DECK_TEST",
      itemType: { in: GRADED_ITEM_TYPES },
      ...(poolIds.length ? { senseId: { in: poolIds } } : {}),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: DECK_TEST_SIZE,
    select: { correct: true },
  });
  if (!attempts.length) return null;
  const score = Math.round(
    (attempts.filter((a) => a.correct).length / attempts.length) * 100,
  );
  // 완주하지 않으면 합격시키지 않는다 — 3문항만 맞히고 100점을 받던 구멍.
  const complete = attempts.length >= Math.min(DECK_TEST_SIZE, poolIds.length || DECK_TEST_SIZE);
  const eligible = existing?.stage === "TEST" || existing?.stage === "MASTERED";
  const passed = score >= TEST_PASS_SCORE && complete && eligible;

  await prisma.vocabDrillDeckProgress.upsert({
    where: { studentId_deckId: { studentId, deckId } },
    create: {
      academyId,
      studentId,
      deckId,
      stage: "LEARN", // 진행 행이 없었다면 단계 게이트를 통과했을 리 없다
      bestTestScore: score,
      lastStudiedAt: new Date(),
    },
    update: {
      stage: passed ? "MASTERED" : undefined,
      masteredAt: passed && !existing?.masteredAt ? new Date() : undefined,
      bestTestScore: Math.max(existing?.bestTestScore ?? 0, score),
      lastStudiedAt: new Date(),
    },
  });
  // 완성 집계는 masteredAt 기준 — stage 는 학습 재진입으로 흔들릴 수 있다.
  if (passed && !existing?.masteredAt) {
    await prisma.vocabDrillStat
      .update({
        where: { studentId },
        data: { decksCompleted: { increment: 1 } },
      })
      .catch(() => undefined); // 스텟 행이 아직 없으면 다음 제출 때 생긴다
  }
  return { score, passed, graded: attempts.length };
}

/**
 * 덱 단계 게이트 — 큐 발급 전에 서버가 강제한다.
 * 클라이언트의 잠금 표시는 안내일 뿐이다. URL 로 mode=test 에 직행해 LEARN 단계에서
 * 시험을 보고 MASTERED 를 따가던 경로를 막는다(적대검수 2026-08-04).
 */
export async function deckStageAllows(
  studentId: string,
  deckId: string,
  required: DeckStage,
): Promise<boolean> {
  const row = await prisma.vocabDrillDeckProgress.findUnique({
    where: { studentId_deckId: { studentId, deckId } },
    select: { stage: true },
  });
  const current = row?.stage ?? "LEARN";
  const ci = STAGE_ORDER.indexOf(current as DeckStage);
  const ri = STAGE_ORDER.indexOf(required);
  return ci >= 0 && ci >= ri;
}

/**
 * 덱 진행 재계산 — 덱 허브 서버 렌더 전용(제출 경로에서 부르지 않는다).
 * 단계 게이트: DRILL→CONTEXT = 드릴 시도 sense 60% 이상,
 *              CONTEXT→TEST = 문맥 시도 sense 30% 이상(예문 보유분 한정 완화).
 */
export async function recomputeDeckProgress(
  studentId: string,
  academyId: string,
  deckId: string,
  poolIds: string[],
) {
  const total = poolIds.length;
  const existing = await prisma.vocabDrillDeckProgress.findUnique({
    where: { studentId_deckId: { studentId, deckId } },
  });
  if (!total) return existing;

  // 시도 집계는 **한 번에** 뜬다 — 같은 (studentId,deckId,senseId in 500) 스캔을
  // 세 번 반복할 이유가 없다(적대검수 2026-08-04). 유형 분류는 JS 에서 한다.
  const [attemptRows, masteredCount, contextCapable] = await Promise.all([
    prisma.vocabDrillAttempt.groupBy({
      by: ["senseId", "itemType"],
      where: { studentId, deckId, senseId: { in: poolIds } },
    }),
    prisma.vocabDrillMastery.count({
      where: {
        studentId,
        senseId: { in: poolIds },
        masteryScore: { gte: MASTERED_SCORE },
      },
    }),
    // 문맥 문항을 만들 수 있는 sense 수 — 예문이 없으면 아무리 풀어도 못 채운다.
    prisma.vocabDrillExample.findMany({
      where: { senseId: { in: poolIds }, retiredAt: null },
      distinct: ["senseId"],
      select: { senseId: true },
      take: 500,
    }),
  ]);

  const DRILL_TYPES = new Set(["MEANING_CHOICE", "WORD_CHOICE", "SPELL"]);
  const CONTEXT_TYPES = new Set(["CONTEXT_FILL", "TRAP_JUDGE", "EXAMPLE_MATCH"]);
  const seen = new Set<string>();
  const drilledSet = new Set<string>();
  const contextedSet = new Set<string>();
  for (const r of attemptRows) {
    seen.add(r.senseId);
    if (DRILL_TYPES.has(r.itemType)) drilledSet.add(r.senseId);
    else if (CONTEXT_TYPES.has(r.itemType)) contextedSet.add(r.senseId);
  }

  let stage = existing?.stage ?? "LEARN";
  const data: Record<string, unknown> = {
    totalCount: total,
    seenCount: seen.size,
    masteredCount,
  };
  if (stage === "DRILL" && drilledSet.size >= Math.ceil(total * 0.6)) {
    stage = "CONTEXT";
    data.stage = stage;
    data.drillDoneAt = existing?.drillDoneAt ?? new Date();
  }
  // 문맥 임계는 **예문 보유 sense 수로 상한**을 둔다 — 예문이 30% 미만인 덱은
  // 아무리 풀어도 TEST 가 열리지 않아 영구 잠금이 됐다(적대검수 2026-08-04).
  const contextTarget = Math.min(
    Math.ceil(total * 0.3),
    contextCapable.length,
  );
  if (stage === "CONTEXT" && contextedSet.size >= contextTarget) {
    stage = "TEST";
    data.stage = stage;
    data.contextDoneAt = existing?.contextDoneAt ?? new Date();
  }

  return prisma.vocabDrillDeckProgress.upsert({
    where: { studentId_deckId: { studentId, deckId } },
    create: {
      academyId,
      studentId,
      deckId,
      stage: typeof data.stage === "string" ? data.stage : "LEARN",
      totalCount: total,
      seenCount: seen.size,
      masteredCount,
    },
    update: data,
  });
}
