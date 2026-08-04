// ============================================================================
// 단어 훈련 — 콘텐츠 게이트 (server-only)
//
// 어법 드릴의 bundle.ts(코드 번들 fs 로더) 대응물이지만 정본이 DB 다
// (prisma/sql/vocab-drill-init.sql §1 결정 1 — 표제어 27,011 · sense 35,341 규모).
// 원칙 2가지를 그대로 승계한다:
//   (a) 이 모듈은 서버에만 상주한다 — 클라이언트로는 화이트리스트 페이로드만.
//   (b) 모든 서빙 질의에 LIMIT 를 강제한다(학생×sense 는 수만 행 — init.sql §0 Q3).
// 콘텐츠 테이블은 읽기 전용이다. 쓰기는 scripts/vocab-db-load.ts 만 한다.
// ============================================================================
import "server-only";

import { prisma } from "@/lib/prisma";
import type { VocabDrillSense } from "@prisma/client";
import { VOCAB_STOPWORDS } from "./constants";
import type { VocabDeckSpec } from "./payload";

// ── 활성 번들 ────────────────────────────────────────────────────────────────
// 활성 번들은 DB 부분 유니크가 정확히 1개를 보장한다(init.sql:223-224).
// 재적재는 드물므로 60초 모듈 캐시로 목록 질의마다 붙는 조회를 없앤다.

let bundleCache: { version: string; at: number } | null = null;
const BUNDLE_TTL_MS = 60_000;

export async function getActiveBundleVersion(): Promise<string | null> {
  const now = Date.now();
  if (bundleCache && now - bundleCache.at < BUNDLE_TTL_MS) {
    return bundleCache.version;
  }
  const row = await prisma.vocabDrillBundle.findFirst({
    where: { status: "ACTIVE" },
    select: { version: true },
  });
  if (!row) return null;
  bundleCache = { version: row.version, at: now };
  return row.version;
}

// ── sense 조회 ───────────────────────────────────────────────────────────────

/** 서빙 공통 필터 — 은퇴 sense 는 어느 표면에도 내려가지 않는다. */
const LIVE = { retiredAt: null } as const;

export async function getSenseById(
  senseId: string,
): Promise<VocabDrillSense | null> {
  return prisma.vocabDrillSense.findFirst({
    where: { id: senseId, ...LIVE },
  });
}

export async function getSensesByIds(
  senseIds: string[],
): Promise<VocabDrillSense[]> {
  if (!senseIds.length) return [];
  return prisma.vocabDrillSense.findMany({
    where: { id: { in: senseIds.slice(0, 500) }, ...LIVE },
  });
}

// ── 덱 스펙 → sense 파생 (덱 = 저장된 질의, init.sql 3-3) ────────────────────

const DECK_DEFAULT_LIMIT = 100;
const DECK_MAX_LIMIT = 500;

function specWhere(spec: VocabDeckSpec) {
  const where: Record<string, unknown> = { ...LIVE };
  if (spec.senseIds?.length) {
    where.id = { in: spec.senseIds.slice(0, DECK_MAX_LIMIT) };
    return where;
  }
  // 대표 뜻 한정은 **명시적 false 일 때만** — undefined(구형·기본 덱)는 전 뜻
  // 그대로다(기존 덱 풀 무접촉). per10k 가 표제어 역정규화 값이라 전 뜻 풀에선
  // 다의어의 뜻들이 상위를 플러딩한다(적대검수 실측: 100단어 덱에 표제어 20개).
  if (spec.allSenses === false) where.senseOrder = 0;
  if (spec.excludeStopwords) where.lemma = { notIn: [...VOCAB_STOPWORDS] };
  if (spec.tiers?.length) where.tier = { in: spec.tiers };
  if (spec.grades?.length) where.gradeTop = { in: spec.grades };
  if (spec.difficulties?.length) where.difficulty = { in: spec.difficulties };
  if (spec.posList?.length) where.pos = { in: spec.posList };
  if (spec.trendLabels?.length) where.trendLabel = { in: spec.trendLabels };
  if (typeof spec.minPer10k === "number") where.per10k = { gte: spec.minPer10k };
  if (spec.excludePhrase) where.isPhrase = false;
  return where;
}

export function deckLimit(spec: VocabDeckSpec): number {
  const raw = Number(spec.limit) || DECK_DEFAULT_LIMIT;
  return Math.max(1, Math.min(DECK_MAX_LIMIT, raw));
}

/** 덱 소속 sense — 빈도(per10k) 내림차순이 덱의 표준 정렬이다(Q1). */
export async function resolveDeckSenses(
  spec: VocabDeckSpec,
): Promise<VocabDrillSense[]> {
  return prisma.vocabDrillSense.findMany({
    where: specWhere(spec),
    orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take: deckLimit(spec),
  });
}

