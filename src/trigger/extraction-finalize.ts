// ============================================================================
// extraction-finalize — terminal state aggregation + segmentation.
//
// Triggered by extraction-page after the last page reaches a terminal state,
// and also by the reaper (safety net) if page-level triggering missed.
// Fully idempotent — checks job.status before mutating.
//
// Mode-aware behaviour:
//   - M1 PASSAGE_ONLY : structured page OCR + passage-centric grouping. If the
//                       model fails to emit any PASSAGE_BODY blocks, finalize
//                       falls back to the legacy regex segmenter over the
//                       per-page OCR text so the review UI is never blank.
//   - M2 QUESTION_SET : ExtractionItem rows are already persisted by the page
//                       worker. finalize assigns groupId / parentItemId /
//                       global order, creates a SourceMaterial record, and
//                       emits one ExtractionResult per clustered passage for
//                       the legacy review UI.
//   - M4 FULL_EXAM    : Same as M2 plus: SourceMaterial uses EXAM_META blocks
//                       as primary signal, content hash spans every passage.
//   - M3 EXPLANATION  : Uses the legacy plain-text segmenter for now.
// ============================================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import { randomUUID } from "node:crypto";
import type { Prisma, ExtractionItem as ExtractionItemRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assignGroupIds,
  buildEnrichedDrafts,
  segmentPages,
  type StructuredBlockDraft,
} from "@/lib/extraction/segmentation";
import { parseSourceMeta, computeContentHash } from "@/lib/extraction/meta-parser";
import { usesStructuredExtraction } from "@/lib/extraction/modes";
import type {
  BlockType,
  ExtractionItemSnapshot,
  ExtractionItemStatus,
  ExtractionMode,
  M1RestorationStatus,
} from "@/lib/extraction/types";
import type {
  RestorationQuestionInput,
  SourceMatchInput,
} from "@/lib/extraction/m2-restoration";
import { m1SourceMatchMethod } from "@/lib/extraction/m1-draft-persistence";
import {
  restoreM1PassageBatch,
  type M1PassageRestorationResult,
} from "./_lib/m1-passage-restoration";
import { persistM2ExtractionDrafts } from "./_lib/m2-draft-pipeline";
import {
  buildPageOrdering,
  summarisePageMeta,
  type PageCluster,
  type PageMetaSummary,
} from "./_lib/page-ordering";
import { buildRestorationActions } from "./_lib/m1-restoration-actions";

type Input = { jobId: string };

type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

const TERMINAL: readonly JobStatus[] = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] as const;

export const extractionFinalizeTask = task({
  id: "extraction-finalize",
  queue: { name: "extraction-finalize", concurrencyLimit: 5 },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
    factor: 2,
    randomize: true,
  },
  async run(payload: Input) {
    const { jobId } = payload;

    const job = await prisma.extractionJob.findUnique({
      where: { id: jobId },
      include: {
        pages: { orderBy: { pageIndex: "asc" } },
        items: { orderBy: { order: "asc" } },
      },
    });
    if (!job) throw new Error(`job not found: ${jobId}`);

    if (TERMINAL.includes(job.status as JobStatus)) {
      logger.info("finalize skipped — already terminal", {
        jobId,
        status: job.status,
      });
      return { skipped: true as const, status: job.status };
    }

    const pagesTerminal = job.pages.every(
      (p) => p.status === "SUCCESS" || p.status === "DEAD" || p.status === "SKIPPED",
    );
    if (!pagesTerminal || job.pages.length !== job.totalPages) {
      logger.info("finalize skipped — pages not all terminal", {
        jobId,
        pagesInDb: job.pages.length,
        expected: job.totalPages,
      });
      return { skipped: true as const };
    }

    const mode = (job.mode as ExtractionMode) ?? "PASSAGE_ONLY";
    const isStructured = usesStructuredExtraction(mode);

    // Compute status
    let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
    if (job.successPages === job.totalPages) finalStatus = "COMPLETED";
    else if (job.successPages === 0) finalStatus = "FAILED";
    else finalStatus = "PARTIAL";

    let draftCount = 0;
    let sourceMaterialId: string | null = null;

    if (isStructured) {
      const result = await finalizeStructured({
        jobId,
        items: job.items,
        pages: job.pages,
        mode,
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    } else {
      const result = await finalizePlainText({
        jobId,
        pages: job.pages,
        mode,
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    }

    logger.info("finalize done", {
      jobId,
      mode,
      status: finalStatus,
      successPages: job.successPages,
      failedPages: job.failedPages,
      draftCount,
      sourceMaterialId,
    });

    return {
      status: finalStatus,
      draftCount,
      sourceMaterialId,
      successPages: job.successPages,
      failedPages: job.failedPages,
    };
  },
});

// ────────────────────────────────────────────────────────────────────────────
// M1 / legacy path — plain-text OCR → regex segmentation
// ────────────────────────────────────────────────────────────────────────────

interface PlainTextFinalizeInput {
  jobId: string;
  pages: Array<{
    pageIndex: number;
    status: string;
    extractedText: string | null;
    confidence: number | null;
  }>;
  mode: ExtractionMode;
  originalFileName: string | null;
  academyId: string;
  createdById: string;
  finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
}

async function finalizePlainText(input: PlainTextFinalizeInput): Promise<{
  draftCount: number;
  sourceMaterialId: string | null;
}> {
  const { jobId, pages, finalStatus } = input;

  // Run segmentation on successful pages.
  // (P1-3) Sort explicitly by pageIndex — the caller already passes pages
  // ordered, but re-sorting here keeps the invariant local and makes the
  // downstream contentHash reproducible across retries.
  const ocrInputs = [...pages]
    .filter((p) => p.status === "SUCCESS" && p.extractedText)
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((p) => ({
      pageIndex: p.pageIndex,
      text: p.extractedText ?? "",
      confidence: p.confidence,
    }));
  const drafts = segmentPages(ocrInputs);

  // SourceMaterial suggestion — only when we have at least some text.
  let sourceMaterialId: string | null = null;
  const successTexts = ocrInputs.map((p) => p.text).filter(Boolean);
  if (finalStatus !== "FAILED" && successTexts.length > 0) {
    sourceMaterialId = await ensureSourceMaterial({
      jobId,
      academyId: input.academyId,
      createdById: input.createdById,
      mode: input.mode,
      filename: input.originalFileName,
      page1Text: ocrInputs[0]?.text ?? "",
      allTexts: successTexts,
    });
  }

  await prisma.$transaction(async (tx) => {
    // Re-run safe: wipe any existing DRAFT results (user edits preserved
    // via REVIEWED / SAVED status).
    await tx.extractionResult.deleteMany({
      where: { jobId, status: "DRAFT" },
    });
    for (const d of drafts) {
      await tx.extractionResult.create({
        data: {
          jobId,
          passageOrder: d.passageOrder,
          sourcePageIndex: d.sourcePageIndex,
          title: d.title,
          content: d.content,
          meta: (d.meta as Prisma.InputJsonValue) ?? undefined,
          confidence: d.confidence,
          status: "DRAFT",
        },
      });
    }
    await tx.extractionJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        ...(sourceMaterialId ? { sourceMaterialId } : {}),
      },
    });
  });

  return { draftCount: drafts.length, sourceMaterialId };
}

// ────────────────────────────────────────────────────────────────────────────
// M2 / M4 path — structured blocks → groupId / parent / SourceMaterial
// ────────────────────────────────────────────────────────────────────────────

interface StructuredFinalizeInput {
  jobId: string;
  items: ExtractionItemRow[];
  pages: Array<{
    pageIndex: number;
    status: string;
    extractedText: string | null;
    confidence: number | null;
  }>;
  mode: ExtractionMode;
  originalFileName: string | null;
  academyId: string;
  createdById: string;
  finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
}

