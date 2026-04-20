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
//   - M1 PASSAGE_ONLY: classic plain-text OCR. extractedText stored as-is.
//   - M2 QUESTION_SET / M4 FULL_EXAM: STRUCTURED_OCR_SYSTEM_PROMPT + JSON block
//     response. Each block becomes one ExtractionItem row; extractedText is
//     the concatenation of all block contents (so legacy readers still work).
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
import { generateText, generateObject, NoObjectGeneratedError } from "ai";
import type { Prisma } from "@prisma/client";
import { model } from "@/lib/ai";
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
  OCR_GENERATION_CONFIG,
  sanitizeOcrOutput,
  STRUCTURED_OCR_SYSTEM_PROMPT,
  structuredOcrResponseSchema,
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
import { extractionFinalizeTask } from "./extraction-finalize";

type Input = { jobId: string; pageIndex: number; mode?: ExtractionMode };

// ─── JSON-forced model for M2/M4 ──────────────────────────────────────────
// (P0 FIX — 2026-04)
// Previously we used `generateText()` + `wrapLanguageModel(defaultSettingsMiddleware)`
// to inject `responseFormat: {type:"json"}`. That is a known Vercel AI SDK
// footgun: `generateText()` unconditionally overrides `responseFormat` with
// `{type:"text"}` (from its default text Output), and `defaultSettingsMiddleware`
// merges in the wrong order so the override wins. Gemini ends up with
// `responseMimeType === undefined` → replies in prose → `sanitizeStructuredJson`
// throws → PARSE_ERROR → 3× retry → DEAD → 0 items.
//
// Fix: use `generateObject()` with the Zod schema directly. This goes through
// the `Output.object` contract which correctly sets
// `generationConfig.responseMimeType = "application/json"` AND attaches the
// schema via `responseSchema`, so Gemini is constrained to valid JSON and the
// result is already schema-validated on return.

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

/** Custom error class so the catch block can distinguish parse failures. */
class StructuredParseError extends Error {
  code: "PARSE_ERROR" = "PARSE_ERROR" as const;
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "StructuredParseError";
  }
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
    // Conditional UPDATE: only succeed if the row is PENDING, or FAILED (for
    // retries), or PROCESSING with an expired lease (crashed worker).
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
    const isStructured = mode === "QUESTION_SET" || mode === "FULL_EXAM";

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
      const bytes = await downloadAsBuffer(page.imageUrl);
      const base64 = bytes.toString("base64");
      const mimeType = "image/jpeg";

      const systemPrompt = isStructured
        ? STRUCTURED_OCR_SYSTEM_PROMPT
        : mode === "PASSAGE_ONLY"
          ? OCR_SYSTEM_PROMPT
          : buildOcrSystemPrompt(mode);
      const userPrompt = isStructured
        ? buildOcrUserPrompt(mode, pageIndex, page.job.totalPages)
        : mode === "PASSAGE_ONLY"
          ? OCR_USER_PROMPT
          : buildOcrUserPrompt(mode, pageIndex, page.job.totalPages);

      const commonMessages = [
        { role: "system" as const, content: systemPrompt },
        {
          role: "user" as const,
          content: [
            { type: "image" as const, image: `data:${mimeType};base64,${base64}` },
            { type: "text" as const, text: userPrompt },
          ],
        },
      ];

      if (isStructured) {
        // (P0 FIX) generateObject() uses the Output.object contract which
        // correctly forces Gemini's responseMimeType=application/json AND
        // attaches the Zod schema as responseSchema. Zero ambiguity, zero
        // fence/prose leaks, and the return value is already schema-validated.
        try {
          const result = await generateObject({
            model,
            schema: structuredOcrResponseSchema,
            temperature: OCR_GENERATION_CONFIG.temperature,
            topK: OCR_GENERATION_CONFIG.topK,
            topP: OCR_GENERATION_CONFIG.topP,
            maxOutputTokens: OCR_GENERATION_CONFIG.maxOutputTokens,
            messages: commonMessages,
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
        } catch (objErr) {
          // NoObjectGeneratedError: Gemini returned something unparseable or
          // schema-violating. Classify as PARSE_ERROR so it's retryable.
          if (NoObjectGeneratedError.isInstance(objErr)) {
            const rawText = (objErr as { text?: string }).text ?? "";
            const usage = (objErr as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
            inputTokens = usage?.inputTokens;
            outputTokens = usage?.outputTokens;
            throw new StructuredParseError(
              `generateObject schema/parse failure: ${(objErr as Error).message}. Raw: ${rawText.slice(0, 300)}`,
              objErr,
            );
          }
          throw objErr;
        }
      } else {
        // Plain-text OCR (M1 / M3). generateText is correct here —
        // forcing JSON would corrupt verbatim text preservation.
        const result = await generateText({
          model,
          temperature: OCR_GENERATION_CONFIG.temperature,
          topK: OCR_GENERATION_CONFIG.topK,
          topP: OCR_GENERATION_CONFIG.topP,
          maxOutputTokens: OCR_GENERATION_CONFIG.maxOutputTokens,
          messages: commonMessages,
        });
        const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } }).usage;
        inputTokens = usage?.inputTokens ?? usage?.promptTokens;
        outputTokens = usage?.outputTokens ?? usage?.completionTokens;
        extractedText = sanitizeOcrOutput(result.text);
        if (extractedText.length === 0) {
          const err = new Error("Gemini returned empty text");
          (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
          throw err;
        }
      }
    } catch (err) {
      const classified = classifyGeminiError(err);
      logger.warn("page extraction error", {
        idempotencyKey,
        mode,
        code: classified.code,
        retryable: classified.retryable,
        attemptCount: page.attemptCount + 1,
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
            errorMessage: classified.userMessage,
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
            errorMessage: classified.userMessage,
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
    await prisma.$transaction(async (tx) => {
      await tx.extractionPage.update({
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
      });

      if (isStructured && structured) {
        // Insert ExtractionItem rows in block order. `order` here is a
        // temporary page-scoped number — finalize() will re-assign a
        // globally-consistent order once all pages have landed.
        for (let i = 0; i < structured.blocks.length; i++) {
          const b = structured.blocks[i];
          const tempOrder = page.pageIndex * 1000 + i;

          const questionMeta: Prisma.InputJsonValue | undefined =
            b.blockType === "QUESTION_STEM"
              ? { number: b.questionNumber ?? null }
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
              ? { wordCount: b.content.split(/\s+/).filter(Boolean).length }
              : undefined;

          await tx.extractionItem.create({
            data: {
              jobId,
              pageId: page.id,
              sourcePageIndex: [page.pageIndex],
              blockType: b.blockType,
              content: b.content,
              rawText: b.content,
              confidence: b.confidence ?? null,
              order: tempOrder,
              localOrder: null,
              questionMeta,
              choiceMeta,
              examMeta,
              passageMeta,
              boundingBox: undefined,
              needsReview: (b.confidence ?? 1) < 0.7,
              status: "DRAFT",
              groupId: null,
              parentItemId: null,
            },
          });
        }
      }

      await tx.extractionJob.update({
        where: { id: jobId },
        data: {
          successPages: { increment: 1 },
          pendingPages: { decrement: 1 },
          creditsConsumed: { increment: CREDIT_COSTS.TEXT_EXTRACTION },
        },
      });
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
