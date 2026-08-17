import { logger } from "@trigger.dev/sdk/v3";
import {
  InsufficientCreditsError,
  deductCredits,
} from "@/lib/credits";
import type { ExtractionMode } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import type { ClaimedPageRow } from "./claim-lease";

export class PageOutOfCreditsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageOutOfCreditsError";
  }
}

/**
 * Phase B: Deduct credits — idempotent against crash between deductCredits()
 * returning and `extractionPage.creditTxId` landing on disk.
 *
 * Strategy:
 *   1. If the page row already has `creditTxId`, reuse it (most retries).
 *   2. Otherwise scan CreditTransaction for `metadata.idempotencyKey =
 *      jobId:pageIndex` on CONSUMPTION rows — this recovers from the
 *      WRITE-WRITE gap above.
 *   3. Only when both fail, call deductCredits() and persist creditTxId.
 *
 * Throws `PageOutOfCreditsError` when the academy is out of credits — the
 * caller is responsible for marking the page DEAD and decrementing pendingPages.
 * All other failures propagate as-is.
 */
export async function ensurePageCharged(params: {
  page: ClaimedPageRow;
  idempotencyKey: string;
  jobId: string;
  pageIndex: number;
  mode: ExtractionMode;
}): Promise<string> {
  const { page, idempotencyKey, jobId, pageIndex, mode } = params;
  let creditTxId = page.creditTxId;

  if (!creditTxId) {
    const priorCharge = await prisma.creditTransaction.findFirst({
      where: {
        academyId: page.job.academyId,
        type: "CONSUMPTION",
        operationType: "TEXT_EXTRACTION",
        metadata: { contains: `"idempotencyKey":"${idempotencyKey}"` },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (priorCharge) {
      creditTxId = priorCharge.id;
      await prisma.extractionPage.update({
        where: { idempotencyKey },
        data: { creditTxId },
      });
      logger.info("credit deduction recovered from prior crash", {
        idempotencyKey,
        creditTxId,
      });
    }
  }

  if (creditTxId) return creditTxId;

  try {
    const r = await deductCredits(
      page.job.academyId,
      "TEXT_EXTRACTION",
      page.job.createdById,
      {
        jobId,
        pageIndex,
        bulkExtractionJob: true,
        mode,
        // Stamp the idempotency marker INSIDE metadata so the pre-scan
        // above can find it next time.
        idempotencyKey,
      },
    );
    creditTxId = r.transactionId;
    await prisma.extractionPage.update({
      where: { idempotencyKey },
      data: { creditTxId },
    });
    return creditTxId;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      throw new PageOutOfCreditsError(err.message);
    }
    throw err;
  }
}
