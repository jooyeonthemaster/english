// ============================================================================
// 어법 스텟 — XP·레벨·렌즈/파트 축의 순수 계산 정본 (docs/study-os-spec.md §12)
//
// 이 모듈은 **순수**하다(서버 전용 import 금지) — 상태창(클라이언트)과
// 저장 경로(서버)가 같은 수식을 공유해야 숫자가 어긋나지 않는다.
// DB 반영은 src/lib/study-os/stats-store.ts(서버 전용)가 담당한다.
// ============================================================================

import type { JudgeLens } from "./lesson-types";

// ── XP 원장 (서버가 클램프하는 유일한 단가표) ───────────────────────────────

/** 레슨 최초 완주 */
export const XP_LESSON_FIRST = 80;
/** 재수련(같은 레슨 2회차부터) 완주 */
export const XP_LESSON_REPLAY = 30;
/** CHECK·RECAP 문항 정답 1개 */
export const XP_CHECK_CORRECT = 6;
/** 게임 블록 클리어(최초 1회) */
export const XP_GAME_DONE = 4;
/** 게임 블록 퍼펙트(최초 1회 — done 이후 승급 시 차액 지급) */
export const XP_GAME_PERFECT = 10;
/** 보스전 승리 가산(게임 XP 와 별도) */
export const XP_BOSS_WIN = 15;

// ── 레벨 곡선 ───────────────────────────────────────────────────────────────
// level = floor(sqrt(xp/60)) + 1.
// Lv2 60xp(레슨 1개면 도달 — 첫 성취를 빠르게), Lv5 960xp, Lv10 4,860xp,
// Lv20 21,660xp — 75레슨 전 완주 + 게임 퍼펙트 즈음 Lv20 대에 닿는 설계다.

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
}

/** 해당 레벨이 시작되는 XP 임계값 */
export function xpAtLevel(level: number): number {
  const l = Math.max(1, Math.trunc(level));
  return 60 * (l - 1) * (l - 1);
}

/** 다음 레벨까지의 진행 정보 (상태창 XP 게이지용) */
export function levelProgress(xp: number): {
  level: number;
  /** 현재 레벨 구간에서 채운 XP */
  into: number;
  /** 현재 레벨 구간의 총 길이 */
  span: number;
  /** 0~1 */
  ratio: number;
} {
  const level = levelForXp(xp);
  const floor = xpAtLevel(level);
  const ceil = xpAtLevel(level + 1);
  const span = ceil - floor;
  const into = Math.max(0, xp - floor);
  return { level, into, span, ratio: span > 0 ? Math.min(1, into / span) : 1 };
}

// ── 축(렌즈·파트) ───────────────────────────────────────────────────────────

export type LensXp = Record<JudgeLens, number>;
/** p0 기초골격(b) · p1 골격기(u01~05) · p2 연결기(u06~09) · p3 정밀기(u10~12) */
export type PartKey = "p0" | "p1" | "p2" | "p3";
export type PartXp = Record<PartKey, number>;

export const EMPTY_LENS_XP: LensXp = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 };
export const EMPTY_PART_XP: PartXp = { p0: 0, p1: 0, p2: 0, p3: 0 };

export const PART_LABEL: Record<PartKey, string> = {
  p0: "기초 골격",
  p1: "골격기",
  p2: "연결기",
  p3: "정밀기",
};

/** unitId → 파트 축 (커리큘럼 §2.2 — b*: PART0, u01~05, u06~09, u10~12) */
export function partForUnit(unitId: string): PartKey {
  if (unitId.startsWith("b")) return "p0";
  const n = Number(unitId.slice(1));
  if (n <= 5) return "p1";
  if (n <= 9) return "p2";
  return "p3";
}

/** 완주 XP 를 레슨 렌즈에 균등 배분(내림 — 남는 끝수는 버린다, 결정론) */
export function splitLensXp(total: number, lenses: JudgeLens[]): Partial<LensXp> {
  if (lenses.length === 0) return {};
  const each = Math.floor(total / lenses.length);
  const out: Partial<LensXp> = {};
  for (const l of lenses) out[l] = (out[l] ?? 0) + each;
  return out;
}

