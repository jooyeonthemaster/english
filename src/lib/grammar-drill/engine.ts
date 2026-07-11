// ============================================================================
// 어법 드릴 — 서빙·채점·숙달도 엔진 (서버 전용)
//
// 설계 원칙:
//  - 정답·해설은 제출 후에만 반환(payload.ts 계약).
//  - 숙달도는 EWMA(α=0.25) + 라이트너 box(0~5). box가 난이도 창을 결정해
//    "쉬움→어려움" 사다리를 자동으로 오른다.
//  - 무한 드릴: 미출제 → 과거 오답 재출제 → 최저빈도 재출제 순으로 큐를 짠다.
//  - 단계 게이트: CONCEPT → DRILL → READING → WRITTEN → TEST → MASTERED.
//    게이트 통과 후에도 모든 모드는 계속 풀 수 있다(단계는 진행 배지일 뿐).
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  GRAMMAR_UNITS,
  UNIT_BY_ID,
  CONCEPT_SKELETON_BY_ID,
} from "./curriculum";
import { getGrammarBundle } from "./bundle";
import { isWrittenAnswerAccepted } from "./markup";
import type { GrammarItem } from "./types";
import type {
  ClientItem,
  DrillMode,
  QueueResponse,
  SubmitBody,
  SubmitVerdict,
} from "./payload";

const EWMA_ALPHA = 0.25;
const QUEUE_SIZE = 10;

// 단계 게이트 임계
const DRILL_GATE = { minAttempts: 8, minScore: 70 }; // 개념별
const READING_GATE = { minAttempts: 8, minAccuracy: 0.6 }; // 유닛 reading
const WRITTEN_GATE = { minAttempts: 6, minAccuracy: 0.6 }; // 유닛 written
const TEST_PASS_SCORE = 70;

export const STAGE_ORDER = [
  "CONCEPT",
  "DRILL",
  "READING",
  "WRITTEN",
  "TEST",
  "MASTERED",
] as const;
export type UnitStage = (typeof STAGE_ORDER)[number];

// ── 페이로드 직렬화 ──────────────────────────────────────────────────────────

export function toClientItem(item: GrammarItem): ClientItem {
  const unit = UNIT_BY_ID.get(item.unitId);
  const concept = CONCEPT_SKELETON_BY_ID.get(item.conceptId);
  const base = {
    id: item.id,
    unitId: item.unitId,
    unitTitle: unit?.title ?? item.unitId,
    conceptId: item.conceptId,
    conceptTitle: concept?.title ?? item.conceptId,
    difficulty: item.difficulty,
    hints: item.hints,
  };
  switch (item.type) {
    case "CHOICE":
      return { ...base, type: "CHOICE", stem: item.stem, options: item.options };
    case "OX":
      return { ...base, type: "OX", sentence: item.sentence };
    case "MULTI_UNDERLINE":
      return {
        ...base,
        type: "MULTI_UNDERLINE",
        text: item.text,
        underlineCount: item.underlineCount,
      };
    case "PASSAGE":
      return { ...base, type: "PASSAGE", directive: item.directive, text: item.text };
    case "WRITE_FORM":
      return { ...base, type: "WRITE_FORM", stem: item.stem, given: item.given };
    case "WRITE_CORRECT":
      return { ...base, type: "WRITE_CORRECT", sentence: item.sentence };
  }
}

// ── 채점 ─────────────────────────────────────────────────────────────────────

export function gradeAnswer(
  item: GrammarItem,
  answer: string,
): { correct: boolean } {
  switch (item.type) {
    case "CHOICE":
      return { correct: Number(answer) === item.answer };
    case "OX":
      return { correct: (answer === "O") === item.isCorrect };
    case "MULTI_UNDERLINE":
    case "PASSAGE":
      return { correct: Number(answer) === item.answer };
    case "WRITE_FORM":
    case "WRITE_CORRECT":
      return { correct: isWrittenAnswerAccepted(answer, item.acceptedAnswers) };
  }
}

