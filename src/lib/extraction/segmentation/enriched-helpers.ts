// ============================================================================
// Enriched-draft helpers — status/field coercion, label building, aggregation.
// Extracted verbatim from segmentation.ts during mechanical split.
// ============================================================================

import type { ExtractionItemSnapshot } from "../types";
import {
  CHOICE_LABELS,
  type ChoiceLabelFallback,
  type ChoiceLabelLike,
  type GroupBucket,
  type PassageDraftStatus,
} from "./enriched-types";

export function mapItemStatusToDraftStatus(
  status: ExtractionItemSnapshot["status"],
): PassageDraftStatus {
  switch (status) {
    case "REVIEWED":
      return "REVIEWED";
    case "PROMOTED":
      return "SAVED";
    case "SKIPPED":
      return "SKIPPED";
    case "MERGED":
    case "DRAFT":
    default:
      return "DRAFT";
  }
}

export function coerceQuestionNumber(item: ExtractionItemSnapshot): number | null {
  const meta = item.questionMeta;
  if (meta && typeof meta === "object") {
    const raw = (meta as Record<string, unknown>).questionNumber;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function coerceChoiceIndex(item: ExtractionItemSnapshot): number | null {
  const meta = item.choiceMeta;
  if (meta && typeof meta === "object") {
    const raw = (meta as Record<string, unknown>).choiceIndex;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Robust truthy coercion for the `choiceMeta.isAnswer` flag.
 *
 * Upstream OCR / LLM pipelines have been observed to emit every variant of
 * "yes" — booleans, numbers, and stringified versions of both — so we accept
 * a wider surface than strict `=== true`. Only values that *unambiguously*
 * mean "this is the correct choice" are accepted; everything else (including
 * undefined / null / empty string / 0 / "false") returns `false`.
 *
 * Accepted truthy variants:
 *   - boolean `true`, number `1`
 *   - English strings: "true" / "1" / "yes" / "y" / "o" (case-insensitive)
 *   - Korean strings: "예" / "정답" / "참"
 *   - Glyph/mark variants: "✓" / "✔" / "○" / "◯"
 * Everything else — including "false" / "no" / "x" / "오답" / "아니오" — is
 * rejected.
 */
const TRUTHY_IS_ANSWER_TOKENS: ReadonlySet<string> = new Set<string>([
  "true",
  "1",
  "yes",
  "y",
  "o",
  "예",
  "정답",
  "참",
  "\u2713", // ✓
  "\u2714", // ✔
  "\u25CB", // ○
  "\u25EF", // ◯
]);

export function coerceIsAnswer(item: ExtractionItemSnapshot): boolean {
  const meta = item.choiceMeta;
  if (!meta || typeof meta !== "object") return false;
  const raw = (meta as Record<string, unknown>).isAnswer;
  if (raw === true) return true;
  if (raw === 1) return true;
  if (typeof raw === "string") {
    const normalised = raw.trim().toLowerCase();
    if (normalised.length === 0) return false;
    if (TRUTHY_IS_ANSWER_TOKENS.has(normalised)) return true;
  }
  return false;
}

/**
 * Map a 1-based choice index (or null) to its display glyph.
 * Return type is the `ChoiceLabel` union for in-range indices and a
 * `(n)` fallback for out-of-range — callers get stronger typing than the
 * previous `string` return without any runtime behaviour change.
 */
export function buildChoiceLabel(
  index: number | null,
  fallbackOrder: number,
): ChoiceLabelLike {
  const idx = index ?? fallbackOrder + 1;
  if (idx >= 1 && idx <= CHOICE_LABELS.length) {
    return CHOICE_LABELS[idx - 1];
  }
  return `(${idx})` as ChoiceLabelFallback;
}

/**
 * Coerce an arbitrary string label (e.g. one pulled from persisted
 * `choiceMeta.label`) back into the narrow `ChoiceLabelLike` union.
 *
 * Strategy:
 *   - If the value is already one of the canonical glyphs ①..⑨, return it.
 *   - Otherwise try to parse an integer out of it (handles "1", "(3)" …)
 *     and delegate to `buildChoiceLabel` with the supplied fallback order.
 *   - When nothing parses, fall back to the ordinal glyph at `fallbackOrder`.
 *
 * This keeps the `EnrichedDraft.questions[].choices[].label` type tight
 * without forcing every consumer to hand-roll a widening guard.
 */
export function normaliseChoiceLabel(
  raw: string | null | undefined,
  fallbackOrder: number,
): ChoiceLabelLike {
  if (typeof raw === "string" && raw.length > 0) {
    const glyphHit = (CHOICE_LABELS as readonly string[]).indexOf(raw.trim());
    if (glyphHit >= 0) return CHOICE_LABELS[glyphHit];
    const parsed = Number(raw.replace(/[^0-9]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return buildChoiceLabel(parsed, fallbackOrder);
    }
  }
  return buildChoiceLabel(null, fallbackOrder);
}

export function uniqueSortedPages(pages: number[]): number[] {
  return Array.from(new Set(pages)).sort((a, b) => a - b);
}

export function averageConfidence(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

export function newBucket(groupId: string, firstOrder: number): GroupBucket {
  return {
    groupId,
    passage: null,
    stems: [],
    choicesByStemId: new Map(),
    explanationByStemId: new Map(),
    orphanChoices: [],
    orphanExplanation: null,
    firstOrder,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXAM_META orphan finalisation — absorbed into buildEnrichedDrafts verbatim.
// Extracted from segmentation.ts during the mechanical split.
// ────────────────────────────────────────────────────────────────────────────

export function applyOrphanExamMeta(
  drafts: import("./enriched-types").EnrichedDraft[],
  orphanExamMeta: ExtractionItemSnapshot[],
): void {
  // EXAM_META → absorb into the first draft's examMeta field. P0-4 FIX:
  // when no drafts exist but EXAM_META was detected, emit a placeholder
  // draft so the metadata is not silently dropped.
  if (orphanExamMeta.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const metaItem of orphanExamMeta) {
      if (metaItem.examMeta && typeof metaItem.examMeta === "object") {
        Object.assign(merged, metaItem.examMeta as Record<string, unknown>);
      }
      if (metaItem.content) {
        const prev = merged.rawContents;
        const existingRaw = Array.isArray(prev) ? prev : [];
        merged.rawContents = [...existingRaw, metaItem.content];
      }
    }

    if (drafts.length > 0) {
      drafts[0] = { ...drafts[0], examMeta: merged };
    } else {
      const metaPages = uniqueSortedPages(
        orphanExamMeta.flatMap((m) => m.sourcePageIndex ?? []),
      );
      drafts.push({
        passageItemId: null,
        passageOrder: 0,
        sourcePageIndex: metaPages,
        title: "(메타데이터만 추출됨)",
        content: "",
        confidence: averageConfidence(orphanExamMeta.map((m) => m.confidence)),
        status: "DRAFT",
        questions: [],
        examMeta: merged,
        meta: {
          markerDetected: false,
          mergedFromPages: metaPages.length > 1 ? metaPages : undefined,
          confidenceNote:
            "시험 메타데이터만 감지되었습니다. 지문·문항을 추가로 업로드하거나 수동 입력하세요.",
        },
      });
    }
  }
}
