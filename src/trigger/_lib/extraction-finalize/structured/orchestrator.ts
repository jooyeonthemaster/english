import { logger } from "@trigger.dev/sdk/v3";
import type { ExtractionItem as ExtractionItemRow, Prisma } from "@prisma/client";
import { assignGroupIds } from "@/lib/extraction/segmentation";
import type { ExtractionMode } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import { persistM2ExtractionDrafts } from "../../m2-draft-pipeline";
import { ensureSourceMaterial } from "../source-material";
import { buildStructuredDraftsFromItems } from "./build-drafts";
import { runPassageOnlyClusterLoop } from "./passage-only";
import { buildResultRows } from "./result-rows";
import {
  buildSnapshotItems,
  type ClusteredWithGlobalOrder,
} from "./snapshot";

export interface StructuredFinalizeInput {
  jobId: string;
  items: ExtractionItemRow[];
  pages: Array<{
    pageIndex: number;
    status: string;
    extractedText: string | null;
    confidence: number | null;
    pageMeta?: unknown;
  }>;
  mode: ExtractionMode;
  /** P7-D2: 잡 단위 출력 방식. "verbatim"이면 자동 복원 스킵. null=기존 동작. */
  outputMode: string | null;
  originalFileName: string | null;
  academyId: string;
  createdById: string;
  finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
}

/**
 * M2 / M4 path — structured blocks → groupId / parent / SourceMaterial.
 *
 * Steps:
 *   1. Rebuild StructuredBlockDraft[] from DB items (per-page order).
 *   2. Cluster blocks into groups + assign global order.
 *   3. Create / reuse a SourceMaterial row.
 *   4. Build ExtractionItemSnapshot[] with resolved parent/group ids.
 *   5. Build ExtractionResult rows (structured + legacy fallback path).
 *   6. Persist itemUpdateOps + result rows in one transaction.
 *   7. PASSAGE_ONLY: run cluster loop to fan out M1 draft pipeline.
 *   8. QUESTION_SET: run M2 draft pipeline.
 */
