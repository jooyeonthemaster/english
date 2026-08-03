// ============================================================================
// 단어 훈련 — 제출 파이프라인·숙달도 엔진 (server-only)
//
// 숙달도 수식은 어법 engine.ts:126-168 과 **동일하다**(init.sql 3-2 가 명문 인용):
//   seed  prev = 기존값 ?? (정답 40 / 오답 10)
//   score = round((prev*0.75 + (correct?100:0)*0.25) * 10) / 10   (EWMA α=0.25)
//   streak = correct ? prev+1 : 0
//   box    = correct ? min(5, prev+1) : max(0, prev-2)            (라이트너)
// 어법에 없는 3가지:
//   dueAt  = now + INTERVAL_BY_BOX[box]  (복습 큐를 인덱스 range scan 으로 — Q3)
//   lapses = box 하락 시 +1              ("여러 번 무너진 단어" 판별)
//   clientKey 멱등 — 중복 제출은 원장 insert 가 P2002 로 튕기고, 숙달도·XP 를
//   재적용하지 않은 verdict 를 돌려준다(이중 계상 차단이 이 설계의 존재 이유).
// ============================================================================
import "server-only";

import { Prisma } from "@prisma/client";
import type { VocabDrillMastery, VocabDrillSense } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { advanceAssignment } from "./assignment";
import {
  EWMA_ALPHA,
  INTERVAL_BY_BOX_MS,
  MASTERED_SCORE,
  seoulDayKey,
} from "./constants";
import {
  getExamplesForSense,
  getSenseById,
  getTrapsForSense,
} from "./content";
import { gradeAnswer, parseMatchAnswer, type GradeContext } from "./grade";
import type {
  VocabSubmitBody,
  VocabSubmitVerdict,
  VocabItemType,
} from "./payload";
import { openProbe } from "./probe";

// 상수·수식의 정본은 constants.ts 다(순환 임포트를 피하려 분리). 기존 호출부가
// "@/lib/vocab-drill/engine" 에서 가져다 쓰던 이름들은 여기서 그대로 재노출한다.
export {
  EWMA_ALPHA,
  QUEUE_SIZE,
  WEAK_SCORE,
  MASTERED_SCORE,
  TEST_PASS_SCORE,
  DECK_TEST_SIZE,
  INTERVAL_BY_BOX_MS,
  GRADED_ITEM_TYPES,
  difficultyWindow,
} from "./constants";
export { assignmentPoolSize } from "./assignment";
export {
  markDeckLearnDone,
  completeDeckTest,
  deckStageAllows,
  recomputeDeckProgress,
} from "./deck-progress";

const VALID_SOURCES = new Set([
  "DRILL",
  "FLASH",
  "CONTEXT",
  "REVIEW",
  "DECK_TEST",
  "MIXED",
  "ASSIGNMENT",
  "WORKSHEET",
]);
function normalizeSource(source: string): string {
  return VALID_SOURCES.has(source) ? source : "DRILL";
}

const VALID_ITEM_TYPES = new Set<VocabItemType>([
  "MEANING_CHOICE",
  "WORD_CHOICE",
  "CONTEXT_FILL",
  "SPELL",
  "EXAMPLE_MATCH",
  "TRAP_JUDGE",
  "FLASH",
]);

/**
 * itemType × source 교차 규약 — 클라이언트가 둘을 따로 보내므로 서버가 짝을 검사한다.
 * FLASH 는 학습(LEARN) 문맥에서만 기록되고, 채점형은 FLASH source 를 쓸 수 없다.
 */
function sourceAllowedFor(itemType: VocabItemType, source: string): boolean {
  if (itemType === "FLASH") return source === "FLASH";
  return source !== "FLASH";
}

// ── XP — 제출 시 지급. attempts.clientKey 멱등이 이중지급을 막는 원장이다. ────

function xpFor(correct: boolean, difficulty: number, combo: number): number {
  if (!correct) return 1; // 시도 자체에 최소 보상
  const base = 2 + difficulty; // 3~7
  const comboBonus = combo > 0 && combo % 5 === 0 ? 5 : 0; // 5연속마다 보너스
  return base + comboBonus;
}

