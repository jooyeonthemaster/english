// ============================================================================
// STRUCTURED pipeline — shared types + `flattenStructuredResponses`.
// Extracted verbatim from segmentation.ts during mechanical split.
// ============================================================================

import type { BlockType } from "../types";
import type { StructuredOcrResponse } from "../ocr-prompt";

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — STRUCTURED per-block pipeline (M2 / M4 and beyond)
// ════════════════════════════════════════════════════════════════════════════

/** Block types that are allowed to own a groupId (anchor or child). */
export const GROUP_RELEVANT: ReadonlySet<BlockType> = new Set<BlockType>([
  "PASSAGE_BODY",
  "QUESTION_STEM",
  "CHOICE",
  "EXPLANATION",
]);

/**
 * Page-level structured OCR response → ExtractionItem-ready draft rows.
 * `jobId` and per-item `id` are NOT set here — the caller (server worker) is
 * responsible for those. `order` is monotonic within a page (0-based).
 */
export interface StructuredBlockDraft {
  pageIndex: number;
  blockType: BlockType;
  content: string;
  rawText: string;
  confidence: number | null;
  questionNumber: number | null;
  choiceIndex: number | null;
  isAnswer: boolean | null;
  examMeta: Record<string, unknown> | null;
  order: number; // within page
}

/**
 * Flatten an ordered list of `{ pageIndex, response }` tuples into a single
 * StructuredBlockDraft[]. Ordering is preserved:
 *   - outer sort by pageIndex ascending
 *   - inner order by the blocks[] array index as returned by the model
 */
export function flattenStructuredResponses(
  responses: Array<{ pageIndex: number; response: StructuredOcrResponse }>,
): StructuredBlockDraft[] {
  const sorted = [...responses].sort((a, b) => a.pageIndex - b.pageIndex);
  const out: StructuredBlockDraft[] = [];

  for (const { pageIndex, response } of sorted) {
    const blocks = response?.blocks ?? [];
    const pageMeta = response?.pageMeta ?? null;

    blocks.forEach((block, index) => {
      const examMeta: Record<string, unknown> | null =
        block.blockType === "EXAM_META"
          ? {
              ...(pageMeta ? { pageMeta } : {}),
              rawContent: block.content,
            }
          : null;

      out.push({
        pageIndex,
        blockType: block.blockType,
        content: block.content ?? "",
        rawText: block.content ?? "",
        confidence: block.confidence ?? null,
        questionNumber: block.questionNumber ?? null,
        choiceIndex: block.choiceIndex ?? null,
        isAnswer: block.isAnswer ?? null,
        examMeta,
        order: index,
      });
    });
  }

  return out;
}
