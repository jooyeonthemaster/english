// ============================================================================
// extraction-page — atomic "one page = one Gemini call" worker.
//
// Enforces the 3-way idempotency contract:
//   1. Trigger.dev idempotencyKey (set by the orchestrator)   → dedupes dispatch
//   2. DB leaseOwner+leaseExpiresAt + conditional UPDATE       → dedupes execution
//   3. ExtractionPage status guard                              → dedupes writes
//
// Retry semantics:
//   - Retryable errors (GEMINI_RATE_LIMIT, SERVER, TIMEOUT, NETWORK, EMPTY_OUTPUT,
//     PARSE_ERROR) → throw → Trigger.dev backoff-retries the same run (same
//     Before every retry we wipe any ExtractionItem rows created by the previous
//     attempt on this page so structured runs do not double-emit blocks.
//   - Permanent errors (GEMINI_AUTH, INVALID_IMAGE, SAFETY_BLOCKED)
//     mark page DEAD and return.
//
// Mode routing:
//   - M1 PASSAGE_ONLY / M2 QUESTION_SET / M4 FULL_EXAM: structured JSON block
//     OCR. Each block becomes one ExtractionItem row; extractedText is the
//     concatenation of all block contents (so legacy readers still work).
//   - M3 EXPLANATION: falls back to plain OCR for now (feature gated off).
//
// Billing-idempotency invariant (critical):
// Billing:
//   Pure OCR / Document AI transcription is free. This worker does not deduct
//   credits. AI restoration is charged later at the M1 passage-draft stage.
// ============================================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import {
  EXTRACTION_PAGE_QUEUE_CONCURRENCY,
  EXTRACTION_PAGE_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { MAX_PAGE_ATTEMPTS } from "@/lib/extraction/constants";
import { classifyGeminiError } from "@/lib/extraction/error-classifier";
import type { ExtractionMode } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import { claimPageLease } from "./_lib/extraction-page/claim-lease";
import {
  getErrorDebugMessage,
} from "./_lib/extraction-page/helpers";
import { maybeTriggerFinalize } from "./_lib/extraction-page/maybe-finalize";
import { runOcrForPage } from "./_lib/extraction-page/ocr-dispatch";
import { persistPageSuccess } from "./_lib/extraction-page/persist-success";

type Input = { jobId: string; pageIndex: number; mode?: ExtractionMode };

export const extractionPageTask = task({
  id: "extraction-page",
  queue: {
    name: EXTRACTION_PAGE_QUEUE_NAME,
    concurrencyLimit: EXTRACTION_PAGE_QUEUE_CONCURRENCY,
  },
  retry: {
    maxAttempts: MAX_PAGE_ATTEMPTS,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  async run(payload: Input, { ctx }) {
    const { jobId, pageIndex } = payload;
    const idempotencyKey = `${jobId}:${pageIndex}`;
    const leaseOwner = ctx.run.id;

    // ─── (A) Acquire lease + wipe retry crumbs ────────────────────────────
    const claim = await claimPageLease({ idempotencyKey, leaseOwner });
    if (claim.skipped) {
      return { skipped: true, status: claim.currentStatus };
    }
    const page = claim.page;

    // (P1-1) Prefer mode from payload (populated by orchestrator). Only fall
    // back to the per-page job.mode join if the orchestrator predates this
    // change and left mode undefined. Saves one SELECT per page at scale.
    const mode: ExtractionMode =
      payload.mode ?? (page.job.mode as ExtractionMode) ?? "PASSAGE_ONLY";

    // ─── (C) Fetch image + call OCR ───────────────────────────────────────
    const startTs = Date.now();
    let extractedText: string;
    let structured: Awaited<ReturnType<typeof runOcrForPage>>["structured"] = null;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let modelUsed: string | undefined;

    try {
      const ocrResult = await runOcrForPage({
        idempotencyKey,
        imageUrl: page.imageUrl,
        mode,
        // P7-D2: 잡이 verbatim("그대로 추출")이면 Gemini 없이 Document AI만.
        outputMode: page.job.outputMode,
        pageIndex,
        totalPages: page.job.totalPages,
      });
      extractedText = ocrResult.extractedText;
      structured = ocrResult.structured;
      inputTokens = ocrResult.inputTokens;
      outputTokens = ocrResult.outputTokens;
      modelUsed = ocrResult.modelUsed;
    } catch (err) {
      const classified = classifyGeminiError(err);
      const debugMessage = getErrorDebugMessage(err);
      logger.warn("page extraction error", {
        idempotencyKey,
        mode,
        code: classified.code,
        retryable: classified.retryable,
        attemptCount: page.attemptCount + 1,
        error: debugMessage,
      });

      if (classified.retryable && page.attemptCount + 1 < page.maxAttempts) {
        // Release lease + mark FAILED so reaper can re-dispatch if Trigger
        // retry itself fails.
        await prisma.extractionPage.update({
          where: { idempotencyKey },
          data: {
            status: "FAILED",
            errorCode: classified.code,
            errorMessage: `${classified.userMessage}\n${debugMessage}`,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        throw err; // Trigger.dev re-queues with backoff
      }

      // Terminal → DEAD + refund
      await prisma.$transaction(async (tx) => {
        await tx.extractionPage.update({
          where: { idempotencyKey },
          data: {
            status: "DEAD",
            errorCode: classified.code,
            errorMessage: `${classified.userMessage}\n${debugMessage}`,
            completedAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        await tx.extractionJob.update({
          where: { id: jobId },
          data: {
            failedPages: { increment: 1 },
            pendingPages: { decrement: 1 },
          },
        });
      });
      await maybeTriggerFinalize(jobId);
      return { error: classified.code };
    }

    // ─── (D) Success: persist + release lease + bump job counters ─────────
    const latencyMs = Date.now() - startTs;
    await persistPageSuccess({
      idempotencyKey,
      jobId,
      pageId: page.id,
      pageIndex: page.pageIndex,
      extractedText,
      inputTokens,
      outputTokens,
      latencyMs,
      structured: structured ?? undefined,
      modelUsed,
    });

    logger.info("page success", {
      idempotencyKey,
      mode,
      latencyMs,
      chars: extractedText.length,
      blockCount: structured?.blocks.length ?? 0,
    });

    await maybeTriggerFinalize(jobId);
    return {
      success: true as const,
      charCount: extractedText.length,
      blockCount: structured?.blocks.length ?? 0,
      latencyMs,
    };
  },
});