/**
 * 이번 제출을 포함한 **세션 연속 정답 수**.
 * 단어별 streak(mastery.streak)이 아니다 — 화면의 "N연속"은 이 세션에서 몇 개를
 * 연달아 맞혔는가를 뜻하므로, 그 의미대로 최근 시도 이력에서 센다.
 */
async function comboAfter(studentId: string, correct: boolean): Promise<number> {
  if (!correct) return 0;
  const recent = await prisma.vocabDrillAttempt.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { correct: true },
  });
  let n = 0;
  // recent[0] 은 방금 저장한 이번 시도다.
  for (const a of recent) {
    if (!a.correct) break;
    n += 1;
  }
  return Math.max(1, n);
}

// ── 숙달도 갱신 ──────────────────────────────────────────────────────────────

async function updateMastery(
  studentId: string,
  academyId: string,
  sense: VocabDrillSense,
  correct: boolean,
): Promise<{
  row: VocabDrillMastery;
  firstSeen: boolean;
  crossedMastered: boolean;
  lostMastered: boolean;
}> {
  const existing = await prisma.vocabDrillMastery.findUnique({
    where: { studentId_senseId: { studentId, senseId: sense.id } },
  });
  const prevScore = existing?.masteryScore ?? (correct ? 40 : 10);
  const score =
    Math.round(
      (prevScore * (1 - EWMA_ALPHA) + (correct ? 100 : 0) * EWMA_ALPHA) * 10,
    ) / 10;
  const streak = correct ? (existing?.streak ?? 0) + 1 : 0;
  const prevBox = existing?.box ?? 0;
  const box = correct ? Math.min(5, prevBox + 1) : Math.max(0, prevBox - 2);
  const lapsed = box < prevBox;
  const now = new Date();
  const dueAt = new Date(now.getTime() + INTERVAL_BY_BOX_MS[box]);

  const row = await prisma.vocabDrillMastery.upsert({
    where: { studentId_senseId: { studentId, senseId: sense.id } },
    create: {
      academyId,
      studentId,
      senseId: sense.id,
      lemmaId: sense.lemmaId,
      attempts: 1,
      correct: correct ? 1 : 0,
      streak,
      masteryScore: score,
      box,
      lapses: 0,
      firstSeenAt: now,
      lastAttemptAt: now,
      dueAt,
    },
    update: {
      attempts: { increment: 1 },
      correct: { increment: correct ? 1 : 0 },
      streak,
      masteryScore: score,
      box,
      lapses: lapsed ? { increment: 1 } : undefined,
      lastAttemptAt: now,
      dueAt,
    },
  });
  // 완성 집계는 **경계를 넘는 순간만** 세되 양방향이다 — 위로 넘으면 +1, 아래로
  // 떨어지면 -1. 한 방향만 세면 80점을 오르내리는 단어가 완성 수를 무한히 부풀린다
  // (적대검수 2026-08-04).
  const prevMastered = (existing?.masteryScore ?? 0) >= MASTERED_SCORE;
  const nowMastered = score >= MASTERED_SCORE;
  return {
    row,
    firstSeen: !existing,
    crossedMastered: !prevMastered && nowMastered,
    lostMastered: prevMastered && !nowMastered,
  };
}

// ── 스텟 갱신 (학생당 1행) ───────────────────────────────────────────────────

