// ============================================================================
// 장문 세트 (Long-Passage Multi-Question Set) — shared types & classification
// ============================================================================
// One passage carries N ordered questions (generalizes CSAT 43~45). Hint-leakage
// between members is prevented by storing ONE clean shared passage + per-member
// re-derivable span ANCHORS, and reconstructing each mutated view at render time.
//
// This module is dependency-free on purpose (Phase 0): it defines the vocabulary
// every later phase (leakage gate, generator, renderer, exporter) compiles against.
// See docs/long-passage-set-architecture.md for the full design.
// ============================================================================

/** How a set's DISPLAYED base passage is structured. */
export type StructuralMode = "NONE" | "SENTENCE_ORDER" | "SENTENCE_INSERT";

/**
 * The kind of in-passage mark a member places. Drives the leakage co-occurrence
 * matrix. A member that does not mark the passage (source comprehension types like
 * 주제/제목/내용일치) has NO anchors and contributes no SpanKind.
 */
export type SpanKind =
  | "BLANK" //          _____ removed span      (BLANK_INFERENCE, FILL_BLANK_KEY)
  | "MARKER" //         __(A) expr__ labeled    (GRAMMAR_ERROR, VOCAB_CHOICE, ANTONYM)
  | "UNDERLINE" //      __word__ bare underline (REFERENCE, SYNONYM, IMPLIED_MEANING, CONTEXT_MEANING)
  | "NUMBER" //         ①–⑤ between sentences   (SENTENCE_INSERT — structural)
  | "CIRCLED_LETTER" // ⓐ–ⓔ whole sentences     (IRRELEVANT — structural, solo only)
  | "BLOCK" //          (A)(B)(C)(D) blocks     (SENTENCE_ORDER — structural)
  | "SENTENCE"; //      whole-sentence span     (cross-type containment checks)

/** How an anchor's span is located in the base — mirrors each processor's finder. */
export type AnchorFindStrategy =
  | "expression" //       findExpressionInPassage (BLANK_INFERENCE, FILL_BLANK_KEY, IMPLIED_MEANING)
  | "word" //             findWordInPassage (VOCAB_CHOICE, ANTONYM, CONTEXT_MEANING)
  | "wordStrict" //       findWordInPassage(strict) (REFERENCE)
  | "wordOrExpression" // findWord || findExpression (SYNONYM)
  | "grammar"; //         word if single-token else expression (GRAMMAR_ERROR)

/**
 * A re-derivable reference to a marked region in the DISPLAYED base passage.
 * NEVER an absolute char offset — offsets break on any passage edit. Resolution
 * uses `surroundingText` (≥30 chars, must be unique within the base) + an explicit
 * `occurrenceIndex` to pin which match when a token repeats.
 */
export interface Anchor {
  kind: SpanKind;
  /** Passage label such as "(A)", "②", "ⓐ". Omit for bare BLANK/UNDERLINE. */
  label?: string;
  /** The literal text to LOCATE in the base passage. */
  spanText: string;
  /**
   * The literal string to RENDER inside the mark when it differs from the located
   * passage text — e.g. GRAMMAR_ERROR shows the error form "ate" at the span where
   * the correct "eat" sits; VOCAB_CHOICE shows the substitute word. When omitted,
   * the located passage slice is shown (REFERENCE/SYNONYM/IMPLIED/CONTEXT).
   */
  passageForm?: string;
  /** ≥30-char window around the span; REQUIRED for BLANK/UNDERLINE/MARKER. */
  surroundingText?: string;
  /** How to locate the span (mirrors the per-type processor). */
  findStrategy?: AnchorFindStrategy;
  /** Secondary text to try when `spanText` is not found (GRAMMAR_ERROR correction). */
  fallbackText?: string;
  /** 0-based nth match selector — closes the silent indexOf(#1) ambiguity hole. */
  occurrenceIndex?: number;
  /** For SENTENCE_ORDER: which displayed block this anchor lives in. */
  blockIndex?: number;
}

/**
 * A shuffled paragraph block in a SENTENCE_ORDER set. Stores BOTH indices so the
 * displayed order (sort by `displayOrder`) and the canonical order (`canonicalIndex`)
 * are never ambiguous — boundary checks depend on this.
 */
export interface LayoutBlock {
  label: string; // "(A)" … "(D)" as printed
  text: string;
  canonicalIndex: number; // position in the true ordered story
  displayOrder: number; // position as shown to the student (shuffled)
}

/** An ①–⑤ insertion marker position in a SENTENCE_INSERT set. */
export interface MarkerPosition {
  marker: string; // "①" … "⑤"
  sentenceIndex: number;
  position: "after" | "before";
}

