import type { ExtractionItem as ExtractionItemRow } from "@prisma/client";
import type { StructuredBlockDraft } from "@/lib/extraction/segmentation";
import type {
  ExtractionItemSnapshot,
  ExtractionItemStatus,
} from "@/lib/extraction/types";

export interface ClusteredWithGlobalOrder extends StructuredBlockDraft {
  groupId: string | null;
  parentLocalId: string | null;
  globalOrder: number;
}

/**
 * Build ExtractionItemSnapshot[] for buildEnrichedDrafts (needs resolved
 * parentItemId and groupId). Each snapshot carries the canonical worker meta
 * shape — `questionMeta = { number }`, `choiceMeta = { index, isAnswer }` —
 * and the original DB row's promotedTo / status / passageMeta so downstream
 * processing has full context.
 */
export function buildSnapshotItems(
  withGlobalOrder: ClusteredWithGlobalOrder[],
  items: ExtractionItemRow[],
  localIdToDbId: Map<string, string>,
  jobId: string,
): ExtractionItemSnapshot[] {
  return withGlobalOrder.map((c, idx) => {
    const localId = `${c.pageIndex}:${c.order}`;
    const dbId = localIdToDbId.get(localId);
    const parentDbId = c.parentLocalId
      ? localIdToDbId.get(c.parentLocalId) ?? null
      : null;
    const originalItem = items.find((it) => it.id === dbId);
    const originalQuestionMeta =
      originalItem?.questionMeta &&
      typeof originalItem.questionMeta === "object"
        ? (originalItem.questionMeta as Record<string, unknown>)
        : null;
    const originalChoiceMeta =
      originalItem?.choiceMeta &&
      typeof originalItem.choiceMeta === "object"
        ? (originalItem.choiceMeta as Record<string, unknown>)
        : null;
    const originalPassageMeta =
      originalItem?.passageMeta &&
      typeof originalItem.passageMeta === "object"
        ? (originalItem.passageMeta as Record<string, unknown>)
        : null;
    return {
      id: dbId ?? `synthetic-${idx}`,
      jobId,
      pageId: originalItem?.pageId ?? null,
      sourcePageIndex: [c.pageIndex],
      blockType: c.blockType,
      groupId: c.groupId,
      parentItemId: parentDbId,
      order: idx,
      localOrder: null,
      title: originalItem?.title ?? null,
      content: c.content,
      rawText: c.rawText,
      // (P1-2) Round-trip the worker's canonical meta shape:
      // questionMeta = { number }, choiceMeta = { index, isAnswer }.
      // Anything else (legacy `questionNumber`, `choiceIndex`) is rejected
      // at read time above and therefore never reaches this point.
      questionMeta:
        c.questionNumber !== null || originalQuestionMeta
          ? {
              ...(originalQuestionMeta ?? {}),
              ...(c.questionNumber !== null
                ? { number: c.questionNumber }
                : {}),
            }
          : null,
      choiceMeta:
        c.choiceIndex !== null || c.isAnswer !== null || originalChoiceMeta
          ? {
              ...(originalChoiceMeta ?? {}),
              index: c.choiceIndex,
              isAnswer: c.isAnswer === true,
            }
          : null,
      passageMeta:
        c.blockType === "PASSAGE_BODY"
          ? {
              ...(originalPassageMeta ?? {}),
              wordCount: c.content.split(/\s+/).filter(Boolean).length,
            }
          : null,
      examMeta: c.examMeta as Record<string, unknown> | null,
      boundingBox: null,
      confidence: c.confidence,
      needsReview:
        typeof c.confidence === "number" ? c.confidence < 0.7 : false,
      status: (originalItem?.status as ExtractionItemStatus) ?? "DRAFT",
      promotedTo: originalItem?.promotedTo ?? null,
    };
  });
}
