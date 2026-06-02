// ============================================================================
// 장문 세트 — deterministic hint-leakage gate (pure, no AI, no I/O)
// ============================================================================
// Two layers:
//   1. validateSetComposition() — pre-generation, type-only hard gates (the
//      user-facing rule that decides which combinations are even allowed).
//   2. scanSetForLeakage() — post-resolution region/sentence scan over the
//      members' resolved spans against the displayed base passage.
//
// The leakage requirement is structural, not probabilistic: every rule here is
// set arithmetic over SpanKinds and character ranges. See
// docs/long-passage-set-architecture.md §6.
// ============================================================================

import { splitIntoSentences } from "@/lib/question-postprocess/sentence-splitter";
import {
  type SpanKind,
  type StructuralMode,
  isStructuralType,
  spanKindOf,
} from "./types";

// ── SpanKind co-occurrence ──────────────────────────────────────────────────
// Whether two kinds from DIFFERENT members, marking the SAME region, reveal each
// other's answer. Symmetric.
const EXCLUSIVE_KINDS: ReadonlySet<SpanKind> = new Set(["BLANK", "MARKER"]);

export function kindsLeak(a: SpanKind, b: SpanKind): boolean {
  // BLANK (_____) and MARKER (labeled span) advertise an answer locus, so they
  // leak against ANY co-occurring mark — they are "exclusive" kinds.
  if (EXCLUSIVE_KINDS.has(a) || EXCLUSIVE_KINDS.has(b)) return true;
  // A bare UNDERLINE carries no positional answer signal → safe beside any
  // non-exclusive kind (this is the 43~45 case: 지칭 underline + 글의 순서 blocks).
  if (a === "UNDERLINE" || b === "UNDERLINE") return false;
  // Both are structural marks (NUMBER / CIRCLED_LETTER / BLOCK / SENTENCE) →
  // two structural layouts cannot share one base.
  return true;
}

// ── Glyph families (in-passage / option label collisions) ───────────────────
export type GlyphFamily =
  | "CIRCLED_NUM"
  | "CIRCLED_LETTER"
  | "PAREN_ALPHA"
  | "OTHER";

export function labelGlyphFamily(label: string | undefined | null): GlyphFamily {
  const ch = (label ?? "").trim();
  if (!ch) return "OTHER";
  if (/[①-⑳]/.test(ch)) return "CIRCLED_NUM"; // ①–⑳
  if (/[ⓐ-ⓩ]/.test(ch)) return "CIRCLED_LETTER"; // ⓐ–ⓩ
  if (/^\([A-Ja-j]\)$/.test(ch)) return "PAREN_ALPHA"; // (A)–(J)
  return "OTHER";
}

// ── Composition validation (pre-generation, type-only) ──────────────────────
export interface CompositionMember {
  typeId: string;
}
export interface CompositionResult {
  ok: boolean;
  errors: string[];
  structuralType: string | null;
}

const STRUCTURAL_MODE_TYPE: Record<Exclude<StructuralMode, "NONE">, string> = {
  SENTENCE_ORDER: "SENTENCE_ORDER",
  SENTENCE_INSERT: "SENTENCE_INSERT",
};

/**
 * Decide whether a proposed set composition is allowed BEFORE any AI call.
 * Pure on the list of typeIds + the structural mode. Korean error strings are
 * safe to surface directly in the set-builder UI.
 */
export function validateSetComposition(
  members: CompositionMember[],
  structuralMode: StructuralMode = "NONE",
): CompositionResult {
  const errors: string[] = [];
  const structural = members.filter((m) => isStructuralType(m.typeId));
  const structuralType = structural[0]?.typeId ?? null;

  if (members.length === 0) {
    errors.push("세트에는 최소 1개의 문항이 필요합니다.");
  }

  // At most one structural member (글의 순서 / 문장 삽입 / 무관한 문장).
  if (structural.length > 1) {
    errors.push(
      "한 세트에는 구조 변형 유형(글의 순서·문장 삽입·무관한 문장)을 하나만 넣을 수 있습니다.",
    );
  }

  // IRRELEVANT injects a foreign sentence → it cannot host other members.
  if (members.some((m) => m.typeId === "IRRELEVANT") && members.length > 1) {
    errors.push("무관한 문장 유형은 다른 문항과 함께 묶을 수 없습니다(단독 출제).");
  }

  // structuralMode ↔ member consistency.
  if (structuralMode !== "NONE") {
    const required = STRUCTURAL_MODE_TYPE[structuralMode];
    if (!members.some((m) => m.typeId === required)) {
      errors.push(`구조 모드 '${structuralMode}'에 해당하는 문항이 세트에 없습니다.`);
    }
  } else {
    const ordering = structural.filter(
      (m) => m.typeId === "SENTENCE_ORDER" || m.typeId === "SENTENCE_INSERT",
    );
    if (ordering.length > 0) {
      errors.push(
        "구조 변형 유형(글의 순서·문장 삽입)은 구조 모드를 함께 지정해야 합니다.",
      );
    }
  }

  // BLANK / MARKER (빈칸·어법·어휘) monopolize the passage view: any other member
  // that displays the passage (clean or marked) would reveal their answer locus,
  // so they are solo-only in a shared-passage set. This is exactly why real CSAT
  // never combines 빈칸/어법 with other questions on one passage.
  if (members.length > 1) {
    const exclusive = members.filter((m) => {
      const k = spanKindOf(m.typeId);
      return k === "BLANK" || k === "MARKER";
    });
    if (exclusive.length > 0) {
      errors.push(
        `빈칸·어법·어휘 유형은 지문 표시를 독점하므로 다른 문항과 묶을 수 없습니다(단독 출제): ${exclusive
          .map((m) => m.typeId)
          .join(", ")}`,
      );
    }
  }

  return { ok: errors.length === 0, errors, structuralType };
}