async function finalizeStructured(input: StructuredFinalizeInput): Promise<{
  draftCount: number;
  sourceMaterialId: string | null;
}> {
  const { jobId, items, pages, finalStatus } = input;

  // ── 1) Rebuild StructuredBlockDraft[] from the DB, with deterministic per-page order.
  //
  // The page worker stored each block with `order = pageIndex * 1000 + i`,
  // so for each page we re-derive `order` as the 0-based index within the
  // page — which is what assignGroupIds() expects (and what localIdFor()
  // uses to build parentLocalId = "pageIndex:order").
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

  // Build drafts and remember the DB id at each (pageIndex, perPageOrder).
  //
  // (P1-2) The worker writes `questionMeta = { number: <n> }` exclusively.
  // Earlier drafts of finalize accepted a legacy `questionNumber` key too,
  // which masked write-side drift. We now read ONLY `number` — if a block
  // is missing it, that's a worker-side bug worth surfacing. Same rule
  // applies to choiceMeta: only `{ index, label, isAnswer }` is written,
  // never `choiceIndex`.
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

  // ── 2) Cluster blocks into groups + resolve parentLocalId → DB id.
  const clustered = assignGroupIds(drafts);

  // Assign a stable *global* order across all blocks (page-major, then per-page
  // order). This matches how the review UI sorts.
  const withGlobalOrder = clustered.map((c, idx) => ({
    ...c,
    globalOrder: idx,
  }));

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

  // ── 4) Build ExtractionItemSnapshot[] for buildEnrichedDrafts (needs
  //       resolved parentItemId and groupId).
  const snapshotItems: ExtractionItemSnapshot[] = withGlobalOrder.map(
    (c, idx) => {
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
        originalItem?.choiceMeta && typeof originalItem.choiceMeta === "object"
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
                ...(c.questionNumber !== null ? { number: c.questionNumber } : {}),
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
    },
  );

  const enriched = buildEnrichedDrafts(snapshotItems);
  const structuredPassageCount = snapshotItems.filter(
    (item) => item.blockType === "PASSAGE_BODY",
  ).length;
  const useLegacyFallback =
    input.mode === "PASSAGE_ONLY" &&
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
    input.mode === "PASSAGE_ONLY"
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

  const resultRows: Prisma.ExtractionResultCreateManyInput[] =
    useLegacyFallback
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

  if (input.mode === "PASSAGE_ONLY") {
    try {
      // ── Page reordering + cluster detection ─────────────────────────
      // Mixed-up uploads (image multi-select that arrived out of order) or
      // multi-test jobs (several test booklets in a single upload) are
      // recovered here by reading OCR-detected page numbers / exam codes
      // and clustering by exam fingerprint. Single-cluster jobs degrade
      // to the legacy single-pass behaviour.
      const pageMetaSummaries = collectPageMetaSummaries(
        snapshotItems,
        pages as Array<{ pageIndex: number; pageMeta?: unknown }>,
      );
      const ordering = buildPageOrdering({ pageMetas: pageMetaSummaries });
      const clusters: PageCluster[] = ordering.clusters;
      logger.info("m1 page ordering computed", {
        jobId,
        clusterCount: clusters.length,
        clusters: clusters.map((c) => ({
          clusterId: c.clusterId,
          fingerprint: c.fingerprint,
          pageCount: c.pages.length,
          pageIndexes: c.pages.map((p) => p.pageIndex),
        })),
        warnings: ordering.warnings,
      });

      const itemsByCluster = groupSnapshotItemsByCluster(
        snapshotItems,
        ordering,
      );

      let totalDraftCount = 0;
      let totalChangeCount = 0;
      let clearedOnce = false;
      for (let clusterIdx = 0; clusterIdx < clusters.length; clusterIdx += 1) {
        const cluster = clusters[clusterIdx];
        const clusterItems = itemsByCluster.get(cluster.clusterId) ?? [];
        if (clusterItems.length === 0) continue;

        // Pick the SourceMaterial for this cluster. First cluster reuses
        // the job-level sourceMaterialId (preserves single-cluster legacy
        // semantics + the job.sourceMaterialId link). Subsequent clusters
        // get their own SourceMaterial via the cluster-scoped helper.
        let clusterSourceMaterialId: string | null;
        if (clusterIdx === 0) {
          clusterSourceMaterialId = sourceMaterialId;
        } else {
          const clusterPassageTexts = clusterItems
            .filter((it) => it.blockType === "PASSAGE_BODY")
            .map((it) => it.content)
            .filter(Boolean);
          const clusterFirstPage = cluster.pages[0]?.pageIndex ?? 0;
          const clusterPage1Text = clusterItems
            .filter((it) => (it.sourcePageIndex[0] ?? 0) === clusterFirstPage)
            .map((it) => it.content)
            .join("\n");
          clusterSourceMaterialId = await ensureClusterSourceMaterial({
            jobId,
            academyId: input.academyId,
            createdById: input.createdById,
            mode: input.mode,
            filename: input.originalFileName,
            page1Text: clusterPage1Text,
            allTexts:
              clusterPassageTexts.length > 0
                ? clusterPassageTexts
                : [clusterPage1Text],
            examMetaSignals: clusterItems
              .filter((it) => it.blockType === "EXAM_META")
              .map((it) => ({ content: it.content, meta: it.examMeta })),
          });
        }

        const result = await persistM1PassageDrafts({
          jobId,
          academyId: input.academyId,
          sourceMaterialId: clusterSourceMaterialId,
          items: clusterItems,
          passageOrderOffset: totalDraftCount,
          // Only the first non-empty cluster wipes existing DRAFT rows.
          // Subsequent clusters append to the same job's draft list so
          // earlier-cluster results aren't clobbered.
          clearExistingDrafts: !clearedOnce,
        });
        clearedOnce = true;
        totalDraftCount += result.draftCount;
        totalChangeCount += result.changeCount;
      }

      logger.info("m1 draft pipeline done", {
        jobId,
        clusterCount: clusters.length,
        draftCount: totalDraftCount,
        changeCount: totalChangeCount,
      });
    } catch (err) {
      logger.error("m1 draft pipeline failed", {
        jobId,
        err: err instanceof Error ? err.message : String(err),
      });
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          errorSummary: JSON.stringify({
            m1DraftPipeline: err instanceof Error ? err.message : String(err),
          }),
        },
      });
    }

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

// ────────────────────────────────────────────────────────────────────────────
// SourceMaterial creation (shared)
// ────────────────────────────────────────────────────────────────────────────

// ----------------------------------------------------------------------------
// M1 passage drafts - raw/restored pairs for the new passage extraction room.
// ----------------------------------------------------------------------------

interface M1RestorationChange {
  sentenceOrder: number | null;
  before: string;
  after: string;
  changeType: string | null;
  reason: string | null;
  confidence: number | null;
  sourcePageIndex: number[];
}

interface M1PassageChunk {
  groupId: string | null;
  sourcePageIndex: number[];
  rawText: string;
  restoredText: string;
  restorationStatus: M1RestorationStatus;
  restorationChanges: M1RestorationChange[];
  restorationWarnings: string[];
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
  confidence: number | null;
  boundaryConfidence: number | null;
  /** True if the group contains at least one PASSAGE_BODY block. Listening
   *  problems (수능 영어 1~17번) have only QUESTION_STEM + CHOICE blocks — no
   *  passage exists on the page. We skip the grounded restoration call for
   *  those groups so the model does not hallucinate phantom passages from
   *  the audio script. */
  hasPassageBody: boolean;
  /** Items that belong to this chunk (= the bucket from STEM-led grouping).
   *  Carried forward so downstream callers (buildRestorationQuestions /
   *  buildProblemEvidenceFromItems) can identify the chunk's items by `id`
   *  rather than the legacy PASSAGE-led `groupId` (which is set by
   *  `assignGroupIds` and unrelated to the STEM-led bucket). */
  items: ExtractionItemSnapshot[];
}

const LOCAL_DB_EXACT_THRESHOLD = 0.9;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readM1RestorationStatus(value: unknown): M1RestorationStatus {
  if (
    value === "PENDING" ||
    value === "RESTORED" ||
    value === "NO_RESTORATION_NEEDED" ||
    value === "PARTIAL" ||
    value === "FAILED"
  ) {
    return value;
  }
  return "RESTORED";
}