/**
 * The visible base passage for a set. `canonicalPassage` (on QuestionSet) is the
 * ordered source and is NEVER shown — this descriptor is what the student sees and
 * what every non-structural member's anchors resolve against.
 */
export interface LayoutDescriptor {
  type: StructuralMode;
  /** SENTENCE_ORDER: the given first sentence shown above the blocks. */
  givenSentence?: string;
  /** SENTENCE_ORDER: shuffled blocks (render in `displayOrder`). */
  blocks?: LayoutBlock[];
  /** SENTENCE_ORDER answer — SERVER-ONLY; strip before sending to the client. */
  correctOrder?: number[];
  /** SENTENCE_INSERT: ①–⑤ marker positions. */
  markerPositions?: MarkerPosition[];
  /** SENTENCE_INSERT / NONE: the rendered base text. */
  fullPassage?: string;
  /** sha256 of the canonicalized descriptor — the anchor-resolution gate. */
  fingerprintHash: string;
}

export type QuestionSetStatus = "OK" | "DEGRADED";

export interface SetMemberConfig {
  typeId: string;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER"; // per-item difficulty
  /** Per-type detail settings (어법 marker/answer count, 빈칸 부정-부정, etc.). */
  typeSettings?: Record<string, unknown>;
}

// ── Type → SpanKind classification ──────────────────────────────────────────
// `null` = the type places NO in-passage mark (source/passthrough comprehension:
// 주제·제목·요지·내용일치·요약 등). Only marking types contribute to the leakage matrix.
export const TYPE_TO_SPANKIND: Record<string, SpanKind | null> = {
  // BLANK
  BLANK_INFERENCE: "BLANK",
  FILL_BLANK_KEY: "BLANK",
  // MARKER (labeled spans)
  GRAMMAR_ERROR: "MARKER",
  VOCAB_CHOICE: "MARKER",
  ANTONYM: "MARKER",
  // UNDERLINE (bare)
  REFERENCE: "UNDERLINE",
  IMPLIED_MEANING: "UNDERLINE",
  CONTEXT_MEANING: "UNDERLINE",
  SYNONYM: "UNDERLINE",
  // STRUCTURAL
  SENTENCE_ORDER: "BLOCK",
  SENTENCE_INSERT: "NUMBER",
  IRRELEVANT: "CIRCLED_LETTER",
  // SOURCE / PASSTHROUGH comprehension — no in-passage mark
  TOPIC: null,
  MAIN_IDEA: null,
  TOPIC_MAIN_IDEA: null,
  TITLE: null,
  CONTENT_MATCH: null,
  SUMMARY_COMPLETE_MC: null,
  SUMMARY_COMPLETE: null,
  CONDITIONAL_WRITING: null,
  SENTENCE_TRANSFORM: null,
  WORD_ORDER: null,
  GRAMMAR_CORRECTION: null,
};

/** Types that DEFINE a set's displayed base passage (one per set). */
export const STRUCTURAL_TYPES: ReadonlySet<string> = new Set([
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT", // solo-only — injects a foreign sentence; cannot host other members
]);

/** Inline-mark types whose view is reconstructed from anchors at render time (9). */
export const RECONSTRUCTABLE_TYPES: ReadonlySet<string> = new Set([
  "BLANK_INFERENCE",
  "FILL_BLANK_KEY",
  "GRAMMAR_ERROR",
  "VOCAB_CHOICE",
  "ANTONYM",
  "REFERENCE",
  "IMPLIED_MEANING",
  "CONTEXT_MEANING",
  "SYNONYM",
]);

/** Bare-underline types — freely combine within a set (carry no positional signal). */
export const UNDERLINE_TYPES: ReadonlySet<string> = new Set([
  "REFERENCE",
  "IMPLIED_MEANING",
  "CONTEXT_MEANING",
  "SYNONYM",
]);

/** Labeled-marker types — at most ONE marking member per set. */
export const MARKER_TYPES: ReadonlySet<string> = new Set([
  "GRAMMAR_ERROR",
  "VOCAB_CHOICE",
  "ANTONYM",
]);

/** Blank types — exclusive; at most ONE marking member per set. */
export const BLANK_TYPES: ReadonlySet<string> = new Set([
  "BLANK_INFERENCE",
  "FILL_BLANK_KEY",
]);

/** Source comprehension types — no passage mutation; always leakage-safe to add. */
export const SOURCE_COMPREHENSION_TYPES: ReadonlySet<string> = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
]);

export function spanKindOf(typeId: string): SpanKind | null {
  return TYPE_TO_SPANKIND[typeId] ?? null;
}

export function isStructuralType(typeId: string): boolean {
  return STRUCTURAL_TYPES.has(typeId);
}

export function isReconstructableType(typeId: string): boolean {
  return RECONSTRUCTABLE_TYPES.has(typeId);
}
