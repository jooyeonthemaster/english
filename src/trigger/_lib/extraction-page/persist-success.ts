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
  /** 실제 사용된 OCR 엔진(dispatch가 보고). 미지정 시 설정상 Gemini 모델명. */
  modelUsed?: string;
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
    modelUsed,
  } = params;
  const itemRows = structured
    ? buildExtractionItemRows({ jobId, pageId, pageIndex, structured })
    : [];

  // Status-guarded so the page → SUCCESS transition (and its job-counter +
  // item writes) applies AT MOST ONCE, even if two paths finish the same page.
  // This matters for the inline extraction route: it runs outside the lease/
  // trigger model, and the reaper (5-min cron) can re-dispatch a still-PENDING
  // page to a trigger worker that also lands here. The `status: { not: SUCCESS }`
  // guard means the second writer matches 0 rows → no double increment of
  // successPages, no double decrement of pendingPages (which
  // could otherwise go negative), and no duplicate ExtractionItem rows.
  await prisma.$transaction(async (tx) => {
    const flipped = await tx.extractionPage.updateMany({
      where: { idempotencyKey, status: { not: "SUCCESS" } },
      data: {
        status: "SUCCESS",
        extractedText,
        modelUsed: modelUsed ?? getExtractionAiModelName("ocr"),
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
    if (flipped.count === 0) return; // already SUCCESS — don't double-apply

    if (itemRows.length > 0) {
      await tx.extractionItem.createMany({ data: itemRows });
    }
    await tx.extractionJob.update({
      where: { id: jobId },
      data: {
        successPages: { increment: 1 },
        pendingPages: { decrement: 1 },
      },
    });
  });
}