/**
 * Build a chunk from every block in a single grouping (groupId).
 *
 * `assignGroupIds` already clusters one logical "문제" together — passage body
 * + its question stems + choices + explanation share one groupId. EXAM_META /
 * HEADER / FOOTER / DIAGRAM / NOISE land with `groupId = null` and are
 * filtered out by the caller before reaching here.
 *
 * The draft's `rawText` is the concatenation of every block in the group (in
 * `order` ascending, separated by blank lines) so the review UI shows the
 * problem as a whole — number, instruction, passage, choices — instead of
 * the passage body alone. Boundary metadata (continuesFromPrevious /
 * continuesToNext, restoredText, restorationChanges from the OCR pass) is
 * read from the anchor PASSAGE_BODY in the group, if any.
 */
function readM1PassageGroupChunk(
  groupId: string,
  groupItems: ExtractionItemSnapshot[],
): M1PassageChunk | null {
  if (groupItems.length === 0) return null;

  // Trust the caller's ordering. The STEM-led grouping walk pushed items
  // into this bucket in the cluster-ordered input sequence — sorting by
  // `item.order` here would silently revert to upload/OCR order, which
  // breaks cross-page chunks where cluster page-ordering put a later-
  // uploaded page first. (E.g. KakaoTalk 1쪽 was uploaded last → cluster
  // sort puts page 9 before page 8, but item.order has page 8 < page 9
  // because OCR numbered items in upload order. Re-sorting by item.order
  // would move that page's CHOICES ahead of the STEM+BODY on the prior
  // page.)
  const ordered = [...groupItems];
  // The user-visible "문제 원문" must reproduce the entire problem the way it
  // appeared on the page. We keep:
  //   - PASSAGE_BODY / QUESTION_STEM / CHOICE / EXPLANATION (always content)
  //   - DIAGRAM — the OCR labels boxed sentences (삽입형 정답 후보 문장 등)
  //               as DIAGRAM, but the content is part of the problem text and
  //               must NOT be hidden from the teacher.
  // EXAM_META / HEADER / FOOTER / NOISE were filtered out by the caller before
  // this point, so anything that survives is fair game.
  const visible = ordered.filter((item) => item.content.trim().length > 0);
  if (visible.length === 0) return null;

  const rawText = visible
    .map((item) => item.content.trim())
    .filter((content) => content.length > 0)
    .join("\n\n")
    .trim();
  if (!rawText) return null;

  const anchor = ordered.find((item) => item.blockType === "PASSAGE_BODY") ?? null;
  const meta = anchor?.passageMeta ?? null;
  const restoredValue = meta?.restoredText;
  const restoredText =
    typeof restoredValue === "string" && restoredValue.trim().length > 0
      ? restoredValue.trim()
      : rawText;

  const sourcePageIndex = uniqueSorted(
    ordered.flatMap((item) => item.sourcePageIndex),
  );
  const changes = Array.isArray(meta?.restorationChanges)
    ? meta.restorationChanges
        .filter((change): change is Record<string, unknown> => {
          return change !== null && typeof change === "object";
        })
        .map((change) => ({
          sentenceOrder: asNumber(change.sentenceOrder),
          before: typeof change.before === "string" ? change.before : "",
          after: typeof change.after === "string" ? change.after : "",
          changeType:
            typeof change.changeType === "string" ? change.changeType : null,
          reason: typeof change.reason === "string" ? change.reason : null,
          confidence: asNumber(change.confidence),
          sourcePageIndex: anchor?.sourcePageIndex ?? sourcePageIndex,
        }))
    : [];

  const groupConfidences = ordered
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === "number");
  const confidence =
    typeof anchor?.confidence === "number"
      ? anchor.confidence
      : groupConfidences.length > 0
        ? groupConfidences.reduce((sum, value) => sum + value, 0) /
          groupConfidences.length
        : null;

  return {
    groupId,
    sourcePageIndex,
    rawText,
    restoredText,
    restorationStatus: readM1RestorationStatus(meta?.restorationStatus),
    restorationChanges: changes,
    restorationWarnings: asStringArray(meta?.restorationWarnings),
    continuesFromPrevious: meta?.continuesFromPrevious === true,
    continuesToNext: meta?.continuesToNext === true,
    confidence,
    boundaryConfidence: asNumber(meta?.boundaryConfidence),
    hasPassageBody: anchor !== null,
    items: ordered,
  };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Build RestorationQuestionInput[] from a single STEM-led bucket's items.
 *
 * Caller passes the items that belong to ONE chunk (or one merged group of
 * chunks) — every item is therefore in scope for choice matching. We do NOT
 * fall back to the legacy `groupId` matching because the PASSAGE-led
 * `assignGroupIds` ids do not align with STEM-led buckets.
 */
function buildRestorationQuestions(
  groupItems: ExtractionItemSnapshot[],
): RestorationQuestionInput[] {
  const questionItems = groupItems
    .filter((item) => item.blockType === "QUESTION_STEM")
    .sort((a, b) => a.order - b.order);

  return questionItems.map((question, index) => {
    const questionNumber =
      typeof question.questionMeta?.number === "number"
        ? question.questionMeta.number
        : null;
    const nextStemOrder =
      questionItems[index + 1]?.order ?? Number.POSITIVE_INFINITY;
    const choices = groupItems
      .filter((item) => {
        if (item.blockType !== "CHOICE") return false;
        if (item.parentItemId === question.id) return true;
        return item.order > question.order && item.order < nextStemOrder;
      })
      .sort((a, b) => a.order - b.order)
      .map((choice, choiceIndex) => ({
        label:
          typeof choice.choiceMeta?.label === "string"
            ? choice.choiceMeta.label
            : String(choiceIndex + 1),
        content: choice.content,
        isAnswer: choice.choiceMeta?.isAnswer === true,
      }));

    return {
      questionNumber,
      stem: question.content,
      choices,
      explanation: null,
    };
  });
}

function sourceMatchMethod(match: SourceMatchInput, index: number): string {
  return m1SourceMatchMethod(match, index);
}

/**
 * Question types that require grounded AI restoration because the body
 * itself is modified (blanks to fill, sentences to reorder/insert/remove,
 * grammar/vocab to correct). For every other type the body is the
 * untouched source passage — we only need to strip problem-sheet markers.
 *
 * `UNKNOWN` is intentionally NOT in this set but is handled separately in
 * the dispatch logic: we treat unclassified questions as restoration-
 * required to avoid false negatives when the classifier failed.
 */
const RESTORATION_REQUIRED_TYPES = new Set([
  "BLANK_INFERENCE",
  "BLANK_WORD",
  "BLANK_SENTENCE",
  "CONNECTOR",
  "SENTENCE_ORDER",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "VOCAB_CHOICE",
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
  "SUMMARY_COMPLETE",
  "DIALOGUE_ORDER",
]);

/**
 * Feature flag — flip to `EXTRACTION_TYPE_FILTERED_RESTORATION=false` in
 * trigger.dev env to instantly disable the type-based skip and fall back
 * to the previous "restore everything with a passage" behaviour. Defaults
 * to ON so a no-op redeploy is enough to roll forward.
 */
const TYPE_FILTERED_RESTORATION_ENABLED =
  process.env.EXTRACTION_TYPE_FILTERED_RESTORATION !== "false";

const PASSAGE_QUESTION_TYPE_VALUES = new Set([
  "BLANK_INFERENCE",
  "BLANK_WORD",
  "BLANK_SENTENCE",
  "CONNECTOR",
  "SENTENCE_ORDER",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "VOCAB_CHOICE",
  "CONTEXT_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "PURPOSE",
  "MOOD_TONE",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
  "CONDITIONAL_WRITING",
  "TEXTBOOK_DETAIL",
  "DIALOGUE_ORDER",
  "DIALOGUE_RESPONSE",
  "KOREAN_TRANSLATION",
  "ENGLISH_DEFINITION",
  "UNKNOWN",
]);

function normalizeAnalysisQuestionType(value: unknown): string {
  if (typeof value !== "string") return "UNKNOWN";
  const upper = value.toUpperCase().replace(/[\s-]+/g, "_");
  return PASSAGE_QUESTION_TYPE_VALUES.has(upper) ? upper : "UNKNOWN";
}

/**
 * Convert 1st-pass `questionMeta.analysis` payloads into the
 * `ProblemEvidenceResponse` shape that 2nd-pass `restoreM1Passage` expects.
 *
 * The 1st OCR call now performs question-type classification + answer
 * inference inline, so the 2nd-pass call no longer needs a separate Gemini
 * round-trip to compute problem evidence. We just shape the existing analysis
 * data into the response type the restoration pipeline already consumes.
 */