async function updateStats(
  studentId: string,
  academyId: string,
  sense: VocabDrillSense,
  args: {
    xp: number;
    firstSeen: boolean;
    crossedMastered: boolean;
    lostMastered: boolean;
    combo: number;
    isReview: boolean;
  },
) {
  const existing = await prisma.vocabDrillStat.findUnique({
    where: { studentId },
  });
  const now = new Date();
  const today = seoulDayKey(now);
  const last = existing?.lastStudyDate ? seoulDayKey(existing.lastStudyDate) : null;
  const yesterday = seoulDayKey(new Date(now.getTime() - 86_400_000));
  const streakDays =
    last === today
      ? (existing?.streakDays ?? 1)
      : last === yesterday
        ? (existing?.streakDays ?? 0) + 1
        : 1;

  const tierXp = { ...((existing?.tierXp as Record<string, number>) ?? {}) };
  tierXp[sense.tier] = (tierXp[sense.tier] ?? 0) + args.xp;
  const posXp = { ...((existing?.posXp as Record<string, number>) ?? {}) };
  posXp[sense.pos] = (posXp[sense.pos] ?? 0) + args.xp;

  await prisma.vocabDrillStat.upsert({
    where: { studentId },
    create: {
      academyId,
      studentId,
      xp: args.xp,
      sensesSeen: args.firstSeen ? 1 : 0,
      sensesMastered: args.crossedMastered ? 1 : 0,
      reviewsDone: args.isReview ? 1 : 0,
      bestCombo: args.combo,
      tierXp,
      posXp,
      lastStudyDate: now,
      streakDays,
    },
    update: {
      xp: { increment: args.xp },
      sensesSeen: args.firstSeen ? { increment: 1 } : undefined,
      // 80점을 넘으면 +1, 아래로 떨어지면 -1(0 미만으로는 안 내려간다).
      sensesMastered: args.crossedMastered
        ? { increment: 1 }
        : args.lostMastered && (existing?.sensesMastered ?? 0) > 0
          ? { decrement: 1 }
          : undefined,
      reviewsDone: args.isReview ? { increment: 1 } : undefined,
      bestCombo: Math.max(existing?.bestCombo ?? 0, args.combo),
      tierXp,
      posXp,
      lastStudyDate: now,
      streakDays,
    },
  });
}


// ── verdict 조립 ─────────────────────────────────────────────────────────────

async function buildVerdictShell(sense: VocabDrillSense) {
  const [traps, examples] = await Promise.all([
    getTrapsForSense(sense.id, 4),
    getExamplesForSense(sense.id, 1),
  ]);
  const ex = examples[0] ?? null;
  return {
    lemma: sense.lemma,
    pos: sense.pos,
    senseKo: sense.senseKo,
    senseEn: sense.senseEn,
    traps: traps.map((t) => ({ kind: t.kind, note: t.note })),
    example: ex ? { en: ex.en, ko: ex.ko } : null,
  };
}

// ── 제출 파이프라인 ──────────────────────────────────────────────────────────

