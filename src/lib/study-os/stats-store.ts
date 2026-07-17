import "server-only";

// ============================================================================
// 어법 스텟 저장소 — XP 지급·전적 적산·연속일·칭호 이력의 서버 정본.
// 규범: docs/study-os-spec.md §12·§15. 수식은 stats.ts(순수)와 공유한다.
//
// 방어선:
//  - 게임 XP 는 gameLog 원장으로 **블록당 최초 1회**(perfect 승급 차액만 추가).
//  - 완주 XP 는 lesson:{conceptId} 원장 + 10분 쿨다운(이중 저장·연타 방어).
//  - 클라이언트 신고(gameEvents)는 레슨 파일의 블록 실존·게임 타입 검증을 통과해야 한다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { GAME_BLOCK_TYPES, type JudgeLens } from "./lesson-types";
import { getLessonBundle } from "./lesson-bundle";
import { JUDGE_LENSES } from "./lenses";
import { GRAMMAR_CONCEPT_SKELETONS } from "@/lib/grammar-drill/curriculum";
import {
  EMPTY_LENS_XP,
  EMPTY_PART_XP,
  PART_LABEL,
  XP_BOSS_WIN,
  XP_CHECK_CORRECT,
  XP_LESSON_FIRST,
  XP_LESSON_REPLAY,
  emptySnapshot,
  gameXpDelta,
  levelForXp,
  levelProgress,
  partForUnit,
  splitLensXp,
  type GameEvent,
  type GameLog,
  type GrowthReport,
  type LensXp,
  type PartKey,
  type PartXp,
  type StatSnapshot,
  type StatusPayload,
  type StatusTitleView,
} from "./stats";
import { computeTitles } from "./titles";

/** 완주 XP 재지급 쿨다운(ms) — 완료 화면 자기평가 재선택·이중 fetch 방어 */
const COMPLETE_COOLDOWN_MS = 10 * 60 * 1000;

// ── 내부 유틸 ───────────────────────────────────────────────────────────────

function asLensXp(v: unknown): LensXp {
  const src = (v ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY_LENS_XP };
  for (const k of Object.keys(out) as JudgeLens[]) {
    const n = Number(src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = Math.trunc(n);
  }
  return out;
}

function asPartXp(v: unknown): PartXp {
  const src = (v ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY_PART_XP };
  for (const k of Object.keys(out) as PartKey[]) {
    const n = Number(src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = Math.trunc(n);
  }
  return out;
}

function asGameLog(v: unknown): GameLog {
  if (!v || typeof v !== "object") return {};
  const out: GameLog = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { plays?: unknown; best?: unknown; lastAt?: unknown };
    out[k] = {
      plays: Math.max(0, Math.trunc(Number(r.plays) || 0)),
      best: r.best === "perfect" ? "perfect" : "done",
      lastAt: typeof r.lastAt === "string" ? r.lastAt : undefined,
    };
  }
  return out;
}

type TitleLedger = { key: string; earnedAt: string }[];

function asTitleLedger(v: unknown): TitleLedger {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (t): t is { key: string; earnedAt: string } =>
        Boolean(t) &&
        typeof (t as { key?: unknown }).key === "string" &&
        typeof (t as { earnedAt?: unknown }).earnedAt === "string",
    )
    .map((t) => ({ key: t.key, earnedAt: t.earnedAt }));
}

/** Asia/Seoul 자정 기준의 날짜 문자열(YYYY-MM-DD) */
function seoulDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isYesterday(prev: Date, now: Date): boolean {
  const dayMs = 86_400_000;
  return seoulDateKey(new Date(now.getTime() - dayMs)) === seoulDateKey(prev);
}

// ── 파생 스냅샷 (칭호·상태창의 입력) ────────────────────────────────────────

interface StatRowLike {
  xp: number;
  lessonsCompleted: number;
  replays: number;
  gamesPlayed: number;
  gamePerfects: number;
  bossWins: number;
  bossLosses: number;
  memoryGatePasses: number;
  bestCombo: number;
  lensXp: unknown;
  partXp: unknown;
  streakDays: number;
}

async function deriveSnapshot(
  studentId: string,
  row: StatRowLike | null,
): Promise<StatSnapshot> {
  const [doneRows, masteryAgg] = await Promise.all([
    prisma.grammarDrillLessonProgress.findMany({
      where: { studentId, completedAt: { not: null } },
      select: { unitId: true },
    }),
    prisma.grammarDrillMastery.aggregate({
      where: { studentId },
      _avg: { masteryScore: true },
    }),
  ]);
  const basic = doneRows.filter((r) => r.unitId.startsWith("b")).length;
  const judge = doneRows.length - basic;

  const s = emptySnapshot();
  if (row) {
    s.xp = row.xp;
    s.lessonsCompleted = row.lessonsCompleted;
    s.replays = row.replays;
    s.gamesPlayed = row.gamesPlayed;
    s.gamePerfects = row.gamePerfects;
    s.bossWins = row.bossWins;
    s.bossLosses = row.bossLosses;
    s.memoryGatePasses = row.memoryGatePasses;
    s.bestCombo = row.bestCombo;
    s.lensXp = asLensXp(row.lensXp);
    s.partXp = asPartXp(row.partXp);
    s.streakDays = row.streakDays;
  }
  s.level = levelForXp(s.xp);
  s.basicConceptsDone = basic;
  s.judgeConceptsDone = judge;
  s.avgMastery = Math.round(masteryAgg._avg.masteryScore ?? 0);
  return s;
}