/**
 * For groups whose question types don't need AI restoration (지칭/일치/
 * 주제/제목/목적 etc.), build the clean body locally: concat the
 * PASSAGE_BODY block contents, then strip problem-sheet markers that the
 * teacher will not want in the saved passage. Returns empty string when
 * no PASSAGE_BODY block was classified — caller falls back to rawText.
 */
function buildCleanBodyForSkippedGroup(
  groupItems: ExtractionItemSnapshot[],
): string {
  const bodies = groupItems
    .filter((item) => item.blockType === "PASSAGE_BODY")
    .sort((a, b) => a.order - b.order)
    .map((item) => item.content.trim())
    .filter((content) => content.length > 0);
  if (bodies.length === 0) return "";

  let cleaned = bodies.join("\n\n");
  // ①②③④⑤ inline markers that classify attached for marker-position
  // recovery — useful as raw evidence, but the clean passage shouldn't
  // carry them.
  cleaned = cleaned.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "");
  // (A)~(D) chunk labels at line starts (ordering questions).
  cleaned = cleaned.replace(/(^|\n)[ \t]*\(([A-D])\)[ \t]*/g, "$1");
  // (a)~(e) inline referent markers placed in front of words.
  cleaned = cleaned.replace(/\(([a-e])\)(?=\s|[,.!?:;])/g, "");
  // Safety net: PASSAGE_BODY classified by OCR may absorb a Korean
  // question stem fragment. Drop any line that is mostly Korean.
  cleaned = cleaned
    .split(/\n/)
    .filter((line) => {
      const koreanChars = (line.match(/[가-힣]/g) ?? []).length;
      const totalChars = line.replace(/\s/g, "").length;
      if (totalChars === 0) return true;
      return koreanChars / totalChars < 0.3;
    })
    .join("\n");
  // Collapse the gaps introduced by the strips above.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  cleaned = cleaned.replace(/ +(?=\n)/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function buildProblemEvidenceFromItems(
  groupItems: ExtractionItemSnapshot[],
): import("@/lib/extraction/problem-evidence").ProblemEvidenceResponse | null {
  const questionItems = groupItems
    .filter((item) => item.blockType === "QUESTION_STEM")
    .sort((a, b) => a.order - b.order);
  if (questionItems.length === 0) return null;

  const questions = questionItems.map((q, qIndex) => {
    const meta =
      q.questionMeta && typeof q.questionMeta === "object"
        ? (q.questionMeta as Record<string, unknown>)
        : null;
    const analysis =
      meta?.analysis && typeof meta.analysis === "object"
        ? (meta.analysis as Record<string, unknown>)
        : null;
    const questionNumber = typeof meta?.number === "number" ? meta.number : null;
    const questionType = normalizeAnalysisQuestionType(analysis?.questionType);
    const typeLabel =
      typeof analysis?.typeLabel === "string" && analysis.typeLabel.trim()
        ? analysis.typeLabel
        : questionType;
    const answer =
      typeof analysis?.answer === "string" && analysis.answer.trim()
        ? analysis.answer
        : null;
    const answerConfidence =
      typeof analysis?.answerConfidence === "number"
        ? analysis.answerConfidence
        : null;
    const evidence = Array.isArray(analysis?.evidence)
      ? analysis.evidence.filter((e): e is string => typeof e === "string")
      : [];
    const warnings = Array.isArray(analysis?.warnings)
      ? analysis.warnings.filter((w): w is string => typeof w === "string")
      : [];

    // Map each STEM to its CHOICE blocks (same logic as
    // buildRestorationQuestions) so we can synthesize concrete
    // restoration actions from the classify answer.
    const nextStemOrder =
      questionItems[qIndex + 1]?.order ?? Number.POSITIVE_INFINITY;
    const stemChoices = groupItems
      .filter((item) => {
        if (item.blockType !== "CHOICE") return false;
        if (item.parentItemId === q.id) return true;
        return item.order > q.order && item.order < nextStemOrder;
      })
      .sort((a, b) => a.order - b.order)
      .map((choice, choiceIndex) => {
        const choiceMeta =
          choice.choiceMeta && typeof choice.choiceMeta === "object"
            ? (choice.choiceMeta as Record<string, unknown>)
            : null;
        return {
          label:
            typeof choiceMeta?.label === "string"
              ? choiceMeta.label
              : String(choiceIndex + 1),
          content: choice.content,
          isAnswer: choiceMeta?.isAnswer === true,
        };
      });
    const restorationActions = buildRestorationActions(
      {
        questionType,
        answer,
        answerConfidence,
        evidence,
      },
      stemChoices,
    );

    return {
      questionNumber,
      questionType: questionType as
        | "BLANK_INFERENCE"
        | "BLANK_WORD"
        | "BLANK_SENTENCE"
        | "CONNECTOR"
        | "SENTENCE_ORDER"
        | "PARAGRAPH_ORDER"
        | "SENTENCE_INSERT"
        | "IRRELEVANT"
        | "GRAMMAR_ERROR"
        | "GRAMMAR_CORRECTION"
        | "VOCAB_CHOICE"
        | "CONTEXT_MEANING"
        | "REFERENCE"
        | "CONTENT_MATCH"
        | "TOPIC_MAIN_IDEA"
        | "TITLE"
        | "PURPOSE"
        | "MOOD_TONE"
        | "SUMMARY_COMPLETE"
        | "WORD_ORDER"
        | "SENTENCE_TRANSFORM"
        | "CONDITIONAL_WRITING"
        | "TEXTBOOK_DETAIL"
        | "DIALOGUE_ORDER"
        | "DIALOGUE_RESPONSE"
        | "KOREAN_TRANSLATION"
        | "ENGLISH_DEFINITION"
        | "UNKNOWN",
      typeLabel,
      confidence: answerConfidence ?? 0.5,
      stem: q.content,
      answer,
      answerConfidence,
      evidence,
      restorationActions,
      warnings,
    };
  });

  const solvedCount = questions.filter((q) => q.answer != null).length;
  const status: "SOLVED" | "PARTIAL" | "NO_QUESTIONS" =
    solvedCount === questions.length
      ? "SOLVED"
      : solvedCount > 0
        ? "PARTIAL"
        : "NO_QUESTIONS";
  const confidence =
    questions.length > 0
      ? questions.reduce((sum, q) => sum + q.confidence, 0) / questions.length
      : 0;
  return {
    status,
    confidence,
    sourceHints: [],
    questions,
    globalActions: [],
    unresolved: [],
    warnings: [],
  };
}

