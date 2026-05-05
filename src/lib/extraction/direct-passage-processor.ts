import { generateText } from "ai";
import type { Prisma } from "@prisma/client";
import { model } from "@/lib/ai";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { downloadAsBuffer } from "@/lib/supabase-storage";
import { DIRECT_PASSAGE_MAX_PAGES } from "@/lib/extraction/constants";
import {
  OCR_GENERATION_CONFIG,
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
  sanitizeOcrOutput,
} from "@/lib/extraction/ocr-prompt";
import { segmentPages } from "@/lib/extraction/segmentation";

const DIRECT_GEMINI_TIMEOUT_MS = 120_000;
const DIRECT_STORAGE_TIMEOUT_MS = 30_000;

class DirectTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = "DirectTimeoutError";
  }
}

async function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new DirectTimeoutError(operation, timeoutMs);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function detectImageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 500);
  return String(err).slice(0, 500);
}

async function processDirectPage(input: {
  jobId: string;
  pageId: string;
  pageIndex: number;
  imageUrl: string;
  idempotencyKey: string;
  academyId: string;
  createdById: string;
  creditTxId: string | null;
}): Promise<void> {
  const {
    jobId,
    pageId,
    pageIndex,
    imageUrl,
    idempotencyKey,
    academyId,
    createdById,
  } = input;

  let creditTxId = input.creditTxId;
  const claimed = await prisma.extractionPage.updateMany({
    where: { id: pageId, status: "PENDING" },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      startedAt: new Date(),
      errorCode: null,
      errorMessage: "[direct] storage_download",
    },
  });
  if (claimed.count === 0) return;

  try {
    if (!creditTxId) {
      const priorCharge = await prisma.creditTransaction.findFirst({
        where: {
          academyId,
          type: "CONSUMPTION",
          operationType: "TEXT_EXTRACTION",
          metadata: { contains: `"idempotencyKey":"${idempotencyKey}"` },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      creditTxId = priorCharge?.id ?? null;
    }

    if (!creditTxId) {
      const charge = await deductCredits(academyId, "TEXT_EXTRACTION", createdById, {
        jobId,
        pageIndex,
        directExtraction: true,
        mode: "PASSAGE_ONLY",
        idempotencyKey,
      });
      creditTxId = charge.transactionId;
    }

    await prisma.extractionPage.update({
      where: { id: pageId },
      data: { creditTxId, errorMessage: "[direct] gemini_call" },
    });

    const startTs = Date.now();
    const bytes = await withTimeout("storage download", DIRECT_STORAGE_TIMEOUT_MS, () =>
      downloadAsBuffer(imageUrl),
    );
    const mimeType = detectImageMime(bytes);
    const base64 = bytes.toString("base64");

    const result = await withTimeout("gemini call", DIRECT_GEMINI_TIMEOUT_MS, (signal) =>
      generateText({
        model,
        temperature: OCR_GENERATION_CONFIG.temperature,
        topK: OCR_GENERATION_CONFIG.topK,
        topP: OCR_GENERATION_CONFIG.topP,
        maxOutputTokens: OCR_GENERATION_CONFIG.maxOutputTokens,
        abortSignal: signal,
        messages: [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image", image: `data:${mimeType};base64,${base64}` },
              { type: "text", text: OCR_USER_PROMPT },
            ],
          },
        ],
      }),
    );

    const extractedText = sanitizeOcrOutput(result.text);
    if (!extractedText) throw new Error("Gemini returned empty text");

    const usage = result as {
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        promptTokens?: number;
        completionTokens?: number;
      };
    };

    await prisma.$transaction(async (tx) => {
      await tx.extractionPage.update({
        where: { id: pageId },
        data: {
          status: "SUCCESS",
          extractedText,
          modelUsed: "gemini-3-flash-preview",
          inputTokens: usage.usage?.inputTokens ?? usage.usage?.promptTokens ?? null,
          outputTokens:
            usage.usage?.outputTokens ?? usage.usage?.completionTokens ?? null,
          latencyMs: Date.now() - startTs,
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
      await tx.extractionJob.update({
        where: { id: jobId },
        data: {
          successPages: { increment: 1 },
          pendingPages: { decrement: 1 },
          creditsConsumed: { increment: CREDIT_COSTS.TEXT_EXTRACTION },
        },
      });
    });
  } catch (err) {
    const msg = errorMessage(err);
    await prisma.$transaction(async (tx) => {
      await tx.extractionPage.update({
        where: { id: pageId },
        data: {
          status: "DEAD",
          errorCode: err instanceof InsufficientCreditsError
            ? "INSUFFICIENT_CREDITS"
            : "DIRECT_EXTRACTION_FAILED",
          errorMessage: msg,
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
          academyId,
          "TEXT_EXTRACTION",
          creditTxId,
          `Direct page ${pageIndex} failed`,
        );
        await prisma.extractionJob.update({
          where: { id: jobId },
          data: { creditsRefunded: { increment: CREDIT_COSTS.TEXT_EXTRACTION } },
        });
      } catch {
        // Best effort only. The user-facing extraction state is already terminal.
      }
    }
  }
}

async function finalizeDirectPassageJob(jobId: string): Promise<{
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  draftCount: number;
}> {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: { pages: { orderBy: { pageIndex: "asc" } } },
  });
  if (!job) throw new Error(`job not found: ${jobId}`);

  let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
  if (job.successPages === job.totalPages) finalStatus = "COMPLETED";
  else if (job.successPages === 0) finalStatus = "FAILED";
  else finalStatus = "PARTIAL";

  const drafts = segmentPages(
    job.pages
      .filter((p) => p.status === "SUCCESS" && p.extractedText)
      .map((p) => ({
        pageIndex: p.pageIndex,
        text: p.extractedText ?? "",
        confidence: p.confidence,
      })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.extractionResult.deleteMany({
      where: { jobId, status: "DRAFT" },
    });
    for (const draft of drafts) {
      await tx.extractionResult.create({
        data: {
          jobId,
          passageOrder: draft.passageOrder,
          sourcePageIndex: draft.sourcePageIndex,
          title: draft.title,
          content: draft.content,
          meta: (draft.meta as Prisma.InputJsonValue) ?? undefined,
          confidence: draft.confidence,
          status: "DRAFT",
        },
      });
    }
    await tx.extractionJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });
  });

  return { status: finalStatus, draftCount: drafts.length };
}

export async function processPassageOnlyJobDirect(jobId: string): Promise<{
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  draftCount: number;
}> {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: { pages: { orderBy: { pageIndex: "asc" } } },
  });
  if (!job) throw new Error(`job not found: ${jobId}`);
  if (job.mode !== "PASSAGE_ONLY") {
    throw new Error(`direct extraction only supports PASSAGE_ONLY, got ${job.mode}`);
  }
  if (job.totalPages > DIRECT_PASSAGE_MAX_PAGES) {
    throw new Error(`direct extraction supports up to ${DIRECT_PASSAGE_MAX_PAGES} pages`);
  }

  await prisma.extractionItem.deleteMany({ where: { jobId } });
  await prisma.extractionResult.deleteMany({
    where: { jobId, status: "DRAFT" },
  });
  await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
      triggerRunId: `direct:${Date.now()}`,
    },
  });

  for (const page of job.pages) {
    await processDirectPage({
      jobId,
      pageId: page.id,
      pageIndex: page.pageIndex,
      imageUrl: page.imageUrl,
      idempotencyKey: page.idempotencyKey,
      academyId: job.academyId,
      createdById: job.createdById,
      creditTxId: page.creditTxId,
    });
  }

  return finalizeDirectPassageJob(jobId);
}
