// ============================================================================
// Enriched-draft types + CHOICE_LABELS constant. Extracted verbatim from
// segmentation.ts during mechanical split.
// ============================================================================

import type { ExtractionItemSnapshot } from "../types";

// ────────────────────────────────────────────────────────────────────────────
// Enriched-draft hydration — ExtractionItemSnapshot[] → UI model
// ────────────────────────────────────────────────────────────────────────────

export const CHOICE_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"] as const;
/** Literal union of the nine recognised choice glyphs — ①..⑨. */
export type ChoiceLabel = (typeof CHOICE_LABELS)[number];
/** Fallback format for out-of-range choice indices: "(10)", "(11)" … */
export type ChoiceLabelFallback = `(${number})`;
/** Union used wherever a choice label is surfaced — guarantees no plain
 *  `string` widening at module boundaries. */
export type ChoiceLabelLike = ChoiceLabel | ChoiceLabelFallback;

/** Passage-centric view built from ExtractionItemSnapshot[] for the review UI. */
export interface EnrichedDraft {
  /** ExtractionItem.id of the anchor PASSAGE_BODY block, or null when a
   *  group has questions but no explicit passage block (M2 fallback). */
  passageItemId: string | null;
  passageOrder: number;
  sourcePageIndex: number[];
  title: string;
  content: string;
  confidence: number | null;
  status: "DRAFT" | "REVIEWED" | "SAVED" | "SKIPPED";
  questions: Array<{
    questionItemId: string;
    questionNumber: number | null;
    stem: string;
    choices: Array<{
      itemId: string;
      /** Display glyph — narrowed to the `ChoiceLabel | ChoiceLabelFallback`
       *  union so consumers cannot accidentally receive widened `string`
       *  values from `buildChoiceLabel`. */
      label: ChoiceLabelLike;
      content: string;
      isAnswer: boolean;
    }>;
    explanation: string | null;
  }>;
  examMeta: Record<string, unknown> | null;
  meta: {
    markerDetected?: boolean;
    mergedFromPages?: number[];
    confidenceNote?: string;
  } | null;
}

export type PassageDraftStatus = EnrichedDraft["status"];

export interface GroupBucket {
  groupId: string;
  passages: ExtractionItemSnapshot[];
  stems: ExtractionItemSnapshot[];
  choicesByStemId: Map<string, ExtractionItemSnapshot[]>;
  explanationByStemId: Map<string, ExtractionItemSnapshot>;
  orphanChoices: ExtractionItemSnapshot[];
  orphanExplanation: ExtractionItemSnapshot | null;
  firstOrder: number;
}