function verdictAnswerFor(item: GrammarItem): SubmitVerdict["correctAnswer"] {
  switch (item.type) {
    case "CHOICE":
      return { index: item.answer };
    case "OX":
      return { isCorrect: item.isCorrect, correction: item.correction };
    case "MULTI_UNDERLINE":
    case "PASSAGE":
      return { number: item.answer, correction: item.correction };
    case "WRITE_FORM":
    case "WRITE_CORRECT":
      return {
        accepted: item.acceptedAnswers,
        correction:
          item.type === "WRITE_CORRECT" ? item.acceptedAnswers[0] : undefined,
      };
  }
}

// ── 숙달도 갱신 ──────────────────────────────────────────────────────────────

async function updateMastery(
  studentId: string,
  academyId: string,
  item: GrammarItem,
  correct: boolean,
) {
  const existing = await prisma.grammarDrillMastery.findUnique({
    where: { studentId_conceptId: { studentId, conceptId: item.conceptId } },
  });
  const prevScore = existing?.masteryScore ?? (correct ? 40 : 10);
  const score = Math.round(
    (prevScore * (1 - EWMA_ALPHA) + (correct ? 100 : 0) * EWMA_ALPHA) * 10,
  ) / 10;
  const streak = correct ? (existing?.streak ?? 0) + 1 : 0;
  const box = correct
    ? Math.min(5, (existing?.box ?? 0) + 1)
    : Math.max(0, (existing?.box ?? 0) - 2);

  const row = await prisma.grammarDrillMastery.upsert({
    where: { studentId_conceptId: { studentId, conceptId: item.conceptId } },
    create: {
      academyId,
      studentId,
      conceptId: item.conceptId,
      unitId: item.unitId,
      attempts: 1,
      correct: correct ? 1 : 0,
      streak,
      masteryScore: score,
      box,
      lastAttemptAt: new Date(),
    },
    update: {
      attempts: { increment: 1 },
      correct: { increment: correct ? 1 : 0 },
      streak,
      masteryScore: score,
      box,
      lastAttemptAt: new Date(),
    },
  });
  return row;
}

// ── 단계 전환 평가 ───────────────────────────────────────────────────────────

async function ensureProgressRow(
  studentId: string,
  academyId: string,
  unitId: string,
) {
  return prisma.grammarDrillUnitProgress.upsert({
    where: { studentId_unitId: { studentId, unitId } },
    create: { academyId, studentId, unitId },
    update: {},
  });
}