export async function finalizeStructured(input: StructuredFinalizeInput): Promise<{
  draftCount: number;
  sourceMaterialId: string | null;
}> {
  const { jobId, items, pages, finalStatus } = input;

  // ── 1) Rebuild StructuredBlockDraft[] from the DB.
  const { drafts, localIdToDbId } = buildStructuredDraftsFromItems(items);

  // ── 2) Cluster blocks into groups + resolve parentLocalId → DB id.
  const clustered = assignGroupIds(drafts);
  // Assign a stable *global* order across all blocks (page-major, then per-page
  // order). This matches how the review UI sorts.
  const withGlobalOrder: ClusteredWithGlobalOrder[] = clustered.map(
    (c, idx) => ({
      ...c,
      globalOrder: idx,
    }),
  );

  // ── 3) SourceMaterial — derive from EXAM_META + page 1 text + filename.
  //
  // (P1-3) contentHash must be deterministic across retries. `drafts` is
  // already built by walking `sortedPageIndexes` (asc) and stable-sorted
  // within each page, so PASSAGE_BODY iteration order is already stable
  // — but we explicitly re-sort by (pageIndex, order) before concat to
  // guarantee stability even if upstream ordering drifts later. Same for
  // the fallback path that uses `pages[].extractedText`.
  const page1Text = drafts
    .filter((d) => d.pageIndex === 0)
    .map((d) => d.content)
    .join("\n");
  const allPassageTexts = drafts
    .filter((d) => d.blockType === "PASSAGE_BODY")
    .slice()
    .sort((a, b) =>
      a.pageIndex !== b.pageIndex
        ? a.pageIndex - b.pageIndex
        : a.order - b.order,
    )
    .map((d) => d.content);
  const examMetaSignals = drafts
    .filter((d) => d.blockType === "EXAM_META")
    .map((d) => ({ content: d.content, meta: d.examMeta }));

  const fallbackPageTexts = [...pages]
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((p) => p.extractedText ?? "")
    .filter(Boolean);

  let sourceMaterialId: string | null = null;
  if (finalStatus !== "FAILED" && drafts.length > 0) {
    sourceMaterialId = await ensureSourceMaterial({
      jobId,
      academyId: input.academyId,
      createdById: input.createdById,
      mode: input.mode,
      filename: input.originalFileName,
      page1Text,
      allTexts:
        allPassageTexts.length > 0 ? allPassageTexts : fallbackPageTexts,
      examMetaSignals,
    });
  }

  // ── 4) Build ExtractionItemSnapshot[] (resolved parentItemId / groupId).
  const snapshotItems = buildSnapshotItems(
    withGlobalOrder,
    items,
    localIdToDbId,
    jobId,
  );

  // ── 5) Build ExtractionResult rows + item update ops.
  const {
    structuredDraftsForResults,
    legacyFallbackDrafts,
    useLegacyFallback,
    resultRows,
    itemUpdateOps,
  } = buildResultRows({
    jobId,
    mode: input.mode,
    pages,
    snapshotItems,
    withGlobalOrder,
    localIdToDbId,
  });

  // ── 6) Persist: item ops + result rows + job status update.
  //
  // For PASSAGE_ONLY jobs the cluster loop below also persists drafts, so
  // we delay the COMPLETED status flip until after that finishes. Otherwise
  // the UI polling sees `status=COMPLETED` and stops fetching before any
  // cluster's drafts have been INSERTed — the teacher sees an empty result
  // until they refresh manually. (Non-PASSAGE_ONLY modes have no cluster
  // loop, so they flip status here in the same transaction.)
  const isPassageOnly = input.mode === "PASSAGE_ONLY";
  const persistOps: Prisma.PrismaPromise<unknown>[] = [
    ...itemUpdateOps,
    prisma.extractionResult.deleteMany({
      where: { jobId, status: "DRAFT" },
    }),
  ];
  if (resultRows.length > 0) {
    persistOps.push(prisma.extractionResult.createMany({ data: resultRows }));
  }
  persistOps.push(
    prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        ...(isPassageOnly
          ? {}
          : { status: finalStatus, completedAt: new Date() }),
        ...(sourceMaterialId ? { sourceMaterialId } : {}),
      },
    }),
  );
  await prisma.$transaction(persistOps);

  // ── 7) PASSAGE_ONLY cluster loop (M1 draft pipeline).
  if (isPassageOnly) {
    await runPassageOnlyClusterLoop({
      jobId,
      academyId: input.academyId,
      createdById: input.createdById,
      mode: input.mode,
      outputMode: input.outputMode,
      originalFileName: input.originalFileName,
      sourceMaterialId,
      snapshotItems,
      pages,
    });

    // PASSAGE_ONLY status flip — done HERE so the UI polling that watches
    // `status === "COMPLETED"` doesn't unsubscribe before any cluster's
    // drafts have been INSERTed. cluster loop above appends drafts in
    // order (cluster 1 → cluster 2 → …), each visible to subsequent
    // polls; flipping COMPLETED last keeps the polling alive until every
    // cluster has surfaced.
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });
  }

  // ── 8) QUESTION_SET (M2 draft pipeline).
  if (input.mode === "QUESTION_SET") {
    try {
      const m2DraftResult = await persistM2ExtractionDrafts({
        jobId,
        academyId: input.academyId,
        sourceMaterialId,
        drafts: structuredDraftsForResults,
      });
      logger.info("m2 draft pipeline done", {
        jobId,
        ...m2DraftResult,
      });
    } catch (err) {
      logger.error("m2 draft pipeline failed", {
        jobId,
        err: err instanceof Error ? err.message : String(err),
      });
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          errorSummary: JSON.stringify({
            m2DraftPipeline: err instanceof Error ? err.message : String(err),
          }),
        },
      });
    }
  }

  return {
    draftCount: useLegacyFallback
      ? legacyFallbackDrafts.length
      : structuredDraftsForResults.length,
    sourceMaterialId,
  };
}
