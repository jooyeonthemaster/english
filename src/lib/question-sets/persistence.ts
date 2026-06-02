// ============================================================================
// 장문 세트 — set-aware persistence helpers
// ============================================================================
// THE load-bearing leakage fix: a set member must NOT carry a baked passage
// copy. For non-structural members we strip passageWithBlank/Markers/Underline/
// Numbers from BOTH the stored questionText AND structuredData, and instead
// stash the re-derivable anchors in structuredData._spans. The shared passage is
// rendered once from QuestionSet.displayedPassageLayout + these anchors.
//
// Single-question persistence (buildGeneratedQuestionText / saveGeneratedQuestionsForJob)
// is intentionally untouched — only the set path uses these helpers.
// ============================================================================

import { buildGeneratedQuestionText } from "@/lib/question-generation-persistence";
import { extractAnchors } from "./anchor-extraction";
import type { Anchor } from "./types";

const BAKED_PASSAGE_FIELDS = [
  "passageWithBlank",
  "passageWithMarkers",
  "passageWithUnderline",
  "passageWithNumbers",
] as const;

/**
 * Remove the baked passage views from a question's structured data, preserving
 * every field reconstruction needs (markedExpressions, markedWords,
 * underlinedPronoun/Word/Expression, originalExpression, options, correctAnswer…).
 */
export function stripBakedPassage(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const field of BAKED_PASSAGE_FIELDS) delete out[field];
  return out;
}

export interface SetMemberPersistence {
  /** Direction + stem + options only — NEVER a passage copy (for non-structural). */
  questionText: string;
  /** Stripped structured data + _spans (anchors) + set markers. */
  structuredData: Record<string, unknown>;
  /** The re-derivable anchors stored first-class on QuestionSetItem.spans. */
  spans: Anchor[];
}

/**
 * Prepare a single set member for persistence.
 *
 * - Structural members (글의 순서 / 문장 삽입) DEFINE the displayed base and keep
 *   their own layout fields (paragraphs / passageWithNumbers); no anchors.
 * - Non-structural members get their baked passage stripped from questionText +
 *   structuredData, and their anchors extracted for render-time reconstruction.
 */
export function prepareSetMember(
  typeId: string,
  processedData: Record<string, unknown>,
  isStructural: boolean,
): SetMemberPersistence {
  if (isStructural) {
    return {
      questionText: buildGeneratedQuestionText(processedData),
      structuredData: {
        ...processedData,
        _setMember: true,
        _isStructural: true,
        _spans: [],
      },
      spans: [],
    };
  }

  const anchors = extractAnchors(typeId, processedData);
  const stripped = stripBakedPassage(processedData);

  return {
    // Build the stem from the STRIPPED data so buildGeneratedQuestionText cannot
    // re-emit any passageWith* line (those fields are gone).
    questionText: buildGeneratedQuestionText(stripped),
    structuredData: {
      ...stripped,
      _setMember: true,
      _isStructural: false,
      _spans: anchors,
    },
    spans: anchors,
  };
}

/** True when a stored question is a 장문 세트 member (renderers branch on this). */
export function isSetMemberData(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>)._setMember === true
  );
}

/** Read the stored anchors off a set member's structured data. */
export function readSetMemberSpans(data: unknown): Anchor[] {
  if (!data || typeof data !== "object") return [];
  const spans = (data as Record<string, unknown>)._spans;
  return Array.isArray(spans) ? (spans as Anchor[]) : [];
}