// ── 게임 로그 (XP 중복 지급 방지 원장) ──────────────────────────────────────

export type GameBest = "done" | "perfect";
/**
 * key: `${conceptId}:${blockId}` (게임) 또는 `lesson:${conceptId}` (완주 원장).
 * lastAt 은 완주 XP 재지급 쿨다운(연타·이중 저장 방어)에 쓴다.
 */
export type GameLog = Record<string, { plays: number; best: GameBest; lastAt?: string }>;

/** 클라이언트가 신고하는 게임 이벤트(서버가 블록 실존·타입을 검증 후 반영) */
export interface GameEvent {
  blockId: string;
  result: "done" | "perfect" | "fail";
  combo?: number;
}

/**
 * 게임 결과 1건의 XP 증분 — 최초 done +4, done→perfect 승급 시 차액 +6,
 * 이미 perfect 면 0 (plays 는 항상 +1).
 */
export function gameXpDelta(prevBest: GameBest | undefined, result: GameBest): number {
  if (!prevBest) return result === "perfect" ? XP_GAME_PERFECT : XP_GAME_DONE;
  if (prevBest === "done" && result === "perfect") return XP_GAME_PERFECT - XP_GAME_DONE;
  return 0;
}

// ── 스냅샷 (칭호 엔진·상태창의 입력) ────────────────────────────────────────

export interface StatSnapshot {
  xp: number;
  level: number;
  lessonsCompleted: number;
  replays: number;
  gamesPlayed: number;
  gamePerfects: number;
  bossWins: number;
  bossLosses: number;
  memoryGatePasses: number;
  bestCombo: number;
  lensXp: LensXp;
  partXp: PartXp;
  /** 완료 레슨 수 — 기초(b)/판별(u) 분해 */
  basicConceptsDone: number;
  judgeConceptsDone: number;
  /** 드릴 숙달도 평균(0~100) — mastery 테이블 집계, 없으면 0 */
  avgMastery: number;
  streakDays: number;
}

export function emptySnapshot(): StatSnapshot {
  return {
    xp: 0,
    level: 1,
    lessonsCompleted: 0,
    replays: 0,
    gamesPlayed: 0,
    gamePerfects: 0,
    bossWins: 0,
    bossLosses: 0,
    memoryGatePasses: 0,
    bestCombo: 0,
    lensXp: { ...EMPTY_LENS_XP },
    partXp: { ...EMPTY_PART_XP },
    basicConceptsDone: 0,
    judgeConceptsDone: 0,
    avgMastery: 0,
    streakDays: 0,
  };
}

// ── 상태창 페이로드 (GET /api/grammar-drill/stats 응답 계약) ────────────────

export interface StatusTitleView {
  key: string;
  name: string;
  kind: "COMBO" | "SPECIAL";
  /** 미획득 칭호의 획득 힌트(잠금 실루엣 옆에 노출) */
  hint?: string;
  earnedAt?: string;
}

export interface StatusPayload {
  ok: true;
  studentName: string;
  snapshot: StatSnapshot;
  level: ReturnType<typeof levelProgress>;
  activeTitle: StatusTitleView;
  /** 획득 칭호(최신순) */
  unlocked: StatusTitleView[];
  /** 아직 못 얻은 칭호 중 "다음에 노릴 것" 3개 (힌트 포함) */
  nextHints: StatusTitleView[];
  /** 렌즈 축 표시용 — 각 렌즈의 이름·한 줄 */
  lenses: { id: JudgeLens; name: string; xp: number }[];
  parts: { id: PartKey; name: string; xp: number; done: number; total: number }[];
}

/** 레슨 저장 응답의 성장 리포트(완료 화면 연출 계약) */
export interface GrowthReport {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  newTitles: StatusTitleView[];
  lensGained: Partial<LensXp>;
}