// ── 성장 반영 (레슨 저장 경로에서 호출) ─────────────────────────────────────

export interface ApplyGrowthInput {
  studentId: string;
  academyId: string;
  conceptId: string;
  /** first = 최초 완주 / replay = 재수련 완주 / null = 완주 아님(중간 저장) */
  completion: "first" | "replay" | null;
  checkDelta?: { correct: number; total: number };
  gameEvents?: GameEvent[];
}

export async function applyGrowth(input: ApplyGrowthInput): Promise<GrowthReport | null> {
  const lesson = getLessonBundle().lessonsById.get(input.conceptId);
  if (!lesson) return null;

  // 신고 이벤트 검증 — 레슨에 실존하는 게임 블록만, 최대 12건
  const gameBlockById = new Map(
    lesson.blocks
      .filter((b) => (GAME_BLOCK_TYPES as string[]).includes(b.type))
      .map((b) => [b.id, b] as const),
  );
  const events = (input.gameEvents ?? [])
    .filter((e) => gameBlockById.has(e.blockId))
    .slice(0, 12);

  const hasWork =
    input.completion !== null ||
    events.length > 0 ||
    (input.checkDelta?.total ?? 0) > 0;
  if (!hasWork) return null;

  const row = await prisma.grammarDrillStat.findUnique({
    where: { studentId: input.studentId },
  });

  const before = await deriveSnapshot(input.studentId, row);
  const now = new Date();
  const nowIso = now.toISOString();

  const log = asGameLog(row?.gameLog);
  const lensXp = asLensXp(row?.lensXp);
  const partXp = asPartXp(row?.partXp);
  const ledger = asTitleLedger(row?.titles);

  let xpGained = 0;
  let lessonsCompleted = row?.lessonsCompleted ?? 0;
  let replays = row?.replays ?? 0;
  let gamesPlayed = row?.gamesPlayed ?? 0;
  let gamePerfects = row?.gamePerfects ?? 0;
  let bossWins = row?.bossWins ?? 0;
  let bossLosses = row?.bossLosses ?? 0;
  let memoryGatePasses = row?.memoryGatePasses ?? 0;
  let bestCombo = row?.bestCombo ?? 0;

  // ── 게임 이벤트 ──
  for (const e of events) {
    const block = gameBlockById.get(e.blockId)!;
    const key = `${input.conceptId}:${e.blockId}`;
    const prev = log[key];
    const combo = Math.max(0, Math.min(99, Math.trunc(Number(e.combo) || 0)));
    if (combo > bestCombo) bestCombo = combo;
    gamesPlayed += 1;

    if (e.result === "fail") {
      if (block.type === "BOSS") bossLosses += 1;
      log[key] = { plays: (prev?.plays ?? 0) + 1, best: prev?.best ?? "done", lastAt: nowIso };
      // fail 은 best 를 만들지 않는다 — 최초 기록이 fail 이면 원장에 plays 만 남긴다
      if (!prev) log[key].best = "done" as const;
      continue;
    }

    if (e.result === "perfect") gamePerfects += 1;
    if (block.type === "BOSS") {
      bossWins += 1;
      xpGained += XP_BOSS_WIN;
    }
    if (block.type === "MEMORY_GATE") memoryGatePasses += 1;

    // 원장 기반 최초/승급 XP — prev 가 없으면 신규, done→perfect 승급이면 차액
    const hadEntry = prev && prev.plays > 0;
    xpGained += gameXpDelta(hadEntry ? prev.best : undefined, e.result);
    log[key] = {
      plays: (prev?.plays ?? 0) + 1,
      best: prev?.best === "perfect" || e.result === "perfect" ? "perfect" : "done",
      lastAt: nowIso,
    };
  }

  // ── 완주 XP (쿨다운 원장) ──
  if (input.completion) {
    const key = `lesson:${input.conceptId}`;
    const prev = log[key];
    const lastAt = prev?.lastAt ? Date.parse(prev.lastAt) : 0;
    const cooled = now.getTime() - lastAt >= COMPLETE_COOLDOWN_MS;
    if (input.completion === "first" && (!prev || prev.plays === 0)) {
      xpGained += XP_LESSON_FIRST;
      lessonsCompleted += 1;
      log[key] = { plays: 1, best: "done", lastAt: nowIso };
    } else if (cooled) {
      xpGained += XP_LESSON_REPLAY;
      replays += 1;
      log[key] = { plays: (prev?.plays ?? 0) + 1, best: "done", lastAt: nowIso };
    }
  }

  // ── 확인 문항 XP ──
  const checkCorrect = Math.max(
    0,
    Math.min(20, Math.trunc(input.checkDelta?.correct ?? 0)),
  );
  xpGained += checkCorrect * XP_CHECK_CORRECT;

  // ── 축 배분 ──
  const lensGained = splitLensXp(xpGained, lesson.lenses);
  for (const [k, v] of Object.entries(lensGained)) {
    lensXp[k as JudgeLens] += v ?? 0;
  }
  partXp[partForUnit(lesson.unitId)] += xpGained;

  // ── 연속일 ──
  let streakDays = row?.streakDays ?? 0;
  const last = row?.lastStudyDate ?? null;
  if (!last) streakDays = 1;
  else if (seoulDateKey(last) === seoulDateKey(now)) streakDays = Math.max(1, streakDays);
  else if (isYesterday(last, now)) streakDays += 1;
  else streakDays = 1;

  // ── 칭호 — 새로 열린 특별 칭호를 이력에 적재 ──
  const after: StatSnapshot = {
    ...before,
    xp: before.xp + xpGained,
    level: levelForXp(before.xp + xpGained),
    lessonsCompleted,
    replays,
    gamesPlayed,
    gamePerfects,
    bossWins,
    bossLosses,
    memoryGatePasses,
    bestCombo,
    lensXp,
    partXp,
    streakDays,
    basicConceptsDone:
      before.basicConceptsDone +
      (input.completion === "first" && lesson.unitId.startsWith("b") ? 1 : 0),
    judgeConceptsDone:
      before.judgeConceptsDone +
      (input.completion === "first" && !lesson.unitId.startsWith("b") ? 1 : 0),
  };
  const beforeTitles = new Set(computeTitles(before).unlockedSpecials.map((t) => t.key));
  const afterTitles = computeTitles(after);
  const newTitles: StatusTitleView[] = afterTitles.unlockedSpecials
    .filter((t) => !beforeTitles.has(t.key))
    .map((t) => ({ ...t, earnedAt: nowIso }));
  for (const t of newTitles) {
    if (!ledger.some((l) => l.key === t.key)) ledger.push({ key: t.key, earnedAt: nowIso });
  }

  await prisma.grammarDrillStat.upsert({
    where: { studentId: input.studentId },
    create: {
      academyId: input.academyId,
      studentId: input.studentId,
      xp: after.xp,
      lessonsCompleted,
      replays,
      gamesPlayed,
      gamePerfects,
      bossWins,
      bossLosses,
      memoryGatePasses,
      bestCombo,
      lensXp,
      partXp,
      titles: ledger,
      gameLog: log,
      lastStudyDate: now,
      streakDays,
    },
    update: {
      xp: after.xp,
      lessonsCompleted,
      replays,
      gamesPlayed,
      gamePerfects,
      bossWins,
      bossLosses,
      memoryGatePasses,
      bestCombo,
      lensXp,
      partXp,
      titles: ledger,
      gameLog: log,
      lastStudyDate: now,
      streakDays,
    },
  });

  return {
    xpGained,
    levelBefore: before.level,
    levelAfter: after.level,
    newTitles,
    lensGained,
  };
}

