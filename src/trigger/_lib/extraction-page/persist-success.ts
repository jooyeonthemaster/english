import type { Prisma } from "@prisma/client";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type { StructuredOcrResponse } from "@/lib/extraction/ocr";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { prisma } from "@/lib/prisma";
import { buildExtractionItemRows } from "./build-item-rows";

export async function persistPageSuccess(params: {
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
        modelUsed: getExtractionAiModelName("ocr"),
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