export async function resolveDeckSenseIds(
  spec: VocabDeckSpec,
): Promise<string[]> {
  const rows = await prisma.vocabDrillSense.findMany({
    where: specWhere(spec),
    orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take: deckLimit(spec),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function countDeckPool(spec: VocabDeckSpec): Promise<number> {
  const n = await prisma.vocabDrillSense.count({ where: specWhere(spec) });
  return Math.min(n, deckLimit(spec));
}

// ── 예문·함정 ────────────────────────────────────────────────────────────────

export async function getExamplesForSense(senseId: string, take = 5) {
  return prisma.vocabDrillExample.findMany({
    where: { senseId, ...LIVE },
    orderBy: { ord: "asc" },
    take,
  });
}

export async function getExamplesForSenses(senseIds: string[]) {
  if (!senseIds.length) return [];
  return prisma.vocabDrillExample.findMany({
    where: { senseId: { in: senseIds.slice(0, 100) }, ...LIVE },
    orderBy: [{ senseId: "asc" }, { ord: "asc" }],
    take: 500,
  });
}

export async function getTrapsForSense(senseId: string, take = 4) {
  return prisma.vocabDrillTrap.findMany({
    where: { senseId, ...LIVE },
    orderBy: { ord: "asc" },
    take,
  });
}

// ── 오답 선지 풀 ─────────────────────────────────────────────────────────────
// 선지는 큐 조립 시 서버가 뽑는다. 규칙:
//   · MEANING_CHOICE 의 오답 뜻은 **다른 표제어**의 sense 에서만 — 같은 표제어의
//     다른 뜻을 넣으면 다의어 학습과 채점이 충돌한다.
//   · WORD_CHOICE/CONTEXT_FILL 의 오답 표제어는 혼동어(confusable) 우선, 부족하면
//     같은 품사·이웃 난이도에서 채운다.
// ORDER BY random() 전수 스캔 대신, 인덱스가 받는 풀(Q2)을 한 번 떠와 JS 셔플한다.

export interface DistractorPool {
  /** 다른 표제어의 뜻(ko) 후보 — pos 는 같은 품사 우선 선별용 */
  meanings: { senseKo: string; lemmaId: string; pos: string }[];
  /** 표제어 후보 */
  lemmas: { lemma: string; lemmaId: string; pos: string }[];
}

export async function fetchDistractorPool(
  pos: string[],
  difficulties: number[],
): Promise<DistractorPool> {
  const rows = await prisma.vocabDrillSense.findMany({
    where: {
      ...LIVE,
      pos: { in: pos.length ? pos : undefined },
      difficulty: { in: difficulties.length ? difficulties : undefined },
      isPhrase: false,
    },
    orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take: 300,
    select: { senseKo: true, lemma: true, lemmaId: true, pos: true },
  });
  return {
    meanings: rows.map((r) => ({
      senseKo: r.senseKo,
      lemmaId: r.lemmaId,
      pos: r.pos,
    })),
    lemmas: rows.map((r) => ({
      lemma: r.lemma,
      lemmaId: r.lemmaId,
      pos: r.pos,
    })),
  };
}

/** 혼동어(lemma.confusable) 표제어들 — WORD_CHOICE/CONTEXT_FILL 오답 1순위. */
export async function getConfusableLemmas(
  lemmaId: string,
): Promise<string[]> {
  const row = await prisma.vocabDrillLemma.findFirst({
    where: { id: lemmaId, ...LIVE },
    select: { confusable: true },
  });
  const list = Array.isArray(row?.confusable) ? row.confusable : [];
  return list.filter((x): x is string => typeof x === "string").slice(0, 8);
}

// ── 표제어 보조 ──────────────────────────────────────────────────────────────

export async function getLemmaById(lemmaId: string) {
  return prisma.vocabDrillLemma.findFirst({ where: { id: lemmaId, ...LIVE } });
}

/** 다의어(활성 sense 2+ 표제어)의 sense 들 — EXAMPLE_MATCH/TRAP_JUDGE 재료. */
export async function getSiblingSenses(
  lemmaId: string,
): Promise<VocabDrillSense[]> {
  return prisma.vocabDrillSense.findMany({
    where: { lemmaId, ...LIVE },
    orderBy: { senseOrder: "asc" },
    take: 8,
  });
}

// ── 표시 보조 ────────────────────────────────────────────────────────────────

export function exampleSourceLabel(e: {
  year: number | null;
  grade: string | null;
  typeGroup: string | null;
}): string | null {
  const parts = [e.year ? String(e.year) : null, e.grade, e.typeGroup].filter(
    Boolean,
  );
  return parts.length ? parts.join(" · ") : null;
}

/**
 * 예문에서 대상 어절을 빈칸으로 — 못 찾으면 null.
 *
 * 두 가지가 중요하다(적대검수 2026-08-04):
 *  · **모든 등장을 지운다**(g 플래그). 첫 개만 지우면 "Time flies… on time" 같은
 *    문장에서 두 번째 등장이 그대로 남아 정답이 보인다.
 *  · **\b 대신 룩어라운드**를 쓴다. \b 는 "give up." 처럼 구두점이 붙은 다단어
 *    surface 나 하이픈 포함 표제어에서 어긋난다. (?<!\w)…(?!\w) 는 구두점 경계를
 *    정확히 잡는다.
 * 대소문자는 무시하되(문장 첫 글자 대문자), 그 때문에 무관한 고유명사가 지워질
 * 위험은 단어 경계 검사가 막는다.
 */
export function blankOutSurface(sentence: string, surface: string): string | null {
  const target = surface.trim();
  if (!target) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "gi");
  if (!re.test(sentence)) return null;
  re.lastIndex = 0;
  return sentence.replace(re, "____");
}
