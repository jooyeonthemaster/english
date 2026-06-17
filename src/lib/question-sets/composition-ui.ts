// ============================================================================
// 장문 세트 — composition UX logic (pure)
// ============================================================================
// Drives the set-builder so a teacher can ONLY ever build a valid set: at every
// step it computes which types are addable and WHY a type is not, and derives the
// structural mode automatically from the members (no separate control). This is
// the "calculate every case" layer the deterministic gate enforces server-side.
// ============================================================================

import type { StructuralMode } from "./types";

/** Types that monopolize the passage display → only valid as a solo set. */
export const SOLO_ONLY_TYPES: ReadonlySet<string> = new Set([
  "BLANK_INFERENCE",
  "FILL_BLANK_KEY",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "ANTONYM",
  "IRRELEVANT",
]);

/** Structural types that DEFINE the displayed base passage (at most one per set). */
export const STRUCTURAL_BASE_TYPES: ReadonlySet<string> = new Set([
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
]);

export interface Addability {
  ok: boolean;
  reason?: string;
}

/**
 * Can `typeId` be ADDED to a set that currently holds `members` (type ids)?
 * Encodes the full case table so the builder never offers an invalid choice.
 */
export function getAddability(typeId: string, members: string[]): Addability {
  // A solo-only member already present locks the whole set.
  if (members.some((t) => SOLO_ONLY_TYPES.has(t))) {
    return { ok: false, reason: "단독 출제 유형이 있어 더 추가할 수 없습니다" };
  }

  // Solo-only types can only start an (otherwise empty) solo set.
  if (SOLO_ONLY_TYPES.has(typeId)) {
    return members.length === 0
      ? { ok: true }
      : { ok: false, reason: "단독 출제 전용 — 다른 문항과 묶을 수 없습니다" };
  }

  // At most one structural (base-defining) member.
  if (
    STRUCTURAL_BASE_TYPES.has(typeId) &&
    members.some((t) => STRUCTURAL_BASE_TYPES.has(t))
  ) {
    return { ok: false, reason: "구조 유형(기준 지문)은 하나만 넣을 수 있습니다" };
  }

  return { ok: true };
}

/** Structural mode is INFERRED from the members — never picked separately. */
export function deriveStructuralMode(members: string[]): StructuralMode {
  if (members.includes("SENTENCE_ORDER")) return "SENTENCE_ORDER";
  if (members.includes("SENTENCE_INSERT")) return "SENTENCE_INSERT";
  return "NONE";
}

/** True when the current set can take no more members (solo-locked). */
export function isSetLocked(members: string[]): boolean {
  return members.some((t) => SOLO_ONLY_TYPES.has(t));
}
