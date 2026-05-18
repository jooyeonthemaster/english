import type { Prisma } from "@prisma/client";
import { segmentPages } from "@/lib/extraction/segmentation";
import type { ExtractionMode } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import { ensureSourceMaterial } from "./source-material";

export interface PlainTextFinalizeInput {
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

/**
 * M1 / legacy path — plain-text OCR → regex segmentation. Used when
 * `usesStructuredExtraction(mode)` returns false (today: M3 EXPLANATION).
 */
export async function finalizePlainText(input: PlainTextFinalizeInput): Promise<{
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