// ── 상태창 페이로드 ─────────────────────────────────────────────────────────

const TOTAL_BY_PART: Record<PartKey, number> = (() => {
  const out: Record<PartKey, number> = { p0: 0, p1: 0, p2: 0, p3: 0 };
  for (const s of GRAMMAR_CONCEPT_SKELETONS) out[partForUnit(s.unitId)] += 1;
  return out;
})();

export async function buildStatusPayload(
  studentId: string,
  studentName: string,
): Promise<StatusPayload> {
  const [row, doneRows] = await Promise.all([
    prisma.grammarDrillStat.findUnique({ where: { studentId } }),
    prisma.grammarDrillLessonProgress.findMany({
      where: { studentId, completedAt: { not: null } },
      select: { unitId: true },
    }),
  ]);
  const snapshot = await deriveSnapshot(studentId, row);
  const titles = computeTitles(snapshot);
  const ledger = asTitleLedger(row?.titles);
  const earnedAtByKey = new Map(ledger.map((l) => [l.key, l.earnedAt]));

  const doneByPart: Record<PartKey, number> = { p0: 0, p1: 0, p2: 0, p3: 0 };
  for (const r of doneRows) doneByPart[partForUnit(r.unitId)] += 1;

  const unlocked: StatusTitleView[] = titles.unlockedSpecials
    .map((t) => ({ ...t, earnedAt: earnedAtByKey.get(t.key) }))
    .sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""));

  return {
    ok: true,
    studentName,
    snapshot,
    level: levelProgress(snapshot.xp),
    activeTitle: { ...titles.active },
    unlocked,
    nextHints: titles.nextHints,
    lenses: JUDGE_LENSES.map((l) => ({
      id: l.id,
      name: l.name,
      xp: snapshot.lensXp[l.id],
    })),
    parts: (Object.keys(PART_LABEL) as PartKey[]).map((p) => ({
      id: p,
      name: PART_LABEL[p],
      xp: snapshot.partXp[p],
      done: doneByPart[p],
      total: TOTAL_BY_PART[p],
    })),
  };
}