/** 제출 이후 단계 전환 검사 — 전환됐으면 새 단계 반환. */
async function evaluateStage(
  studentId: string,
  academyId: string,
  unitId: string,
  source: string,
): Promise<{ unitId: string; stage: string } | null> {
  const progress = await ensureProgressRow(studentId, academyId, unitId);
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) return null;

  if (progress.stage === "DRILL" && (source === "DRILL" || source === "CONCEPT_CHECK")) {
    const masteries = await prisma.grammarDrillMastery.findMany({
      where: { studentId, unitId },
    });
    const passed =
      unit.conceptIds.every((cid) => {
        const m = masteries.find((x) => x.conceptId === cid);
        return (
          m &&
          m.attempts >= DRILL_GATE.minAttempts &&
          m.masteryScore >= DRILL_GATE.minScore
        );
      });
    if (passed) {
      await prisma.grammarDrillUnitProgress.update({
        where: { id: progress.id },
        data: { stage: "READING", drillDoneAt: new Date() },
      });
      return { unitId, stage: "READING" };
    }
  }

  if (progress.stage === "READING" && source === "READING") {
    const recent = await prisma.grammarDrillAttempt.findMany({
      where: { studentId, unitId, source: "READING" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (
      recent.length >= READING_GATE.minAttempts &&
      recent.filter((a) => a.correct).length / recent.length >=
        READING_GATE.minAccuracy
    ) {
      await prisma.grammarDrillUnitProgress.update({
        where: { id: progress.id },
        data: { stage: "WRITTEN", readingDoneAt: new Date() },
      });
      return { unitId, stage: "WRITTEN" };
    }
  }

  if (progress.stage === "WRITTEN" && source === "WRITTEN") {
    const recent = await prisma.grammarDrillAttempt.findMany({
      where: { studentId, unitId, source: "WRITTEN" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (
      recent.length >= WRITTEN_GATE.minAttempts &&
      recent.filter((a) => a.correct).length / recent.length >=
        WRITTEN_GATE.minAccuracy
    ) {
      await prisma.grammarDrillUnitProgress.update({
        where: { id: progress.id },
        data: { stage: "TEST", writtenDoneAt: new Date() },
      });
      return { unitId, stage: "TEST" };
    }
  }

  return null;
}

/** 개념 학습 완료(learn 플로우 종료) — CONCEPT → DRILL. */
export async function markConceptDone(
  studentId: string,
  academyId: string,
  unitId: string,
) {
  const progress = await ensureProgressRow(studentId, academyId, unitId);
  if (progress.stage === "CONCEPT") {
    await prisma.grammarDrillUnitProgress.update({
      where: { id: progress.id },
      data: { stage: "DRILL", conceptDoneAt: new Date() },
    });
  }
}

/** 유닛 테스트 종료 — 최근 UNIT_TEST 시도 10개로 점수 산출(서버 신뢰 경로). */
export async function completeUnitTest(
  studentId: string,
  academyId: string,
  unitId: string,
): Promise<{ score: number; passed: boolean }> {
  const recent = await prisma.grammarDrillAttempt.findMany({
    where: { studentId, unitId, source: "UNIT_TEST" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const score =
    recent.length === 0
      ? 0
      : Math.round((recent.filter((a) => a.correct).length / recent.length) * 100);
  const progress = await ensureProgressRow(studentId, academyId, unitId);
  const passed = score >= TEST_PASS_SCORE;
  await prisma.grammarDrillUnitProgress.update({
    where: { id: progress.id },
    data: {
      bestTestScore: Math.max(progress.bestTestScore ?? 0, score),
      ...(passed && progress.stage === "TEST"
        ? { stage: "MASTERED", masteredAt: new Date() }
        : {}),
    },
  });
  return { score, passed };
}

// ── 제출 처리 (원장 기록 + 숙달도 + 단계) ────────────────────────────────────

export async function processSubmission(
  studentId: string,
  academyId: string,
  body: SubmitBody,
): Promise<SubmitVerdict | null> {
  const item = getGrammarBundle().itemsById.get(body.itemId);
  if (!item) return null;

  const { correct } = gradeAnswer(item, body.answer);
  const source = normalizeSource(body.source);

  await prisma.grammarDrillAttempt.create({
    data: {
      academyId,
      studentId,
      itemId: item.id,
      unitId: item.unitId,
      conceptId: item.conceptId,
      itemType: item.type,
      difficulty: item.difficulty,
      correct,
      answer: body.answer.slice(0, 500),
      timeMs: Math.max(0, Math.min(30 * 60_000, Math.round(body.timeMs))),
      hintUsed: body.hintUsed,
      conceptPeeked: body.conceptPeeked,
      source,
      assignmentId: body.assignmentId ?? null,
    },
  });

  const mastery = await updateMastery(studentId, academyId, item, correct);
  const stageAdvanced = await evaluateStage(
    studentId,
    academyId,
    item.unitId,
    source,
  );

  if (body.assignmentId) {
    await advanceAssignment(studentId, body.assignmentId);
  }

  return {
    correct,
    correctAnswer: verdictAnswerFor(item),
    explanation: item.explanation,
    rationales:
      item.type === "MULTI_UNDERLINE" || item.type === "PASSAGE"
        ? item.rationales
        : undefined,
    translation: "translation" in item ? item.translation : undefined,
    gist: item.type === "PASSAGE" ? item.gist : undefined,
    mastery: {
      conceptId: mastery.conceptId,
      score: mastery.masteryScore,
      streak: mastery.streak,
      box: mastery.box,
    },
    stageAdvanced: stageAdvanced ?? undefined,
  };
}

const VALID_SOURCES = new Set([
  "DRILL",
  "CONCEPT_CHECK",
  "READING",
  "WRITTEN",
  "UNIT_TEST",
  "MIXED",
  "REVIEW",
  "ASSIGNMENT",
]);
function normalizeSource(source: string): string {
  return VALID_SOURCES.has(source) ? source : "DRILL";
}

async function advanceAssignment(studentId: string, assignmentId: string) {
  const assignment = await prisma.grammarDrillAssignment.findFirst({
    where: { id: assignmentId, studentId },
  });
  if (!assignment || assignment.status === "DONE") return;
  const spec = assignment.spec as { count?: number };
  const target = Math.max(1, Number(spec?.count ?? 10));
  const attempts = await prisma.grammarDrillAttempt.findMany({
    where: { studentId, assignmentId },
    select: { correct: true, timeMs: true },
  });
  const data: Record<string, unknown> = {};
  if (assignment.status === "ASSIGNED") {
    data.status = "IN_PROGRESS";
    data.startedAt = new Date();
  }
  if (attempts.length >= target) {
    data.status = "DONE";
    data.completedAt = new Date();
    data.resultSummary = {
      total: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
      timeMs: attempts.reduce((s, a) => s + a.timeMs, 0),
    };
  }
  if (Object.keys(data).length > 0) {
    await prisma.grammarDrillAssignment.update({
      where: { id: assignment.id },
      data,
    });
  }
}

// ── 큐 빌더 ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** box → 허용 난이도 창 */
function difficultyWindow(box: number): number[] {
  if (box <= 1) return [1, 2];
  if (box <= 3) return [2, 3];
  return [3, 4];
}

interface QueueContext {
  studentId: string;
  academyId: string;
}

async function attemptStatsFor(
  studentId: string,
  itemIds: string[],
): Promise<Map<string, { count: number; lastCorrect: boolean; lastAt: Date }>> {
  if (itemIds.length === 0) return new Map();
  const attempts = await prisma.grammarDrillAttempt.findMany({
    where: { studentId, itemId: { in: itemIds } },
    orderBy: { createdAt: "asc" },
    select: { itemId: true, correct: true, createdAt: true },
  });
  const map = new Map<string, { count: number; lastCorrect: boolean; lastAt: Date }>();
  for (const a of attempts) {
    const prev = map.get(a.itemId);
    map.set(a.itemId, {
      count: (prev?.count ?? 0) + 1,
      lastCorrect: a.correct,
      lastAt: a.createdAt,
    });
  }
  return map;
}

/**
 * 후보 문항을 서빙 우선순위로 정렬해 n개 자른다.
 * 1) 미출제 → 2) 마지막에 틀린 문항(오답 재출제) → 3) 가장 오래전에 본 문항.
 */
async function pickItems(
  ctx: QueueContext,
  candidates: GrammarItem[],
  n: number,
): Promise<GrammarItem[]> {
  const stats = await attemptStatsFor(
    ctx.studentId,
    candidates.map((c) => c.id),
  );
  const unseen = shuffle(candidates.filter((c) => !stats.has(c.id)));
  const wrong = shuffle(
    candidates.filter((c) => stats.get(c.id) && !stats.get(c.id)!.lastCorrect),
  );
  const seen = candidates
    .filter((c) => stats.get(c.id)?.lastCorrect)
    .sort(
      (a, b) =>
        (stats.get(a.id)!.lastAt.getTime() ?? 0) -
        (stats.get(b.id)!.lastAt.getTime() ?? 0),
    );
  const merged: GrammarItem[] = [];
  const push = (it: GrammarItem) => {
    if (merged.length < n && !merged.some((m) => m.id === it.id)) merged.push(it);
  };
  unseen.forEach(push);
  wrong.forEach(push);
  seen.forEach(push);
  return merged.slice(0, n);
}

function itemsOf(
  filter: (item: GrammarItem) => boolean,
): GrammarItem[] {
  return [...getGrammarBundle().itemsById.values()].filter(filter);
}

export async function buildQueue(
  ctx: QueueContext,
  mode: DrillMode,
  opts: {
    unitId?: string;
    conceptId?: string;
    setId?: string;
    assignmentId?: string;
  },
): Promise<QueueResponse | null> {
  const bundle = getGrammarBundle();

  if (mode === "drill" || mode === "concept_check") {
    const unitId = opts.unitId;
    if (!unitId || !UNIT_BY_ID.has(unitId)) return null;
    const unit = UNIT_BY_ID.get(unitId)!;

    if (mode === "concept_check") {
      const picks: GrammarItem[] = [];
      for (const cid of unit.conceptIds) {
        const pool = itemsOf(
          (i) => i.conceptId === cid && i.type === "CHOICE" && i.difficulty === 1,
        );
        const one = await pickItems(ctx, pool, 1);
        picks.push(...one);
      }
      return {
        mode,
        title: `${unit.title} — 개념 체크`,
        items: picks.map(toClientItem),
      };
    }

    // drill: 지정 개념 또는 유닛 내 최약 개념 가중 편성
    const masteries = await prisma.grammarDrillMastery.findMany({
      where: { studentId: ctx.studentId, unitId },
    });
    const boxOf = (cid: string) =>
      masteries.find((m) => m.conceptId === cid)?.box ?? 0;
    const scoreOf = (cid: string) =>
      masteries.find((m) => m.conceptId === cid)?.masteryScore ?? 0;

    const conceptIds = opts.conceptId
      ? [opts.conceptId]
      : [...unit.conceptIds].sort((a, b) => scoreOf(a) - scoreOf(b));

    const picks: GrammarItem[] = [];
    // 최약 개념에 더 많은 슬롯: 4/3/2/1 (개념 1개 지정 시 전량)
    const slotPlan = opts.conceptId
      ? [QUEUE_SIZE]
      : conceptIds.length === 3
        ? [4, 3, 3]
        : [4, 3, 2, 1];
    for (let i = 0; i < conceptIds.length; i++) {
      const cid = conceptIds[i];
      const window = difficultyWindow(boxOf(cid));
      let pool = itemsOf(
        (it) =>
          it.conceptId === cid &&
          (it.type === "CHOICE" || it.type === "OX") &&
          window.includes(it.difficulty),
      );
      if (pool.length === 0) {
        pool = itemsOf(
          (it) => it.conceptId === cid && (it.type === "CHOICE" || it.type === "OX"),
        );
      }
      picks.push(...(await pickItems(ctx, pool, slotPlan[i] ?? 2)));
    }
    const conceptTitle = opts.conceptId
      ? (CONCEPT_SKELETON_BY_ID.get(opts.conceptId)?.title ?? "")
      : "";
    return {
      mode,
      title: opts.conceptId
        ? `${unit.title} · ${conceptTitle} — 드릴`
        : `${unit.title} — 드릴`,
      items: shuffle(picks).map(toClientItem),
    };
  }

  if (mode === "reading" || mode === "written" || mode === "test") {
    const unitId = opts.unitId;
    if (!unitId || !UNIT_BY_ID.has(unitId)) return null;
    const unit = UNIT_BY_ID.get(unitId)!;

    if (mode === "reading") {
      const mu = await pickItems(
        ctx,
        itemsOf((i) => i.unitId === unitId && i.type === "MULTI_UNDERLINE"),
        6,
      );
      const ps = await pickItems(
        ctx,
        itemsOf((i) => i.unitId === unitId && i.type === "PASSAGE"),
        2,
      );
      return {
        mode,
        title: `${unit.title} — 실전 독해`,
        items: [...mu, ...ps].map(toClientItem),
      };
    }

    if (mode === "written") {
      const wf = await pickItems(
        ctx,
        itemsOf((i) => i.unitId === unitId && i.type === "WRITE_FORM"),
        4,
      );
      const wc = await pickItems(
        ctx,
        itemsOf((i) => i.unitId === unitId && i.type === "WRITE_CORRECT"),
        2,
      );
      return {
        mode,
        title: `${unit.title} — 서술형`,
        items: [...wf, ...wc].map(toClientItem),
      };
    }

    // test: 고정 배합 10문항 (CHOICE3 + OX2 + MU3 + PS1 + WC1)
    const parts = await Promise.all([
      pickItems(ctx, itemsOf((i) => i.unitId === unitId && i.type === "CHOICE" && i.difficulty >= 2), 3),
      pickItems(ctx, itemsOf((i) => i.unitId === unitId && i.type === "OX"), 2),
      pickItems(ctx, itemsOf((i) => i.unitId === unitId && i.type === "MULTI_UNDERLINE"), 3),
      pickItems(ctx, itemsOf((i) => i.unitId === unitId && i.type === "PASSAGE"), 1),
      pickItems(ctx, itemsOf((i) => i.unitId === unitId && i.type === "WRITE_CORRECT"), 1),
    ]);
    return {
      mode,
      title: `${unit.title} — 유닛 테스트`,
      items: parts.flat().map(toClientItem),
    };
  }

  if (mode === "review") {
    // 전 유닛: 마지막 시도가 오답인 문항 + 취약 개념(score<60) 미출제 문항
    const wrongAttempts = await prisma.grammarDrillAttempt.findMany({
      where: { studentId: ctx.studentId },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: { itemId: true, correct: true },
    });
    const lastByItem = new Map<string, boolean>();
    for (const a of wrongAttempts) {
      if (!lastByItem.has(a.itemId)) lastByItem.set(a.itemId, a.correct);
    }
    const wrongIds = [...lastByItem.entries()]
      .filter(([, c]) => !c)
      .map(([id]) => id);
    const wrongItems = wrongIds
      .map((id) => bundle.itemsById.get(id))
      .filter((i): i is GrammarItem => Boolean(i));

    const weak = await prisma.grammarDrillMastery.findMany({
      where: { studentId: ctx.studentId, masteryScore: { lt: 60 } },
      orderBy: { masteryScore: "asc" },
      take: 3,
    });
    const weakPool = itemsOf(
      (i) =>
        weak.some((w) => w.conceptId === i.conceptId) &&
        (i.type === "CHOICE" || i.type === "OX"),
    );
    const weakPicks = await pickItems(ctx, weakPool, Math.max(0, QUEUE_SIZE - wrongItems.length));
    const items = [...shuffle(wrongItems).slice(0, QUEUE_SIZE), ...weakPicks].slice(0, QUEUE_SIZE);
    if (items.length === 0) return { mode, title: "복습 — 오답·취약", items: [] };
    return { mode, title: "복습 — 오답·취약", items: items.map(toClientItem) };
  }

  if (mode === "smart") {
    // 오늘의 드릴: 진입한 유닛들에서 최약 개념 3개 × (CHOICE/OX) + 실전 1
    const masteries = await prisma.grammarDrillMastery.findMany({
      where: { studentId: ctx.studentId },
      orderBy: { masteryScore: "asc" },
    });
    let conceptIds = masteries.slice(0, 3).map((m) => m.conceptId);
    if (conceptIds.length === 0) {
      conceptIds = UNIT_BY_ID.get("u01")?.conceptIds.slice(0, 3) ?? [];
    }
    const picks: GrammarItem[] = [];
    for (const cid of conceptIds) {
      const box = masteries.find((m) => m.conceptId === cid)?.box ?? 0;
      const window = difficultyWindow(box);
      let pool = itemsOf(
        (i) =>
          i.conceptId === cid &&
          (i.type === "CHOICE" || i.type === "OX") &&
          window.includes(i.difficulty),
      );
      if (pool.length === 0)
        pool = itemsOf((i) => i.conceptId === cid && (i.type === "CHOICE" || i.type === "OX"));
      picks.push(...(await pickItems(ctx, pool, 3)));
    }
    const unitIds = [...new Set(conceptIds.map((c) => c.slice(0, 3)))];
    const muPool = itemsOf(
      (i) => unitIds.includes(i.unitId) && i.type === "MULTI_UNDERLINE",
    );
    picks.push(...(await pickItems(ctx, muPool, 1)));
    return {
      mode,
      title: "오늘의 드릴 — 취약 개념 집중",
      items: shuffle(picks).slice(0, QUEUE_SIZE).map(toClientItem),
    };
  }

  if (mode === "mixed") {
    const set = bundle.mixedSets.find((s) => s.setId === opts.setId);
    if (!set) return null;
    const items = set.itemIds
      .map((id) => bundle.itemsById.get(id))
      .filter((i): i is GrammarItem => Boolean(i));
    return { mode, title: set.title, items: items.map(toClientItem) };
  }

  if (mode === "assignment") {
    if (!opts.assignmentId) return null;
    const assignment = await prisma.grammarDrillAssignment.findFirst({
      where: { id: opts.assignmentId, studentId: ctx.studentId },
    });
    if (!assignment || assignment.status === "DONE") return null;
    const spec = assignment.spec as {
      unitIds?: string[];
      conceptIds?: string[];
      itemTypes?: string[];
      difficulties?: number[];
      count?: number;
    };
    const done = await prisma.grammarDrillAttempt.count({
      where: { studentId: ctx.studentId, assignmentId: assignment.id },
    });
    const target = Math.max(1, Number(spec?.count ?? 10));
    const remaining = Math.max(0, target - done);
    if (remaining === 0) return { mode, title: assignment.title, items: [], assignmentRemaining: 0 };

    const pool = itemsOf((i) => {
      if (spec.conceptIds?.length && !spec.conceptIds.includes(i.conceptId)) return false;
      if (spec.unitIds?.length && !spec.unitIds.includes(i.unitId)) return false;
      if (spec.itemTypes?.length && !spec.itemTypes.includes(i.type)) return false;
      if (spec.difficulties?.length && !spec.difficulties.includes(i.difficulty)) return false;
      return true;
    });
    const picks = await pickItems(ctx, pool, Math.min(QUEUE_SIZE, remaining));
    return {
      mode,
      title: assignment.title,
      items: picks.map(toClientItem),
      assignmentRemaining: remaining,
    };
  }

  return null;
}

// ── 유닛 잠금 정책 ───────────────────────────────────────────────────────────

/**
 * u01은 항상 열림. uN은 u(N-1)의 드릴 게이트 통과(drillDoneAt) 시 열림.
 * 선생님 배정은 잠금을 우회한다(assignment 모드는 이 정책을 보지 않음).
 */
export function computeUnlockedUnits(
  progresses: { unitId: string; drillDoneAt: Date | null }[],
): Set<string> {
  const unlocked = new Set<string>(["u01"]);
  for (let i = 1; i < GRAMMAR_UNITS.length; i++) {
    const prev = GRAMMAR_UNITS[i - 1];
    const prevProgress = progresses.find((p) => p.unitId === prev.id);
    if (prevProgress?.drillDoneAt) unlocked.add(GRAMMAR_UNITS[i].id);
    else break;
  }
  return unlocked;
}
