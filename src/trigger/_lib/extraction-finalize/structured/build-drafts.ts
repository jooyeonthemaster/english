import type { ExtractionItem as ExtractionItemRow } from "@prisma/client";
import type { StructuredBlockDraft } from "@/lib/extraction/segmentation";
import type { BlockType } from "@/lib/extraction/types";

export interface BuildDraftsResult {
  drafts: StructuredBlockDraft[];
  localIdToDbId: Map<string, string>;
}

/**
 * Rebuild StructuredBlockDraft[] from the DB rows, with deterministic
 * per-page order.
 *
 * The page worker stored each block with `order = pageIndex * 1000 + i`,
 * so for each page we re-derive `order` as the 0-based index within the
 * page — which is what `assignGroupIds()` expects (and what `localIdFor()`
 * uses to build parentLocalId = "pageIndex:order").
 *
 * (P1-2) Reads ONLY canonical meta shapes: `questionMeta = { number }`,
 * `choiceMeta = { index, label, isAnswer }`. Legacy `questionNumber` /
 * `choiceIndex` are rejected (returns null) so write-side drift surfaces
 * instead of being masked.
 */
export function buildStructuredDraftsFromItems(
  items: ExtractionItemRow[],
): BuildDraftsResult {
  const byPage = new Map<number, ExtractionItemRow[]>();
  for (const item of items) {
    const pIdx = item.sourcePageIndex[0] ?? 0;
    const arr = byPage.get(pIdx);
    if (arr) arr.push(item);
    else byPage.set(pIdx, [item]);
  }
  // Stable sort within each page by original DB `order`, so the per-page
  // index matches the sequence the worker inserted them in.
  for (const [, arr] of byPage) {
    arr.sort((a, b) => a.order - b.order);
  }

  const drafts: StructuredBlockDraft[] = [];
  const localIdToDbId = new Map<string, string>();
  const sortedPageIndexes = [...byPage.keys()].sort((a, b) => a - b);
  for (const pageIndex of sortedPageIndexes) {
    const pageItems = byPage.get(pageIndex) ?? [];
    pageItems.forEach((item, perPageOrder) => {
      const questionMeta = item.questionMeta as
        | { number?: unknown }
        | null;
      const choiceMeta = item.choiceMeta as
        | { index?: unknown; isAnswer?: unknown }
        | null;

      const questionNumber =
        typeof questionMeta?.number === "number"
          ? (questionMeta.number as number)
          : null;
      const choiceIndex =
        typeof choiceMeta?.index === "number"
          ? (choiceMeta.index as number)
          : null;
      const isAnswer =
        typeof choiceMeta?.isAnswer === "boolean"
          ? (choiceMeta.isAnswer as boolean)
          : null;

      const examMeta =
        item.examMeta && typeof item.examMeta === "object"
          ? (item.examMeta as Record<string, unknown>)
          : null;

      drafts.push({
        pageIndex,
        blockType: item.blockType as BlockType,
        content: item.content,
        rawText: item.rawText ?? item.content,
        confidence: item.confidence,
        questionNumber,
        choiceIndex,
        isAnswer,
        examMeta,
        order: perPageOrder,
      });
      localIdToDbId.set(`${pageIndex}:${perPageOrder}`, item.id);
    });
  }
  return { drafts, localIdToDbId };
}
