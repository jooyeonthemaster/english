// ============================================================================
// extraction-page — atomic "one page = one Gemini call" worker.
//
// Enforces the 3-way idempotency contract:
//   1. Trigger.dev idempotencyKey (set by the orchestrator)   → dedupes dispatch
//   2. DB leaseOwner+leaseExpiresAt + conditional UPDATE       → dedupes execution
//   3. ExtractionPage.creditTxId                               → dedupes billing
//
// Retry semantics:
//   - Retryable errors (GEMINI_RATE_LIMIT, SERVER, TIMEOUT, NETWORK, EMPTY_OUTPUT,
//     PARSE_ERROR) → throw → Trigger.dev backoff-retries the same run (same
//     creditTxId reused). Before every retry we wipe any ExtractionItem rows
//     created by the previous attempt on this page so structured runs do not
//     double-emit blocks.
//   - Permanent errors (GEMINI_AUTH, INVALID_IMAGE, SAFETY_BLOCKED,
//     INSUFFICIENT_CREDITS) → mark page DEAD, refund credits if charged, return.
//
// Mode routing:
//   - M1 PASSAGE_ONLY / M2 QUESTION_SET / M4 FULL_EXAM: structured JSON block
//     OCR. Each block becomes one ExtractionItem row; extractedText is the
//     concatenation of all block contents (so legacy readers still work).
//   - M3 EXPLANATION: falls back to plain OCR for now (feature gated off).
//
// Billing-idempotency invariant (critical):
//   Between `deductCredits` returning and `extractionPage.creditTxId` being
//   persisted there is a WRITE-WRITE gap. A crash in that gap would otherwise
//   leak a charge on retry. We defend with a two-step pre-check:
//     (1) scan CreditTransaction for `metadata.idempotencyKey = jobId:pageIndex`
//         on CONSUMPTION rows before calling deductCredits;
//     (2) if found, reuse that transactionId and skip deduction entirely.
//   We additionally stamp `metadata.idempotencyKey` on every deduction so the
//   scan is reliable even if the page row was wiped and re-created.
// ============================================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import { classifyGeminiError } from "@/lib/extraction/error-classifier";
import {
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
  buildStructuredOcrSystemPrompt,
  buildOcrSystemPrompt,
  buildOcrUserPrompt,
  type StructuredOcrResponse,
} from "@/lib/extraction/ocr-prompt";
import { downloadAsBuffer } from "@/lib/supabase-storage";
import {
  PAGE_LEASE_DURATION_MS,
  GEMINI_CONCURRENCY_LIMIT,
  MAX_PAGE_ATTEMPTS,
} from "@/lib/extraction/constants";
import type { ExtractionMode } from "@/lib/extraction/types";
import { usesStructuredExtraction } from "@/lib/extraction/modes";
import { extractionFinalizeTask } from "./extraction-finalize";
import {
  generatePlainOcrWithTriggerFetch,
  generateStructuredOcrWithTriggerFetch,
} from "./_lib/gemini-ocr";

type Input = { jobId: string; pageIndex: number; mode?: ExtractionMode };

const GEMINI_CALL_TIMEOUT_MS = 90_000;
const STORAGE_DOWNLOAD_TIMEOUT_MS = 30_000;

// Gemini HTTP calls are delegated to ./_lib/gemini-ocr. That module uses
// Trigger.dev's retry.fetch timeout support so page workers do not depend on
// native fetch abort behaviour in the managed runtime.

/** Convert 1..5 → ①..⑤. Returns null for out-of-range or null input. */
function encodeCircled(index: number | null | undefined): string | null {
  if (index == null) return null;
  const map: Record<number, string> = {
    1: "①",
    2: "②",
    3: "③",
    4: "④",
    5: "⑤",
    6: "⑥",
    7: "⑦",
    8: "⑧",
    9: "⑨",
  };
  return map[index] ?? null;
}

class OperationTimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`${operationName} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

async function withTimeout<T>(
  operationName: string,
  timeoutMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new OperationTimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function markProcessingPhase(
  idempotencyKey: string,
  phase: string,
): Promise<void> {
  try {
    await prisma.extractionPage.update({
      where: { idempotencyKey },
      data: { errorMessage: `[processing] ${phase}` },
    });
  } catch (err) {
    logger.warn("failed to mark extraction phase", {
      idempotencyKey,
      phase,
      err: String(err),
    });
  }
}

function getErrorDebugMessage(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`.slice(0, 500);
  }
  return String(err).slice(0, 500);
}

type StructuredOcrBlock = StructuredOcrResponse["blocks"][number];

function buildExtractionItemRows(params: {
  jobId: string;
  pageId: string;
  pageIndex: number;
  structured: StructuredOcrResponse;
}): Prisma.ExtractionItemCreateManyInput[] {
  const { jobId, pageId, pageIndex, structured } = params;

  return structured.blocks.map((b: StructuredOcrBlock, i: number) => {
    const sharedPassageRange =
      typeof b.sharedPassageRange === "string" &&
      b.sharedPassageRange.trim().length > 0
        ? b.sharedPassageRange.trim()
        : null;

    const questionMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "QUESTION_STEM"
        ? {
            number: b.questionNumber ?? null,
            sharedPassageRange,
          }
        : undefined;
    const choiceMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "CHOICE"
        ? {
            index: b.choiceIndex ?? null,
            label: encodeCircled(b.choiceIndex ?? undefined),
            isAnswer: b.isAnswer ?? false,
          }
        : undefined;
    const examMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "EXAM_META"
        ? ((structured.pageMeta ?? {}) as Prisma.InputJsonValue)
        : undefined;
    const passageMeta: Prisma.InputJsonValue | undefined =
      b.blockType === "PASSAGE_BODY"
        ? {
            wordCount: b.content.split(/\s+/).filter(Boolean).length,
            markerDetected: sharedPassageRange !== null,
            questionRange: sharedPassageRange,
          }
        : undefined;

    return {
      jobId,
      pageId,
      sourcePageIndex: [pageIndex],
      blockType: b.blockType,
      content: b.content,
      rawText: b.content,
      confidence: b.confidence ?? null,
      order: pageIndex * 1000 + i,
      localOrder: null,
      questionMeta,
      choiceMeta,
      examMeta,
      passageMeta,
      needsReview: (b.confidence ?? 1) < 0.7,
      status: "DRAFT",
      groupId: null,
      parentItemId: null,
    };
  });
}

async function persistPageSuccess(params: {
  idempotencyKey: string;
  jobId: string;
  pageId: string;
  pageIndex: number;
  extractedText: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  latencyMs: number;
  structured: StructuredOcrResponse | undefined;
}): Promise<void> {
  const {
    idempotencyKey,
    jobId,
    pageId,
    pageIndex,
    extractedText,
    inputTokens,
    outputTokens,
    latencyMs,
    structured,
  } = params;
  const itemRows = structured
    ? buildExtractionItemRows({ jobId, pageId, pageIndex, structured })
    : [];
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.extractionPage.update({
      where: { idempotencyKey },
      data: {
        status: "SUCCESS",
        extractedText,
        modelUsed: "gemini-3-flash-preview",
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
        latencyMs,
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
      },
    }),
  ];

  if (itemRows.length > 0) {
    operations.push(prisma.extractionItem.createMany({ data: itemRows }));
  }

  operations.push(
    prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        successPages: { increment: 1 },
        pendingPages: { decrement: 1 },
        creditsConsumed: { increment: CREDIT_COSTS.TEXT_EXTRACTION },
      },
    }),
  );

  await prisma.$transaction(operations);
}

