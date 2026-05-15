import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";
import { buildM1SourceMatchRows } from "@/lib/extraction/m1-draft-persistence";
import { createTextExtractionRequestSchema } from "@/lib/extraction/zod-schemas";
import { restoreM1Passage } from "@/trigger/_lib/m1-passage-restoration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function makeTextSourceName(title: string | undefined): string {
  const normalized = title?.trim();
  if (normalized) return normalized.slice(0, 200);
  return "텍스트 입력";
}

export async function POST(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  let parsed: z.infer<typeof createTextExtractionRequestSchema>;
  try {
    parsed = createTextExtractionRequestSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse("INVALID_PAYLOAD", "텍스트 입력이 올바르지 않습니다.", 400, err.issues);
    }
    return errorResponse("INVALID_PAYLOAD", "요청 본문을 읽을 수 없습니다.", 400);
  }

  const originalFileName = makeTextSourceName(parsed.title);
  let creditTxId: string | null = null;
  let jobId: string | null = null;

  try {
    const credit = await deductCredits(staff.academyId, "TEXT_EXTRACTION", staff.id, {
      sourceType: "TEXT",
      mode: parsed.mode,
      originalFileName,
      textLength: parsed.text.length,
    });
    creditTxId = credit.transactionId;

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.extractionJob.create({
        data: {
          academyId: staff.academyId,
          createdById: staff.id,
          sourceType: "TEXT",
          mode: parsed.mode,
          originalFileName,
          totalPages: 1,
          successPages: 0,
          failedPages: 0,
          pendingPages: 1,
          creditsReserved: CREDIT_COSTS.TEXT_EXTRACTION,
          creditsConsumed: 0,
          status: "PROCESSING",
          startedAt: new Date(),
        },
      });

      await tx.extractionPage.create({
        data: {
          jobId: created.id,
          pageIndex: 0,
          imageUrl: `text://${created.id}/input`,
          imageBytes: Buffer.byteLength(parsed.text, "utf8"),
          sourceFileName: originalFileName,
          status: "PROCESSING",
          attemptCount: 1,
          idempotencyKey: `${created.id}:0`,
          creditTxId,
          extractedText: parsed.text,
          startedAt: new Date(),
        },
      });

      return created;
    });
    jobId = job.id;

    const restoration = await restoreM1Passage({
      academyId: staff.academyId,
      rawText: parsed.text,
      questions: [],
    });

    const draftId = randomUUID();
    const changeRows: Prisma.ExtractionM1PassageDraftChangeCreateManyInput[] =
      restoration.changes.map((change) => ({
        passageDraftId: draftId,
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.changeType ?? null,
        reason: change.reason ?? null,
        confidence: change.confidence ?? null,
        sourcePageIndex: [0],
      }));
    const sourceMatchRows = buildM1SourceMatchRows({
      passageDraftId: draftId,
      sourceMatches: restoration.sourceMatches,
    });

    await prisma.$transaction(
      async (tx) => {
        await tx.extractionM1PassageDraft.create({
          data: {
            id: draftId,
            jobId: job.id,
            sourceMaterialId: null,
            passageOrder: 0,
            sourcePageIndex: [0],
            title: parsed.title?.trim() || null,
            rawText: parsed.text,
            restoredText: restoration.restoredText,
            teacherText: restoration.restoredText,
            restorationStatus: restoration.status,
            reviewStatus: "DRAFT",
            confidence: restoration.confidence,
            warnings:
              restoration.warnings.length > 0
                ? (restoration.warnings as Prisma.InputJsonValue)
                : undefined,
            metadata: {
              sourceType: "TEXT",
              inputTitle: parsed.title?.trim() || null,
              ...((restoration.metadata &&
              typeof restoration.metadata === "object" &&
              !Array.isArray(restoration.metadata)
                ? restoration.metadata
                : {}) as Record<string, unknown>),
            } as Prisma.InputJsonValue,
          },
        });
        if (changeRows.length > 0) {
          await tx.extractionM1PassageDraftChange.createMany({ data: changeRows });
        }
        if (sourceMatchRows.length > 0) {
          await tx.extractionM1PassageSourceMatch.createMany({ data: sourceMatchRows });
        }
        await tx.extractionPage.update({
          where: { idempotencyKey: `${job.id}:0` },
          data: {
            status: "SUCCESS",
            completedAt: new Date(),
            modelUsed:
              restoration.metadata &&
              typeof restoration.metadata === "object" &&
              !Array.isArray(restoration.metadata)
                ? ((restoration.metadata as { restoration?: { model?: string | null } })
                    .restoration?.model ?? null)
                : null,
          },
        });
        await tx.extractionJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            successPages: 1,
            pendingPages: 0,
            creditsConsumed: CREDIT_COSTS.TEXT_EXTRACTION,
            completedAt: new Date(),
          },
        });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    return NextResponse.json({
      jobId: job.id,
      draftId,
      status: "COMPLETED" as const,
      draftCount: 1,
    });
  } catch (err) {
    if (creditTxId) {
      try {
        await refundCredits(
          staff.academyId,
          "TEXT_EXTRACTION",
          creditTxId,
          "Text extraction failed",
        );
      } catch {
        // best-effort refund
      }
    }

    if (jobId) {
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedPages: 1,
          pendingPages: 0,
          creditsRefunded: creditTxId ? CREDIT_COSTS.TEXT_EXTRACTION : 0,
          completedAt: new Date(),
          errorSummary: JSON.stringify({
            textExtraction: err instanceof Error ? err.message : String(err),
          }),
        },
      }).catch(() => undefined);
      await prisma.extractionPage.updateMany({
        where: { jobId },
        data: {
          status: "DEAD",
          errorCode: "TEXT_EXTRACTION_FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      }).catch(() => undefined);
    }

    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: "크레딧이 부족합니다.",
          code: "INSUFFICIENT_CREDITS",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }
    return errorResponse(
      "TEXT_EXTRACTION_FAILED",
      err instanceof Error ? err.message : "텍스트 추출에 실패했습니다.",
      500,
    );
  }
}
