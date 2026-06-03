import { logger } from "@trigger.dev/sdk/v3";
import type {
  ExtractionItemSnapshot,
  ExtractionMode,
} from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import { buildPageOrdering } from "../../page-ordering";
import {
  collectPageMetaSummaries,
  groupSnapshotItemsByCluster,
} from "../cluster-helpers";
import { persistM1PassageDrafts } from "../m1-drafts/persist";
import { ensureClusterSourceMaterial } from "../source-material";

/**
 * PASSAGE_ONLY cluster loop. Reads OCR-detected page numbers / exam codes
 * to recover mixed-up uploads and multi-test jobs, then runs the M1 draft
 * pipeline per cluster.
 *
 * Phase A (deleteMany + initial INSERTs) is serial per cluster so passageOrder
 * stays contiguous. Phase B (grounded restoration) is detached via
 * `deferRestoration: true` and joined at the end — a 3-cluster job collapses
 * 3× serial restoration into a single wall-clock window bounded by the
 * slowest cluster.
 *
 * The first cluster reuses the job-level `sourceMaterialId`; subsequent
 * clusters get their own via `ensureClusterSourceMaterial`.
 */
export async function runPassageOnlyClusterLoop(params: {
  jobId: string;
  academyId: string;
  createdById: string;
  mode: ExtractionMode;
  /** P7-D2: "verbatim"이면 복원 스킵. */
  outputMode: string | null;
  originalFileName: string | null;
  sourceMaterialId: string | null;
  snapshotItems: ExtractionItemSnapshot[];
  pages: Array<{ pageIndex: number; pageMeta?: unknown }>;
}): Promise<void> {
  const {
    jobId,
    academyId,
    createdById,
    mode,
    outputMode,
    originalFileName,
    sourceMaterialId,
    snapshotItems,
    pages,
  } = params;

  try {
    // ── Page reordering + cluster detection ─────────────────────────
    const pageMetaSummaries = collectPageMetaSummaries(snapshotItems, pages);
    const ordering = buildPageOrdering({ pageMetas: pageMetaSummaries });
    const clusters = ordering.clusters;
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

    const itemsByCluster = groupSnapshotItemsByCluster(snapshotItems, ordering);

    let totalDraftCount = 0;
    let totalChangeCount = 0;
    let clearedOnce = false;
    const restorationPromises: Promise<number>[] = [];

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
          academyId,
          createdById,
          mode,
          filename: originalFileName,
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
        academyId,
        outputMode,
        sourceMaterialId: clusterSourceMaterialId,
        items: clusterItems,
        passageOrderOffset: totalDraftCount,
        // Only the first non-empty cluster wipes existing DRAFT rows.
        // Subsequent clusters append to the same job's draft list so
        // earlier-cluster results aren't clobbered.
        clearExistingDrafts: !clearedOnce,
        deferRestoration: true,
      });
      clearedOnce = true;
      totalDraftCount += result.draftCount;
      totalChangeCount += result.changeCount;
      if (result.restorationPromise) {
        restorationPromises.push(result.restorationPromise);
      }
    }

    // Phase B join: wait for every cluster's restoration to finish. Each
    // cluster's promise resolves to its changeCount so we can accumulate.
    // Use `allSettled` rather than `all` so a single cluster's restoration
    // failure (network, model error, etc.) doesn't poison the others — the
    // surviving clusters still get their drafts updated and the failure is
    // logged. The cluster-level retry path inside restoreM1PassageBatch
    // already handles per-batch fallbacks, so reaching this catch means
    // the entire batch dispatch threw, which is rare.
    if (restorationPromises.length > 0) {
      const settled = await Promise.allSettled(restorationPromises);
      for (let i = 0; i < settled.length; i += 1) {
        const r = settled[i];
        if (r.status === "fulfilled") {
          totalChangeCount += r.value;
        } else {
          logger.error("m1 cluster restoration failed", {
            jobId,
            clusterIndex: i,
            err: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      }
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
}