async function persistM1PassageDrafts(input: {
  jobId: string;
  academyId: string;
  sourceMaterialId: string | null;
  items: ExtractionItemSnapshot[];
  /**
   * Number to add to every draft's passageOrder. Used by the cluster-aware
   * caller to keep `(jobId, passageOrder)` unique across multiple clusters
   * processed in the same job. Defaults to 0 (single-cluster legacy behaviour).
   */
  passageOrderOffset?: number;
  /**
   * When true (default), this call wipes every DRAFT row for the job before
   * inserting — the original single-cluster semantics. The cluster-aware
   * caller passes `false` for every cluster after the first so subsequent
   * clusters append instead of clobbering earlier clusters' drafts.
   */
  clearExistingDrafts?: boolean;
}): Promise<{ draftCount: number; changeCount: number }> {
  const passageOrderOffset = input.passageOrderOffset ?? 0;
  const clearExistingDrafts = input.clearExistingDrafts ?? true;
  // STEM-led grouping (new in 20260512.3).
  //
  // The previous PASSAGE-led approach (using `assignGroupIds`'s `groupId`)
  // had an off-by-one problem on independent sequential problems: a new
  // PASSAGE_BODY opened a new group, but the QUESTION_STEM that owned that
  // passage was still in the PREVIOUS group, leaving passage and stem
  // mismatched in every other draft.
  //
  // The new approach walks blocks in reading order (by `order`) and:
  //   - Skips EXAM_META / HEADER / FOOTER / NOISE (page chrome).
  //   - Starts a NEW bucket on every QUESTION_STEM that carries a real
  //     `questionNumber`.
  //   - Buffers QUESTION_STEMs without a number (shared instructions like
  //     "[31~34] 다음 빈칸에 들어갈 말로...") and attaches them to the next
  //     real stem.
  //   - Merges consecutive stems that share the same `sharedPassageRange`
  //     (case A: "[2~4] 다음 글을 읽고..." — one passage, multiple questions).
  //   - PASSAGE_BODY / CHOICE / EXPLANATION / DIAGRAM blocks join the current
  //     bucket (or open a new bucket if no stem has been seen yet — covers
  //     case A where the passage precedes its stems).
  const EXCLUDED_BLOCK_TYPES = new Set([
    "EXAM_META",
    "HEADER",
    "FOOTER",
    "NOISE",
  ]);
  // Trust caller's ordering. The cluster-aware caller pre-sorts items by
  // (page-ordering rank, in-page order) so a page-number-driven reshuffle
  // (e.g. cluster's pageIndex 9 has pageNumber=1 and must walk before
  // pageIndex 8 with pageNumber=2) reaches the STEM-led walk intact. Re-
  // sorting by `item.order` here would silently revert that to upload
  // order because item.order encodes the original pageIndex. Filter only.
  const candidates = [...input.items].filter(
    (item) => !EXCLUDED_BLOCK_TYPES.has(item.blockType),
  );

  const readSharedRange = (
    item: ExtractionItemSnapshot,
  ): string | null => {
    if (item.blockType === "QUESTION_STEM") {
      const meta = item.questionMeta as Record<string, unknown> | null;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const range = meta.sharedPassageRange;
        if (typeof range === "string" && range.trim().length > 0) {
          return range.trim();
        }
      }
    } else if (item.blockType === "PASSAGE_BODY") {
      const pmeta = item.passageMeta as Record<string, unknown> | null;
      if (pmeta && typeof pmeta === "object" && !Array.isArray(pmeta)) {
        const range = pmeta.questionRange;
        if (typeof range === "string" && range.trim().length > 0) {
          return range.trim();
        }
      }
    }
    return null;
  };
  const readQuestionNumber = (
    item: ExtractionItemSnapshot,
  ): number | null => {
    if (item.blockType !== "QUESTION_STEM") return null;
    const meta = item.questionMeta as Record<string, unknown> | null;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const num = meta.number;
    return typeof num === "number" && Number.isFinite(num) ? num : null;
  };

  // STEM-led grouping with PASSAGE-before-STEM support.
  //
  // The OCR reading order on Korean exam pages places PASSAGE_BODY blocks
  // BEFORE the numbered QUESTION_STEM in many cases (especially blank
  // inference / 어법 / 어휘 problems where the page has [passage] above
  // [stem with blank or marker]). A naive "STEM starts a new bucket and
  // everything else gets appended" rule mis-attaches each passage to the
  // PREVIOUS question's bucket (after that question's choices have been
  // emitted but before the next stem arrives).
  //
  // To handle PASSAGE-before-STEM correctly we:
  //   - Buffer PASSAGE_BODY / shared-instruction / orphan CHOICE blocks
  //     into `pendingBlocks` until the next numbered STEM arrives.
  //   - On STEM, open a new bucket and prepend the pending blocks.
  //   - Track whether the current bucket has already received a CHOICE
  //     (`currentBucketHasChoice`). Once that flag is on, a NEW PASSAGE_BODY
  //     belongs to the NEXT problem and goes back to `pendingBlocks`
  //     instead of being appended to the current bucket. (A page-boundary
  //     continuation of the SAME passage arrives before any choice, so it
  //     still goes into the current bucket.)
  //   - `currentBucketIsSharedPassage` only flips true when the bucket
  //     opens with a PASSAGE_BODY that carries an explicit
  //     `sharedPassageRange` — that's the case A `[2~4] 다음 글을 읽고…`
  //     marker. Stem-opened buckets do not accept shared-range merging.
  const buckets: ExtractionItemSnapshot[][] = [];
  let pendingBlocks: ExtractionItemSnapshot[] = [];
  let currentBucket: ExtractionItemSnapshot[] | null = null;
  let currentSharedRange: string | null = null;
  let currentBucketIsSharedPassage = false;
  let currentBucketHasChoice = false;

  const openBucketWithStem = (
    stem: ExtractionItemSnapshot,
    stemRange: string | null,
  ): ExtractionItemSnapshot[] => {
    const bucket: ExtractionItemSnapshot[] = [];
    // pending blocks (passage / shared instructions / orphan content) go
    // in FIRST so the bucket reads like [passage, stem, choices].
    let openingPassageRange: string | null = null;
    for (const p of pendingBlocks) {
      bucket.push(p);
      if (
        openingPassageRange === null &&
        p.blockType === "PASSAGE_BODY"
      ) {
        openingPassageRange = readSharedRange(p);
      }
    }
    pendingBlocks = [];
    bucket.push(stem);
    buckets.push(bucket);
    currentSharedRange = openingPassageRange ?? stemRange;
    // Case-A guard: only treat this as a shared-passage bucket if the
    // opening PASSAGE_BODY actually carried a `sharedPassageRange` marker
    // ([2~4] style). Stem-opened buckets (no pending passage) stay
    // independent even if subsequent stems share the same range tag.
    currentBucketIsSharedPassage = openingPassageRange !== null;
    currentBucketHasChoice = false;
    return bucket;
  };

  for (const item of candidates) {
    if (item.blockType === "QUESTION_STEM") {
      const qnum = readQuestionNumber(item);
      const range = readSharedRange(item);
      if (qnum === null) {
        // Shared instruction stem ("[N~M] 다음 글을 읽고..." style, no own
        // questionNumber). Two sub-cases:
        //
        //   (a) Instruction's sharedPassageRange differs from the current
        //       bucket's range — this signals the START of a NEW problem
        //       set (e.g. Q40 finished, "[41~42]" stem arrives → Q41-42
        //       group starts). We CLOSE the current bucket and push the
        //       instruction to pendingBlocks so the next numbered stem
        //       opens a fresh bucket with this instruction prepended.
        //   (b) Instruction's range matches current range (or instruction
        //       has no range, or we're already pre-bucket) — fold into the
        //       current bucket / pending queue as before.
        const instRange = range;
        const isNewSet =
          currentBucket !== null &&
          instRange !== null &&
          instRange !== currentSharedRange;
        if (isNewSet) {
          currentBucket = null;
          currentSharedRange = null;
          currentBucketIsSharedPassage = false;
          currentBucketHasChoice = false;
          pendingBlocks.push(item);
          continue;
        }
        if (currentBucket) currentBucket.push(item);
        else pendingBlocks.push(item);
        continue;
      }
      // Real numbered stem.
      const matchesCurrentShared =
        currentBucket !== null &&
        currentSharedRange !== null &&
        range !== null &&
        range === currentSharedRange &&
        currentBucketIsSharedPassage;
      if (matchesCurrentShared && currentBucket) {
        // Case A continuation — additional stem sharing the same passage.
        currentBucket.push(item);
      } else {
        currentBucket = openBucketWithStem(item, range);
      }
      continue;
    }
    if (item.blockType === "PASSAGE_BODY") {
      // A passage arriving AFTER a choice has already been emitted in the
      // current bucket is the start of the next problem — buffer it.
      // Otherwise (no current bucket OR no choice yet in current bucket)
      // it's either an orphan opening the next bucket OR a continuation
      // of the same problem's passage (page-boundary split).
      //
      // NOTE: an earlier revision also short-circuited on
      // `passageMeta.continuesFromPrevious === false` to force a new bucket
      // even before any choice appeared. That over-fired in practice —
      // OCR was setting `continuesFromPrevious=false` on every paragraph
      // boundary, which shattered single passages into multiple drafts.
      // Reverted to the legacy has-choice-only heuristic until we can
      // restrict the flag's effect to genuine page-boundary first passages.
      if (currentBucket && !currentBucketHasChoice) {
        currentBucket.push(item);
      } else {
        pendingBlocks.push(item);
      }
      continue;
    }
    if (item.blockType === "CHOICE") {
      if (currentBucket) {
        currentBucket.push(item);
        currentBucketHasChoice = true;
      } else {
        // Orphan choice with no bucket yet — rare. Buffer so the next stem
        // (if any) absorbs it; otherwise it gets attached to whatever
        // bucket forms next.
        pendingBlocks.push(item);
      }
      continue;
    }
    // EXPLANATION / DIAGRAM
    if (currentBucket) {
      currentBucket.push(item);
    } else {
      pendingBlocks.push(item);
    }
  }
  // Trailing pending blocks (passage / shared instructions / orphan content)
  // with no following stem — append to the last bucket if any, otherwise
  // drop. Rare: usually a footer/header at end that already got filtered.
  if (pendingBlocks.length > 0 && buckets.length > 0) {
    buckets[buckets.length - 1].push(...pendingBlocks);
    pendingBlocks = [];
  }

  const chunks: M1PassageChunk[] = [];
  for (let i = 0; i < buckets.length; i += 1) {
    const groupId = `bucket-${i}`;
    const chunk = readM1PassageGroupChunk(groupId, buckets[i]);
    if (chunk) chunks.push(chunk);
  }

  if (chunks.length === 0) {
    if (clearExistingDrafts) {
      await prisma.extractionM1PassageDraft.deleteMany({
        where: { jobId: input.jobId, reviewStatus: "DRAFT" },
      });
    }
    return { draftCount: 0, changeCount: 0 };
  }

  // STEM-led grouping (the bucket-builder above) already keeps a single
  // passage on one bucket even when it spans a page boundary (continuation
  // PASSAGE_BODY blocks join `currentBucket` until a new STEM appears). The
  // earlier "merge consecutive chunks when continuesFromPrevious / to-next
  // is set" pass was a leftover from the PASSAGE-led grouping era — under
  // STEM-led, two consecutive chunks always represent two DIFFERENT problems,
  // so merging them collapses unrelated questions (e.g. Q16 + Q17 with a
  // mis-stamped `continuesToNext=true` on Q16's body). Each chunk now stays
  // its own group.
  const groups: M1PassageChunk[][] = chunks.map((chunk) => [chunk]);

  // 복원 호출을 그룹별 1회씩 하지 않고 한 번에 묶어서 처리한다.
  // - Google Search 도구 호출당 과금($0.035)이 비용의 ~80%인 점을 고려해
  //   호출 수 자체를 줄이는 게 큰 효과. 10 drafts/call 로 25회→3회 수준 절감.
  // - 호출 스킵 판정(듣기/sub-question)은 그대로 유지. 호출 대상만 batch.
  //
  // 단순히 "PASSAGE_BODY 블록이 없으면 스킵" 으로 하면 빈칸 추론처럼 본문이
  // QUESTION_STEM 안에 통째로 들어간 케이스도 스킵돼서 복원이 누락된다.
  // 그래서 두 조건 중 하나라도 만족하면 복원 호출:
  //   1) 그룹에 PASSAGE_BODY 블록이 명시적으로 존재
  //   2) 또는 raw text 총 길이가 400 자 이상
  const SHORT_CONTENT_THRESHOLD = 400;

  // Pre-pass: per-group metadata 계산 + skip 판정.
  interface PrepStage1 {
    index: number;
    group: M1PassageChunk[];
    rawText: string;
    sourcePageIndex: number[];
    sourceGroupIds: Set<string>;
    questions: RestorationQuestionInput[];
    problemEvidence: ReturnType<typeof buildProblemEvidenceFromItems>;
    shouldRestore: boolean;
    /** When the group was rejected by the type filter, the locally-built
     *  clean body that should replace rawText as the displayed passage.
     *  Empty when not applicable (= shouldRestore=true OR rejected for
     *  other reasons like missing passage / short content). */
    typeSkipBody: string;
    /** Question types observed in the group (UNKNOWN included). Recorded
     *  in metadata so the teacher can see why restoration was skipped. */
    questionTypes: string[];
  }
  const stage1: PrepStage1[] = groups.map((group, index) => {
    const rawText = group.map((chunk) => chunk.rawText).join("\n\n").trim();
    const sourcePageIndex = uniqueSorted(
      group.flatMap((chunk) => chunk.sourcePageIndex),
    );
    // STEM-led bucket items (= every block in this merged group). Sort by
    // global `order` so QUESTION_STEM/CHOICE neighbourship is preserved
    // across chunks that crossed a page boundary.
    const groupItems = group
      .flatMap((chunk) => chunk.items)
      .sort((a, b) => a.order - b.order);
    const sourceGroupIds = new Set(
      group
        .map((chunk) => chunk.groupId)
        .filter((groupId): groupId is string => groupId !== null),
    );
    const questions = buildRestorationQuestions(groupItems);
    const problemEvidence = buildProblemEvidenceFromItems(groupItems);
    const groupHasPassage = group.some((chunk) => chunk.hasPassageBody);
    const baseShouldRestore =
      groupHasPassage || rawText.length >= SHORT_CONTENT_THRESHOLD;

    // Question types observed in this group — used by the type filter.
    const questionTypes = groupItems
      .filter((item) => item.blockType === "QUESTION_STEM")
      .map((item) => {
        const meta = item.questionMeta as Record<string, unknown> | null;
        const analysis =
          meta?.analysis && typeof meta.analysis === "object"
            ? (meta.analysis as Record<string, unknown>)
            : null;
        return normalizeAnalysisQuestionType(analysis?.questionType);
      });
    // Restoration is required if ANY question in the group is on the
    // whitelist. UNKNOWN is treated as "required" to avoid false
    // negatives when the classifier failed. Empty list (no STEM detected
    // in this group at all) → also required, fall back to legacy path.
    const hasRestorationRequiredType =
      questionTypes.length === 0 ||
      questionTypes.some(
        (t) => RESTORATION_REQUIRED_TYPES.has(t) || t === "UNKNOWN",
      );

    const shouldRestore = TYPE_FILTERED_RESTORATION_ENABLED
      ? baseShouldRestore && hasRestorationRequiredType
      : baseShouldRestore;

    // If the type filter is the reason we're skipping, produce the
    // clean body locally so the draft is still useful in the UI.
    const skippedByTypeFilter =
      TYPE_FILTERED_RESTORATION_ENABLED &&
      baseShouldRestore &&
      !hasRestorationRequiredType;
    const typeSkipBody = skippedByTypeFilter
      ? buildCleanBodyForSkippedGroup(groupItems)
      : "";

    return {
      index,
      group,
      rawText,
      sourcePageIndex,
      sourceGroupIds,
      questions,
      problemEvidence,
      shouldRestore,
      typeSkipBody,
      questionTypes,
    };
  });

  // 호출 대상만 추려둔다. 실제 호출은 Phase A INSERT 직후에 시작.
  const restorationTargets = stage1.filter((s) => s.shouldRestore);

  // ─── Phase A: PENDING 상태로 draft 들을 즉시 INSERT ──────────────────────
  //
  // Progressive disclosure: teacher UI 는 finalize 가 끝나기를 기다리지 않고,
  // 그루핑이 완료된 시점에서 raw text 본문을 즉시 볼 수 있어야 한다. 따라서
  // 복원 호출 *전*에 모든 draft row 를 먼저 박는다.
  //   - shouldRestore == true  → restorationStatus = "PENDING" (UI 가 "복원 중"
  //     표시), restoredText = rawText (placeholder)
  //   - shouldRestore == false → 곧장 NO_RESTORATION_NEEDED (visibility filter
  //     가 stub 으로 숨김)
  // Changes / sourceMatches 는 복원 결과가 도착할 때 별도로 INSERT.
  const extractionConfidenceByOrder = new Map<number, number | null>();
  const draftIdByOrder = new Map<number, string>();
  const initialDraftRows: Prisma.ExtractionM1PassageDraftCreateManyInput[] =
    stage1.map((s) => {
      const id = randomUUID();
      draftIdByOrder.set(s.index, id);
      const confidenceValues = s.group
        .map((chunk) => chunk.confidence)
        .filter((value): value is number => typeof value === "number");
      const extractionConfidence =
        confidenceValues.length > 0
          ? confidenceValues.reduce((sum, value) => sum + value, 0) /
            confidenceValues.length
          : null;
      extractionConfidenceByOrder.set(s.index, extractionConfidence);
      const chunkWarnings = s.group.flatMap(
        (chunk) => chunk.restorationWarnings,
      );
      const pendingStatus: M1RestorationStatus = s.shouldRestore
        ? "PENDING"
        : "NO_RESTORATION_NEEDED";
      const skippedByTypeFilter = !s.shouldRestore && s.typeSkipBody.length > 0;
      // For type-filter skips we replace the displayed text with the clean
      // body (PASSAGE_BODY content with problem markers stripped). For the
      // legacy stub-skip path (no passage / too short), keep rawText so the
      // visibility filter behaves exactly as before.
      const displayedText = skippedByTypeFilter ? s.typeSkipBody : s.rawText;
      const pendingMetadata: Record<string, unknown> = {
        chunks: s.group.map((chunk) => ({
          sourcePageIndex: chunk.sourcePageIndex,
          continuesFromPrevious: chunk.continuesFromPrevious,
          continuesToNext: chunk.continuesToNext,
          boundaryConfidence: chunk.boundaryConfidence,
        })),
        questions: s.questions.map((question) => ({
          questionNumber: question.questionNumber,
          stem: question.stem,
          choices: question.choices,
        })),
        ...(s.shouldRestore
          ? { restoration: { phase: "PENDING" } }
          : skippedByTypeFilter
            ? {
                reason: "type_no_restoration_needed",
                questionTypes: s.questionTypes,
                rawLength: s.rawText.length,
              }
            : {
                reason: "no_passage_body_and_short_content",
                rawLength: s.rawText.length,
                threshold: SHORT_CONTENT_THRESHOLD,
              }),
      };
      return {
        id,
        jobId: input.jobId,
        sourceMaterialId: input.sourceMaterialId,
        passageOrder: s.index + passageOrderOffset,
        sourcePageIndex: s.sourcePageIndex,
        title: null,
        rawText: s.rawText,
        restoredText: displayedText,
        teacherText: displayedText,
        restorationStatus: pendingStatus,
        reviewStatus: "DRAFT",
        confidence: extractionConfidence,
        warnings:
          chunkWarnings.length > 0
            ? (chunkWarnings as Prisma.InputJsonValue)
            : undefined,
        metadata: pendingMetadata as Prisma.InputJsonValue,
      };
    });

  await prisma.$transaction(
    async (tx) => {
      if (clearExistingDrafts) {
        await tx.extractionM1PassageDraft.deleteMany({
          where: { jobId: input.jobId, reviewStatus: "DRAFT" },
        });
      }
      if (initialDraftRows.length > 0) {
        // `skipDuplicates: true` is the safety net for the rare double-fire
        // case where a second finalize task starts before the first one's
        // status=COMPLETED write is visible — both attempts try to insert
        // the same (jobId, passageOrder) and Prisma surfaces a unique-
        // constraint violation. With skipDuplicates the second attempt
        // silently no-ops on conflicts, the first attempt's rows remain
        // canonical, and the UI no longer reports a false "save failed".
        await tx.extractionM1PassageDraft.createMany({
          data: initialDraftRows,
          skipDuplicates: true,
        });
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  // ─── Phase B: per-batch UPDATE as restoration results arrive ────────────
  //
  // restoreM1PassageBatch 가 한 batch (= 5 drafts) 끝낼 때마다 콜백을 호출한다.
  // 각 콜백에서:
  //   1. 해당 draft row 들을 PENDING → 실제 restorationStatus 로 UPDATE
  //      (restoredText, teacherText, confidence, warnings, metadata 갱신).
  //   2. 그 draft 들의 changes / sourceMatches 를 INSERT.
  // Promise.all 안의 batch 들이 병렬 실행되므로 콜백도 병렬로 호출될 수 있다.
  // 각 콜백 내에서는 단일 row UPDATE + 보조 INSERT 만 다루고, 동일 draft 를
  // 다른 콜백이 건드릴 일은 없다 (passageOrder 단일 매핑) — 락 충돌 없음.
  let changeCount = 0;

  const applyRestorationResult = async (
    stageIndex: number,
    restoration: M1PassageRestorationResult,
  ) => {
    const draftId = draftIdByOrder.get(stageIndex);
    if (!draftId) return;
    const target = stage1[stageIndex];
    if (!target) return;

    const extractionConfidence = extractionConfidenceByOrder.get(stageIndex) ?? null;
    const restorationMetadata =
      restoration.metadata &&
      typeof restoration.metadata === "object" &&
      !Array.isArray(restoration.metadata)
        ? (restoration.metadata as Record<string, unknown>)
        : {};
    const mergedMetadata: Record<string, unknown> = {
      chunks: target.group.map((chunk) => ({
        sourcePageIndex: chunk.sourcePageIndex,
        continuesFromPrevious: chunk.continuesFromPrevious,
        continuesToNext: chunk.continuesToNext,
        boundaryConfidence: chunk.boundaryConfidence,
      })),
      questions: target.questions.map((question) => ({
        questionNumber: question.questionNumber,
        stem: question.stem,
        choices: question.choices,
      })),
      ...restorationMetadata,
    };
    const mergedWarnings = [
      ...target.group.flatMap((chunk) => chunk.restorationWarnings),
      ...restoration.warnings,
    ];

    const changeRows: Prisma.ExtractionM1PassageDraftChangeCreateManyInput[] =
      restoration.changes.map((change) => ({
        passageDraftId: draftId,
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.changeType ?? null,
        reason: change.reason ?? null,
        confidence: change.confidence ?? null,
        sourcePageIndex: target.sourcePageIndex,
      }));
    const sourceMatchRows: Prisma.ExtractionM1PassageSourceMatchCreateManyInput[] =
      restoration.sourceMatches.map((match, matchIndex) => ({
        passageDraftId: draftId,
        sourceType: match.sourceType,
        sourceId: match.sourceId ?? null,
        sourceRef: match.sourceRef ?? null,
        title: match.title,
        publisher: match.publisher ?? null,
        unit: match.unit ?? null,
        year: match.year ?? null,
        confidence: match.confidence,
        method: sourceMatchMethod(match, matchIndex),
        reason: match.reason,
        selected:
          matchIndex === 0 && match.confidence >= LOCAL_DB_EXACT_THRESHOLD,
        metadata: (match.metadata ?? {}) as Prisma.InputJsonValue,
      }));

    changeCount += changeRows.length;

    await prisma.$transaction(
      async (tx) => {
        await tx.extractionM1PassageDraft.update({
          where: { id: draftId },
          data: {
            restoredText: restoration.restoredText,
            teacherText: restoration.restoredText,
            restorationStatus: restoration.status,
            confidence: restoration.confidence ?? extractionConfidence,
            warnings:
              mergedWarnings.length > 0
                ? (mergedWarnings as Prisma.InputJsonValue)
                : undefined,
            metadata: mergedMetadata as Prisma.InputJsonValue,
          },
        });
        if (changeRows.length > 0) {
          await tx.extractionM1PassageDraftChange.createMany({
            data: changeRows,
          });
        }
        if (sourceMatchRows.length > 0) {
          await tx.extractionM1PassageSourceMatch.createMany({
            data: sourceMatchRows,
          });
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  };

  if (restorationTargets.length > 0) {
    await restoreM1PassageBatch(
      restorationTargets.map((s) => ({
        academyId: input.academyId,
        rawText: s.rawText,
        questions: s.questions,
        problemEvidence: s.problemEvidence,
      })),
      {
        onBatchComplete: async (inputIndices, batchResults) => {
          for (let i = 0; i < inputIndices.length; i += 1) {
            const target = restorationTargets[inputIndices[i]];
            if (!target) continue;
            try {
              await applyRestorationResult(target.index, batchResults[i]);
            } catch (err) {
              logger.warn("m1 draft incremental update failed", {
                jobId: input.jobId,
                passageOrder: target.index,
                err: err instanceof Error ? err.message : String(err),
              });
            }
          }
        },
      },
    );
  }

  return { draftCount: groups.length, changeCount };
}

interface EnsureSourceMaterialInput {
  jobId: string;
  academyId: string;
  createdById: string;
  mode: ExtractionMode;
  filename: string | null;
  page1Text: string;
  allTexts: string[];
  examMetaSignals?: Array<{ content: string; meta: unknown }>;
}

/**
 * Create (or reuse) a SourceMaterial record for this job.
 *
 * Re-runs of finalize are possible (retries, reaper) so we:
 *   1. If job.sourceMaterialId already set → reuse it (no-op).
 *   2. Else compute contentHash and look up any existing SourceMaterial with
 *      the same hash under the same academy. Reuse on match.
 *   3. Else create a new row.
 */
async function ensureSourceMaterial(
  input: EnsureSourceMaterialInput,
): Promise<string | null> {
  const existing = await prisma.extractionJob.findUnique({
    where: { id: input.jobId },
    select: { sourceMaterialId: true },
  });
  if (existing?.sourceMaterialId) return existing.sourceMaterialId;

  const joinedHeaderText = [
    input.page1Text,
    ...(input.examMetaSignals ?? []).map((s) => s.content),
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = parseSourceMeta({
    filename: input.filename ?? undefined,
    page1Text: joinedHeaderText,
  });

  const contentHash = computeContentHash(input.allTexts);

  // De-dupe by (academyId, contentHash)
  const dup = await prisma.sourceMaterial.findFirst({
    where: { academyId: input.academyId, contentHash },
    select: { id: true },
  });
  if (dup) return dup.id;

  // Pick SourceMaterial.type — prefer parsed.type, else infer from mode.
  const materialType =
    parsed.type ?? (input.mode === "FULL_EXAM" ? "EXAM" : "OTHER");

  const created = await prisma.sourceMaterial.create({
    data: {
      academyId: input.academyId,
      createdById: input.createdById,
      type: materialType,
      title: parsed.title,
      subject: parsed.subject ?? "ENGLISH",
      grade: parsed.grade ?? null,
      semester: parsed.semester ?? null,
      year: parsed.year ?? null,
      round: parsed.round ?? null,
      examType: parsed.examType ?? null,
      publisher: parsed.publisher ?? null,
      contentHash,
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * Cluster-scoped SourceMaterial creation. Used when a single job contains
 * multiple test booklets (cluster > 1) — each cluster gets its own fresh
 * SourceMaterial, independent of the job-level `extractionJob.sourceMaterialId`
 * link.
 *
 * Mirrors `ensureSourceMaterial`'s behaviour for cluster 1: each job's
 * cluster gets its own row, with no cross-job dedup. Previously this helper
 * matched existing SourceMaterials by `(academyId, contentHash)` so the same
 * booklet uploaded across multiple jobs would collapse into a single row —
 * but that asymmetry surprised users (cluster 1 = per-job, cluster 2 =
 * shared) and made the "전체 자료" view show one cluster's drafts ballooning
 * to N × per-job-count as more jobs piled up. Dedup removed; data
 * deduplication is a teacher-side concern in the review UI.
 */
async function ensureClusterSourceMaterial(
  input: EnsureSourceMaterialInput,
): Promise<string | null> {
  const joinedHeaderText = [
    input.page1Text,
    ...(input.examMetaSignals ?? []).map((s) => s.content),
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = parseSourceMeta({
    filename: input.filename ?? undefined,
    page1Text: joinedHeaderText,
  });

  const contentHash = computeContentHash(input.allTexts);

  // The DB enforces a `(academyId, contentHash)` unique key on
  // source_materials. Per-job suffix so this helper doesn't collide with
  // the same booklet uploaded under a different job (= per-job
  // SourceMaterials, no cross-job dedup).
  const perJobContentHash = `${contentHash}:job:${input.jobId}`;

  // Idempotent retry guard: trigger.dev may re-run extractionFinalizeTask
  // (transient errors, leases). On the second run the cluster loop calls
  // this helper again with the SAME perJobContentHash; if the first run
  // already created the row, the INSERT below would throw
  // `Unique constraint failed on (academyId, contentHash)` and the
  // outer catch would mark the job as errored even though the row exists.
  // findFirst → reuse on hit avoids that.
  const existing = await prisma.sourceMaterial.findFirst({
    where: { academyId: input.academyId, contentHash: perJobContentHash },
    select: { id: true },
  });
  if (existing) return existing.id;

  const materialType =
    parsed.type ?? (input.mode === "FULL_EXAM" ? "EXAM" : "OTHER");
  const created = await prisma.sourceMaterial.create({
    data: {
      academyId: input.academyId,
      createdById: input.createdById,
      type: materialType,
      title: parsed.title,
      subject: parsed.subject ?? "ENGLISH",
      grade: parsed.grade ?? null,
      semester: parsed.semester ?? null,
      year: parsed.year ?? null,
      round: parsed.round ?? null,
      examType: parsed.examType ?? null,
      publisher: parsed.publisher ?? null,
      contentHash: perJobContentHash,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Group snapshotItems by their cluster assignment from page-ordering.
 * Items are sorted within each cluster by `(orderRank, item.order)` so
 * downstream STEM-led grouping sees pages in their corrected order.
 */
function groupSnapshotItemsByCluster(
  snapshotItems: ExtractionItemSnapshot[],
  ordering: { clusterIdByPageIndex: Map<number, string>; orderRank: Map<number, number> },
): Map<string, ExtractionItemSnapshot[]> {
  const byCluster = new Map<string, ExtractionItemSnapshot[]>();
  for (const item of snapshotItems) {
    const pIdx = item.sourcePageIndex[0] ?? 0;
    const clusterId = ordering.clusterIdByPageIndex.get(pIdx);
    if (!clusterId) continue;
    const list = byCluster.get(clusterId);
    if (list) list.push(item);
    else byCluster.set(clusterId, [item]);
  }
  // Sort each cluster's items by orderRank (page-level) then original order
  // (in-page sequence). This is what the STEM-led grouping needs.
  for (const [, list] of byCluster) {
    list.sort((a, b) => {
      const pa = ordering.orderRank.get(a.sourcePageIndex[0] ?? 0) ?? 0;
      const pb = ordering.orderRank.get(b.sourcePageIndex[0] ?? 0) ?? 0;
      if (pa !== pb) return pa - pb;
      return a.order - b.order;
    });
  }
  return byCluster;
}

/**
 * Build the per-page meta summaries that page-ordering needs. Reads from
 * the snapshot items (post-snapshot, so it sees every item's `examMeta`
 * unioned per page) and from the original ExtractionPage rows when those
 * carry a structured pageMeta column.
 */
function collectPageMetaSummaries(
  snapshotItems: ExtractionItemSnapshot[],
  pageRows: Array<{ pageIndex: number; pageMeta?: unknown }>,
): PageMetaSummary[] {
  const itemsByPage = new Map<number, ExtractionItemSnapshot[]>();
  for (const item of snapshotItems) {
    const pIdx = item.sourcePageIndex[0] ?? 0;
    const list = itemsByPage.get(pIdx);
    if (list) list.push(item);
    else itemsByPage.set(pIdx, [item]);
  }
  const pageMetaByPage = new Map<number, unknown>();
  for (const row of pageRows) {
    if (row.pageMeta) pageMetaByPage.set(row.pageIndex, row.pageMeta);
  }
  // Union all `examMeta` carriers on a page into one merged object —
  // EXAM_META blocks plus the first-item carrier we stamp on EXAM-META-less
  // pages in extraction-page.ts.
  const allPageIndexes = new Set<number>([
    ...itemsByPage.keys(),
    ...pageMetaByPage.keys(),
  ]);
  const summaries: PageMetaSummary[] = [];
  for (const pageIndex of allPageIndexes) {
    const items = itemsByPage.get(pageIndex) ?? [];
    const examMetaMerge: Record<string, unknown> = {};
    for (const item of items) {
      if (item.examMeta && typeof item.examMeta === "object" && !Array.isArray(item.examMeta)) {
        Object.assign(examMetaMerge, item.examMeta as Record<string, unknown>);
      }
    }
    summaries.push(
      summarisePageMeta({
        pageIndex,
        pageMeta: pageMetaByPage.get(pageIndex) ?? null,
        examMetaFromItems: examMetaMerge,
        items,
      }),
    );
  }
  summaries.sort((a, b) => a.pageIndex - b.pageIndex);
  return summaries;
}