export const extractionPageTask = task({
  id: "extraction-page",
  queue: { name: "gemini-calls", concurrencyLimit: GEMINI_CONCURRENCY_LIMIT },
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
    const leaseExpiresAt = new Date(Date.now() + PAGE_LEASE_DURATION_MS);

    // ─── (A) Acquire lease + wipe retry crumbs in ONE transaction ─────────
    // Conditional UPDATE: only succeed if the row is PENDING, FAILED (for
    // retries), PROCESSING by this same Trigger run (attempt retry), or
    // PROCESSING with an expired lease (crashed worker).
    //
    // (A-fix P0-3) We MUST wipe leftover ExtractionItem rows from a prior
    // attempt in the SAME transaction as the lease claim. Splitting them
    // across two calls opened a crash window where a retry could end up with
    // duplicate blocks (claim succeeds → crash → retry re-claims after lease
    // expiry → deleteMany still needed because original attempt wrote
    // partial blocks between lease-claim #1 and crash). Atomic now.
    //
    // ReturnType: the tx returns the post-claim page row so we avoid a
    // separate SELECT on the hot path. If claim failed → returns null.
    const pageAfterClaim = await prisma.$transaction(async (tx) => {
      const claimed = await tx.extractionPage.updateMany({
        where: {
          idempotencyKey,
          OR: [
            { status: "PENDING" },
            { status: "FAILED" },
            { status: "PROCESSING", leaseOwner },
            { status: "PROCESSING", leaseExpiresAt: { lt: new Date() } },
          ],
        },
        data: {
          status: "PROCESSING",
          leaseOwner,
          leaseExpiresAt,
          startedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count === 0) return null;

      const row = await tx.extractionPage.findUnique({
        where: { idempotencyKey },
        include: {
          job: {
            select: {
              academyId: true,
              createdById: true,
              mode: true,
              totalPages: true,
            },
          },
        },
      });
      if (!row) {
        throw new Error(`page row missing after claim: ${idempotencyKey}`);
      }

      // Retry-safety: wipe any ExtractionItem rows left over from an earlier
      // attempt on THIS page. Plain-text M1 never writes items so this is a
      // no-op for M1 jobs; for M2/M4 it's what prevents duplicate blocks on
      // retry. Atomic with the lease claim → zero-gap.
      await tx.extractionItem.deleteMany({ where: { pageId: row.id } });

      return row;
    });

    if (!pageAfterClaim) {
      const current = await prisma.extractionPage.findUnique({
        where: { idempotencyKey },
        select: { status: true },
      });
      logger.info("page skipped (not claimable)", {
        idempotencyKey,
        currentStatus: current?.status,
      });
      return { skipped: true, status: current?.status };
    }

    const page = pageAfterClaim;

    // (P1-1) Prefer mode from payload (populated by orchestrator). Only fall
    // back to the per-page job.mode join if the orchestrator predates this
    // change and left mode undefined. Saves one SELECT per page at scale.
    const mode: ExtractionMode =
      payload.mode ?? (page.job.mode as ExtractionMode) ?? "PASSAGE_ONLY";
    const isStructured = usesStructuredExtraction(mode);

    // ─── (B) Deduct credits (skip if already charged) ─────────────────────
    //
    // (P0-4) Race-hardening: there is still a narrow crash window between a
    // successful deductCredits() and `page.creditTxId = <tx.id>` landing on
    // disk. If we retried after that crash, we would re-charge. Defend with
    // a pre-scan of CreditTransaction rows whose metadata JSON string
    // contains our idempotencyKey marker. If found, reuse. Scan is O(log n)
    // via (academyId, operationType) index + filter on the text field.
    //
    // metadata is stored as `String? @db.Text` holding JSON.stringify(), so
    // we match against the serialized form directly. Unique per-page
    // because idempotencyKey = `${jobId}:${pageIndex}`.
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
    if (!creditTxId) {
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
            // (P0-4) Stamp the idempotency marker INSIDE metadata so the
            // pre-scan above can find it next time.
            idempotencyKey,
          },
        );
        creditTxId = r.transactionId;
        await prisma.extractionPage.update({
          where: { idempotencyKey },
          data: { creditTxId },
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          await prisma.$transaction(async (tx) => {
            await tx.extractionPage.update({
              where: { idempotencyKey },
              data: {
                status: "DEAD",
                errorCode: "INSUFFICIENT_CREDITS",
                errorMessage: err.message,
                leaseOwner: null,
                leaseExpiresAt: null,
                completedAt: new Date(),
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
          return { error: "INSUFFICIENT_CREDITS" as const };
        }
        throw err;
      }
    }

    // ─── (C) Fetch image + call Gemini ───────────────────────────────────
    const startTs = Date.now();
    let extractedText = "";
    let structured: StructuredOcrResponse | null = null;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      await markProcessingPhase(idempotencyKey, "storage_download");
      const bytes = await withTimeout(
        "storage download",
        STORAGE_DOWNLOAD_TIMEOUT_MS,
        () => downloadAsBuffer(page.imageUrl),
      );
      const base64 = bytes.toString("base64");
      const mimeType = "image/jpeg";

      const systemPrompt = isStructured
        ? buildStructuredOcrSystemPrompt(mode)
        : mode === "PASSAGE_ONLY"
          ? OCR_SYSTEM_PROMPT
          : buildOcrSystemPrompt(mode);
      const userPrompt = isStructured
        ? buildOcrUserPrompt(mode, pageIndex, page.job.totalPages)
        : mode === "PASSAGE_ONLY"
          ? OCR_USER_PROMPT
          : buildOcrUserPrompt(mode, pageIndex, page.job.totalPages);

      await markProcessingPhase(idempotencyKey, "gemini_call");
      if (isStructured) {
        const result = await generateStructuredOcrWithTriggerFetch({
          systemPrompt,
          userPrompt,
          mimeType,
          base64,
          timeoutInMs: GEMINI_CALL_TIMEOUT_MS,
        });
        structured = result.object;
        const usage = result.usage;
        inputTokens = usage?.inputTokens;
        outputTokens = usage?.outputTokens;
        extractedText = structured.blocks
          .map((b) => b.content)
          .filter((c) => c && c.length > 0)
          .join("\n\n");
        if (structured.blocks.length === 0) {
          const emptyErr = new Error("Structured OCR returned 0 blocks");
          (emptyErr as Error & { code?: string }).code = "EMPTY_OUTPUT";
          throw emptyErr;
        }
      } else {
        const result = await generatePlainOcrWithTriggerFetch({
          systemPrompt,
          userPrompt,
          mimeType,
          base64,
          timeoutInMs: GEMINI_CALL_TIMEOUT_MS,
        });
        inputTokens = result.usage?.inputTokens;
        outputTokens = result.usage?.outputTokens;
        extractedText = result.text;
      }
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
        // retry itself fails. creditTxId is preserved so retry doesn't
        // double-charge.
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
      if (creditTxId) {
        try {
          await refundCredits(
            page.job.academyId,
            "TEXT_EXTRACTION",
            creditTxId,
            `Page ${pageIndex} permanent fail: ${classified.code}`,
          );
          await prisma.extractionJob.update({
            where: { id: jobId },
            data: {
              creditsRefunded: { increment: CREDIT_COSTS.TEXT_EXTRACTION },
            },
          });
        } catch (refundErr) {
          logger.error("refund failed", { idempotencyKey, err: String(refundErr) });
        }
      }
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
      structured: isStructured && structured ? structured : undefined,
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

/** If every page is terminal, fire the finalize task.
 *  `extractionFinalizeTask` is itself idempotent — double-triggering is safe. */
async function maybeTriggerFinalize(jobId: string): Promise<void> {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: { status: true, pendingPages: true, totalPages: true, successPages: true, failedPages: true },
  });
  if (!job) return;
  if (job.status !== "PROCESSING") return;
  if (job.pendingPages > 0) return;

  await extractionFinalizeTask.trigger(
    { jobId },
    { idempotencyKey: `finalize:${jobId}:${job.successPages}:${job.failedPages}` },
  );
}