export async function processVocabSubmission(
  studentId: string,
  academyId: string,
  body: VocabSubmitBody,
): Promise<VocabSubmitVerdict | null> {
  if (!VALID_ITEM_TYPES.has(body.itemType)) return null;
  const sense = await getSenseById(body.senseId);
  if (!sense) return null;

  // 채점 재료 수집 — 정답 판정에 쓰는 값은 **전부 probe(서버 봉인)에서만** 온다.
  // 클라이언트가 보낸 라벨은 probe 안의 매핑을 찾는 열쇠일 뿐 정답 근거가 아니다.
  const ctx: GradeContext = { sense };
  if (body.itemType === "TRAP_JUDGE" || body.itemType === "EXAMPLE_MATCH") {
    ctx.probe = body.probe ? openProbe(body.probe) : null;
    if (!ctx.probe || ctx.probe.kind !== body.itemType) return null; // 누락·위조·유형 불일치
  }
  if (body.itemType === "EXAMPLE_MATCH") {
    const probe = ctx.probe;
    if (!probe || probe.kind !== "EXAMPLE_MATCH") return null;
    const parsed = parseMatchAnswer(body.answer);
    if (!parsed) return null;
    const expected = Object.keys(probe.exampleLabels).length;
    ctx.expectedPairs = expected;
    // 라벨 중복 제출로 짝 수를 부풀리는 우회를 막는다.
    if (new Set(parsed.map((p) => p.exampleId)).size !== parsed.length) return null;
    const pairs: NonNullable<GradeContext["matchPairs"]> = [];
    for (const p of parsed) {
      const slot = probe.exampleLabels[p.exampleId];
      const answeredSenseId = probe.senseLabels[p.senseKey];
      if (!slot || !answeredSenseId) return null; // 봉인에 없는 라벨 = 위조
      pairs.push({
        exampleId: p.exampleId,
        answeredKey: answeredSenseId,
        correctKey: slot.senseId,
      });
    }
    ctx.matchPairs = pairs;
  }

  const graded = gradeAnswer(body.itemType, body.answer, ctx);
  if (!graded) return null;
  const { correct, pairResults } = graded;
  const source = normalizeSource(body.source);
  if (!sourceAllowedFor(body.itemType, source)) return null;
  const clientKey = body.clientKey?.slice(0, 64) || null;

  // deckId 는 클라이언트 입력이다 — 소유를 검증하지 않으면 남의 학원 덱으로
  // 원장·진행 행이 생긴다. 검증 실패 시 덱 문맥만 떼고 시도는 살린다.
  let deckId: string | null = null;
  if (body.deckId) {
    const owned = await prisma.vocabDrillDeck.findFirst({
      where: { id: body.deckId, academyId },
      select: { id: true },
    });
    deckId = owned?.id ?? null;
    if (!deckId) return null; // 위조 시도 — 조용히 흡수하지 않는다
  }

  // 원장 기록 — clientKey 부분 유니크가 멱등의 정본이다.
  try {
    await prisma.vocabDrillAttempt.create({
      data: {
        academyId,
        studentId,
        senseId: sense.id,
        lemmaId: sense.lemmaId,
        deckId,
        exampleId: body.exampleId ?? null,
        itemType: body.itemType,
        difficulty: sense.difficulty,
        correct,
        answer: body.answer.slice(0, 500),
        timeMs: Math.max(0, Math.min(30 * 60_000, Math.round(body.timeMs))),
        hintUsed: body.hintUsed,
        meaningPeeked: false,
        source,
        assignmentId: body.assignmentId ?? null,
        clientKey,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      clientKey
    ) {
      // 중복 제출 — 숙달도·XP 재적용 없이 현재 상태로 응답한다.
      const shell = await buildVerdictShell(sense);
      const mastery = await prisma.vocabDrillMastery.findUnique({
        where: { studentId_senseId: { studentId, senseId: sense.id } },
      });
      return {
        correct,
        ...shell,
        pairResults,
        mastery: {
          senseId: sense.id,
          score: mastery?.masteryScore ?? 0,
          streak: mastery?.streak ?? 0,
          box: mastery?.box ?? 0,
          dueAt: mastery?.dueAt?.toISOString() ?? null,
        },
        xpGained: 0,
        duplicate: true,
      };
    }
    throw e;
  }

  const { row: mastery, firstSeen, crossedMastered, lostMastered } =
    await updateMastery(studentId, academyId, sense, correct);
  const combo = await comboAfter(studentId, correct);
  const xp = xpFor(correct, sense.difficulty, combo);
  await updateStats(studentId, academyId, sense, {
    xp,
    firstSeen,
    crossedMastered,
    lostMastered,
    combo,
    isReview: source === "REVIEW",
  });

  if (deckId) {
    // 무거운 재계산은 덱 허브 서버 렌더가 한다 — 여기선 발자국만 남긴다.
    await prisma.vocabDrillDeckProgress
      .upsert({
        where: { studentId_deckId: { studentId, deckId } },
        create: {
          academyId,
          studentId,
          deckId,
          lastStudiedAt: new Date(),
        },
        update: { lastStudiedAt: new Date() },
      })
      .catch(() => undefined); // 진행 발자국 실패가 제출을 깨면 안 된다
  }
  if (body.assignmentId) {
    await advanceAssignment(studentId, body.assignmentId);
  }

  const shell = await buildVerdictShell(sense);
  // TRAP_JUDGE 는 "무엇이라고 주장했는지"를 판정 화면에서 대조해야 학습이 된다.
  let claimKo: string | undefined;
  if (ctx.probe?.kind === "TRAP_JUDGE" && ctx.probe.claimSenseId !== sense.id) {
    const claim = await getSenseById(ctx.probe.claimSenseId);
    claimKo = claim?.senseKo;
  }
  return {
    correct,
    ...shell,
    claimKo,
    pairResults,
    mastery: {
      senseId: sense.id,
      score: mastery.masteryScore,
      streak: mastery.streak,
      box: mastery.box,
      dueAt: mastery.dueAt?.toISOString() ?? null,
    },
    xpGained: xp,
  };
}

