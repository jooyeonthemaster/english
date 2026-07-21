// ============================================================================
// 어법 드릴 — 취약·미복습 개념 선정기 (플레인 모듈, 클라이언트 공유 가능)
//
// 3곳에 분산된 취약 선정 로직(grammar-tab.tsx collectWeakConcepts ·
// grammar-analysis.tsx collectStaleConcepts · grammar-drill-admin/students.ts
// weakest)을 이 파일로 수렴한다(v3 design §D2-4). 반환 계약(WeakConceptEntry)은
// 세 호출부 산출의 구조적 상위집합 — 호출부 교체는 각 소유 트랙(A-2 등)이 한다.
//
// 대체 레시피(동작 보존):
//  - collectWeakConcepts(detail)  → selectWeakConcepts(detail.grid, { cutoff: null, top: 3 })
//  - collectStaleConcepts(detail) → selectStaleConcepts(detail.grid)
//  - weakest(students.ts)         → selectWeakConcepts(rows, { cutoff: null, top: 1 })[0] ?? null
//    (rows = mastery 행을 { conceptId, score: masteryScore, attempts, correct } 로 사상)
// ============================================================================

import { CONCEPT_SKELETON_BY_ID } from "./curriculum";

// ── 판정 상수 (D6 워딩 사전과 동기) ─────────────────────────────────────────

/** 「보충 필요」 컷오프 — 숙달도 60 미만 */
export const WEAK_SCORE = 60;
/** 판정 표본 하한 — 시도 3회 미만은 유보 */
export const MIN_ATTEMPTS = 3;
/** 「복습 대상」 경과일 — 숙달 후 21일 초과 미복습 */
export const STALE_DAYS = 21;

// ── 입출력 계약 ──────────────────────────────────────────────────────────────

/**
 * 선정기 입력 원소 — GrammarLabStudentDetail.grid 의 개념 행과
 * grammarDrillMastery 행(score ← masteryScore 사상) 양쪽이 구조적으로 만족한다.
 */
export interface ConceptMasteryLike {
  conceptId: string;
  /** 없으면 커리큘럼 카탈로그로 해석 */
  title?: string | null;
  /** 숙달도 0~100 — 반올림 전 원값 허용(정렬은 원값, 출력은 반올림) */
  score: number;
  attempts: number;
  correct?: number;
  lastAttemptAt?: string | null;
}

/** grid(유닛별 concepts 배열) 또는 개념 평면 배열 양쪽 수용 */
export type ConceptMasterySource =
  | readonly ConceptMasteryLike[]
  | readonly { concepts: readonly ConceptMasteryLike[] }[];

/** 선정 결과 — WeakConceptPreset·weakest 행·stale 행 전부의 구조적 상위집합 */
export interface WeakConceptEntry {
  conceptId: string;
  title: string;
  /** 반올림 숙달도(0~100) */
  score: number;
  attempts: number;
  correct: number;
  /** attempts - correct — WeakSpot.evidence 배선용 */
  wrong: number;
  lastAttemptAt: string | null;
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function flattenSource(source: ConceptMasterySource): readonly ConceptMasteryLike[] {
  const first = source[0];
  if (first && "concepts" in first) {
    return (source as readonly { concepts: readonly ConceptMasteryLike[] }[]).flatMap(
      (unit) => unit.concepts,
    );
  }
  return source as readonly ConceptMasteryLike[];
}

function toEntry(c: ConceptMasteryLike): WeakConceptEntry {
  const correct = c.correct ?? 0;
  return {
    conceptId: c.conceptId,
    title: c.title ?? CONCEPT_SKELETON_BY_ID.get(c.conceptId)?.title ?? c.conceptId,
    score: Math.round(c.score),
    attempts: c.attempts,
    correct,
    wrong: Math.max(0, c.attempts - correct),
    lastAttemptAt: c.lastAttemptAt ?? null,
  };
}

// ── 선정기 ───────────────────────────────────────────────────────────────────

export interface SelectWeakOptions {
  /** 판정 표본 하한(기본 MIN_ATTEMPTS) */
  minAttempts?: number;
  /**
   * 숙달도 컷오프 — 반올림 점수가 이 값 미만이어야 선정(기본 WEAK_SCORE).
   * null = 컷오프 해제(점수 무관 하위 top 개) — 구 collectWeakConcepts·weakest 동작.
   */
  cutoff?: number | null;
  /** 상위 N개 절단 — 미지정 시 전량 */
  top?: number;
}

/**
 * 보충 필요 개념 선정 — 숙달도 오름차순(동점은 입력 순서 유지, 안정 정렬).
 * 정렬은 반올림 전 원값 기준이라 mastery 원행(float) 입력 시 weakest 와 동순서다.
 */
export function selectWeakConcepts(
  source: ConceptMasterySource,
  options: SelectWeakOptions = {},
): WeakConceptEntry[] {
  const { minAttempts = MIN_ATTEMPTS, cutoff = WEAK_SCORE, top } = options;
  const rows = flattenSource(source)
    .filter((c) => c.attempts >= minAttempts)
    .filter((c) => cutoff === null || Math.round(c.score) < cutoff)
    .sort((a, b) => a.score - b.score);
  const picked = typeof top === "number" ? rows.slice(0, top) : rows;
  return picked.map(toEntry);
}

export interface SelectStaleOptions {
  /** 미복습 경과일 초과 기준(기본 STALE_DAYS) */
  staleDays?: number;
  /** 숙달 판정 하한 — 이 점수 이상만 복습 대상(기본 WEAK_SCORE) */
  minScore?: number;
  /** 기준 시각 epoch ms — 테스트 주입용(기본 Date.now()) */
  now?: number;
}

/**
 * 복습 대상 개념 선정 — 숙달됐지만 장기 미복습(구 collectStaleConcepts 동일 판정:
 * attempts > 0 · score >= 60 · 경과일 > 21). 입력 순서(grid 순) 유지, 정렬 없음.
 */
export function selectStaleConcepts(
  source: ConceptMasterySource,
  options: SelectStaleOptions = {},
): WeakConceptEntry[] {
  const { staleDays = STALE_DAYS, minScore = WEAK_SCORE, now = Date.now() } = options;
  return flattenSource(source)
    .filter((c) => {
      if (c.attempts <= 0 || Math.round(c.score) < minScore) return false;
      if (!c.lastAttemptAt) return false;
      const days = Math.floor((now - new Date(c.lastAttemptAt).getTime()) / 86_400_000);
      return days > staleDays;
    })
    .map(toEntry);
}
