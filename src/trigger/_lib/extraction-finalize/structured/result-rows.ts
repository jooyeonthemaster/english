import type { Prisma } from "@prisma/client";
import {
  buildEnrichedDrafts,
  segmentPages,
} from "@/lib/extraction/segmentation";
import type {
  ExtractionItemSnapshot,
  ExtractionMode,
} from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import type { ClusteredWithGlobalOrder } from "./snapshot";

export interface ResultRowsResult {
  /** Enriched drafts returned by `buildEnrichedDrafts` — always populated. */
  enriched: ReturnType<typeof buildEnrichedDrafts>;
  /** True when PASSAGE_ONLY mode produced 0 enriched drafts and we should
   *  fall back to the legacy regex segmenter over `extractedText`. */
  useLegacyFallback: boolean;
  /** Filtered enriched drafts used to build ExtractionResult rows in
   *  PASSAGE_ONLY mode (drops empty drafts unless they carry choices /
   *  explanations). For non-PASSAGE_ONLY modes this equals `enriched`. */
  structuredDraftsForResults: ReturnType<typeof buildEnrichedDrafts>;
  /** Legacy segmenter output when `useLegacyFallback === true`. */
  legacyFallbackDrafts: ReturnType<typeof segmentPages>;
  /** ExtractionResult rows ready for `createMany`. */
  resultRows: Prisma.ExtractionResultCreateManyInput[];
  /** Prisma update ops for `ExtractionItem` rows — groupId / parentItemId /
   *  global order assignments. Caller batches these into the persist
   *  transaction. */
  itemUpdateOps: Prisma.PrismaPromise<unknown>[];
}

export function buildResultRows(params: {
  jobId: string;
  mode: ExtractionMode;
  pages: Array<{
    pageIndex: number;
    status: string;
    extractedText: string | null;
    confidence: number | null;
  }>;
  snapshotItems: ExtractionItemSnapshot[];
  withGlobalOrder: ClusteredWithGlobalOrder[];
  localIdToDbId: Map<string, string>;
}): ResultRowsResult {
  const { jobId, mode, pages, snapshotItems, withGlobalOrder, localIdToDbId } =
    params;

  const enriched = buildEnrichedDrafts(snapshotItems);
  const structuredPassageCount = snapshotItems.filter(
    (item) => item.blockType === "PASSAGE_BODY",
  ).length;
  const useLegacyFallback =
    mode === "PASSAGE_ONLY" &&
    (structuredPassageCount === 0 ||
      enriched.every((draft) => draft.content.trim().length === 0));
  const legacyFallbackDrafts = useLegacyFallback
    ? segmentPages(
        [...pages]
          .filter((p) => p.status === "SUCCESS" && p.extractedText)
          .sort((a, b) => a.pageIndex - b.pageIndex)
          .map((p) => ({
            pageIndex: p.pageIndex,
            text: p.extractedText ?? "",
            confidence: p.confidence,
          })),
      )
    : [];
  const structuredDraftsForResults =
    mode === "PASSAGE_ONLY"
      ? enriched.filter((draft) => {
          if (draft.content.trim().length > 0) return true;
          return draft.questions.some(
            (q) => q.choices.length > 0 || q.explanation !== null,
          );
        })
      : enriched;

  const itemUpdateOps = withGlobalOrder.flatMap((c) => {
    const localId = `${c.pageIndex}:${c.order}`;
    const dbId = localIdToDbId.get(localId);
    if (!dbId) return [];
    const parentDbId = c.parentLocalId
      ? localIdToDbId.get(c.parentLocalId) ?? null
      : null;
    return [
      prisma.extractionItem.update({
        where: { id: dbId },
        data: {
          groupId: c.groupId,
          parentItemId: parentDbId,
          order: c.globalOrder,
        },
      }),
    ];
  });

  const resultRows: Prisma.ExtractionResultCreateManyInput[] = useLegacyFallback
    ? legacyFallbackDrafts.map((d) => ({
        jobId,
        passageOrder: d.passageOrder,
        sourcePageIndex: d.sourcePageIndex,
        title: d.title,
        content: d.content,
        meta: {
          ...(d.meta ?? {}),
          structuredFallback: true,
        } as Prisma.InputJsonValue,
        confidence: d.confidence,
        status: "DRAFT",
      }))
    : structuredDraftsForResults.map((d, index) => {
        const resultMeta = {
          ...(d.meta ?? {}),
          groupId: d.passageItemId ?? null,
          questions: d.questions.map((q) => ({
            questionItemId: q.questionItemId,
            questionNumber: q.questionNumber,
            stem: q.stem,
            choices: q.choices.map((c) => ({
              itemId: c.itemId,
              label: c.label,
              content: c.content,
              isAnswer: c.isAnswer,
            })),
            explanation: q.explanation,
          })),
          examMeta: d.examMeta ?? null,
        } satisfies Record<string, unknown>;

        return {
          jobId,
          passageOrder: index,
          sourcePageIndex: d.sourcePageIndex,
          title: d.title,
          content: d.content,
          meta: resultMeta as Prisma.InputJsonValue,
          confidence: d.confidence,
          status: "DRAFT",
        };
      });

  return {
    enriched,
    useLegacyFallback,
    structuredDraftsForResults,
    legacyFallbackDrafts,
    resultRows,
    itemUpdateOps,
  };
}