// ── Post-resolution leakage scan ────────────────────────────────────────────
export interface ResolvedSpan {
  start: number;
  end: number;
  kind: SpanKind;
  label?: string;
}
export interface MemberSpanSet {
  index: number; // orderInSet
  typeId: string;
  isStructural: boolean;
  spans: ResolvedSpan[];
}
export interface LeakageConflict {
  a: number;
  b: number;
  severity: "ERROR" | "WARN";
  reason: string;
  kindPair: [SpanKind, SpanKind];
}
export interface LeakageReport {
  status: "OK" | "CONFLICT";
  conflicts: LeakageConflict[];
}

function rangesOverlap(a: ResolvedSpan, b: ResolvedSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

interface SentenceRange {
  start: number;
  end: number;
}
function computeSentenceRanges(base: string): SentenceRange[] {
  const sentences = splitIntoSentences(base);
  const ranges: SentenceRange[] = [];
  let cursor = 0;
  for (const s of sentences) {
    const idx = base.indexOf(s, cursor);
    if (idx === -1) continue;
    ranges.push({ start: idx, end: idx + s.length });
    cursor = idx + s.length;
  }
  return ranges;
}
function sentenceIndexOf(ranges: SentenceRange[], offset: number): number {
  return ranges.findIndex((r) => offset >= r.start && offset < r.end);
}

/**
 * Scan a fully-resolved set (each member's anchors already located as char
 * ranges in the displayed base) for residual leakage. A whole-sentence mark
 * (SENTENCE / CIRCLED_LETTER) must carry a range that spans the full sentence so
 * a sub-span inside it is caught by the overlap rule (sentence-containment).
 */
export function scanSetForLeakage(
  members: MemberSpanSet[],
  base: string,
): LeakageReport {
  const conflicts: LeakageConflict[] = [];
  const sentenceRanges = computeSentenceRanges(base);
  const seen = new Set<string>();
  const push = (c: LeakageConflict) => {
    const key = `${c.a}:${c.b}:${c.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    conflicts.push(c);
  };

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const mi = members[i];
      const mj = members[j];
      for (const s of mi.spans) {
        for (const t of mj.spans) {
          const overlap = rangesOverlap(s, t);

          // Two underlines on the same token cross-reveal which token is tested.
          if (s.kind === "UNDERLINE" && t.kind === "UNDERLINE") {
            if (overlap) {
              push({
                a: mi.index,
                b: mj.index,
                severity: "ERROR",
                reason: "두 밑줄 문항이 같은 표현을 가리킵니다.",
                kindPair: [s.kind, t.kind],
              });
            }
            continue;
          }

          if (!kindsLeak(s.kind, t.kind)) continue;

          if (overlap) {
            push({
              a: mi.index,
              b: mj.index,
              severity: "ERROR",
              reason: "두 문항의 지문 표시 영역이 겹칩니다.",
              kindPair: [s.kind, t.kind],
            });
            continue;
          }

          const si = sentenceIndexOf(sentenceRanges, s.start);
          const ti = sentenceIndexOf(sentenceRanges, t.start);
          if (si !== -1 && si === ti) {
            push({
              a: mi.index,
              b: mj.index,
              severity: "ERROR",
              reason: "같은 문장 안에서 두 문항의 표시가 서로 힌트가 됩니다.",
              kindPair: [s.kind, t.kind],
            });
          }
        }
      }
    }
  }

  return {
    status: conflicts.some((c) => c.severity === "ERROR") ? "CONFLICT" : "OK",
    conflicts,
  };
}
