import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { toClientErrorMessage } from "@/lib/client-error";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";
import { buildM1SourceMatchRows } from "@/lib/extraction/m1-draft-persistence";
import {
  findOrCreateRestorationCharge,
  recordJobRestorationCharge,
  refundRestorationCharge,
  InsufficientCreditsError,
} from "@/lib/extraction/restoration-credits";
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

  // 단건(text)·다건(passages)을 하나의 배열로 정규화. passages 우선.
  const passages =
    parsed.passages && parsed.passages.length > 0
      ? parsed.passages.map((p) => ({
          title: p.title?.trim() || undefined,
          text: p.text,
        }))
      : [{ title: parsed.title?.trim() || undefined, text: parsed.text ?? "" }];
  const pageCount = passages.length;
  // 작업(권) 이름 = 첫 지문 제목, 여러 개면 "외 N건".
  const originalFileName =
    makeTextSourceName(passages[0]?.title) +
    (pageCount > 1 ? ` 외 ${pageCount - 1}건` : "");
  // AI 원문 복원은 영어 전용 파이프라인 — 국어(subject=KOREAN) 잡은 서버에서도
  // verbatim 으로 강제해 복원 차감/프롬프트 경로에 절대 오르지 않게 한다
  // (파일 잡 create-job.ts 와 동일 규약).
  const outputMode =
    parsed.subject === "KOREAN" ? ("verbatim" as const) : parsed.outputMode;
  const shouldRestore = outputMode !== "verbatim";
  const totalReserved = shouldRestore
    ? CREDIT_COSTS.PASSAGE_RESTORATION * pageCount
    : 0;
  const restorationCreditTxIds: Array<string | null> = new Array(pageCount).fill(null);
  let jobId: string | null = null;

  try {
    // Verbatim text/OCR is free; restored mode charges once per passage.
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.extractionJob.create({
        data: {
          academyId: staff.academyId,
          createdById: staff.id,
          sourceType: "TEXT",
          mode: parsed.mode,
          outputMode: outputMode ?? null,
          originalFileName,
          // subject: 과목 전파 신호 — finalize 의 SourceMaterial 생성과 승급
          // Passage 가 이 값을 읽어 국어/영어 버킷을 분리한다. 미전달=영어(무회귀).
          ...(parsed.subject
            ? { metadata: { subject: parsed.subject } }
            : {}),
          totalPages: pageCount,
          successPages: 0,
          failedPages: 0,
          pendingPages: pageCount,
          creditsReserved: totalReserved,
          creditsConsumed: 0,
          status: "PROCESSING",
          startedAt: new Date(),
        },
      });

      await tx.extractionPage.createMany({
        data: passages.map((p, i) => ({
          jobId: created.id,
          pageIndex: i,
          imageUrl: `text://${created.id}/input/${i}`,
          imageBytes: Buffer.byteLength(p.text, "utf8"),
          sourceFileName: makeTextSourceName(p.title),
          status: "PROCESSING" as const,
          attemptCount: 1,
          idempotencyKey: `${created.id}:${i}`,
          extractedText: p.text,
          startedAt: new Date(),
        })),
      });

      return created;
    });
    jobId = job.id;

    if (shouldRestore) {
      for (let i = 0; i < pageCount; i++) {
        const charge = await findOrCreateRestorationCharge({
          academyId: staff.academyId,
          staffId: staff.id,
          idempotencyKey: `restore:text:${job.id}:${i}`,
          metadata: {
            source: "TEXT_INPUT_RESTORE",
            jobId: job.id,
            mode: parsed.mode,
            originalFileName,
            textLength: passages[i].text.length,
            passageIndex: i,
          },
        });
        if (charge.created) {
          try {
            await recordJobRestorationCharge({ jobId: job.id });
          } catch (err) {
            await refundRestorationCharge({
              academyId: staff.academyId,
              transactionId: charge.transactionId,
              reason: "Text input restoration charge was not recorded on job",
            }).catch(() => {});
            throw err;
          }
        }
        restorationCreditTxIds[i] = charge.transactionId;
      }
    }

    // P7-D2: verbatim이면 AI 복원을 건너뛰고 붙여넣은 텍스트를 그대로 보존.
    // 지문마다 복원(verbatim은 그대로). 복원 호출은 병렬로 처리.
    const restorations = await Promise.all(
      passages.map((p) =>
        !shouldRestore
          ? Promise.resolve({
              restoredText: p.text,
              status: "NO_RESTORATION_NEEDED" as const,
              changes: [] as Awaited<
                ReturnType<typeof restoreM1Passage>
              >["changes"],
              sourceMatches: [] as Awaited<
                ReturnType<typeof restoreM1Passage>
              >["sourceMatches"],
              warnings: [] as string[],
              confidence: null as number | null,
              metadata: null as unknown,
            })
          : restoreM1Passage({
              academyId: staff.academyId,
              rawText: p.text,
              questions: [],
            }),
      ),
    );

    for (let i = 0; i < restorations.length; i++) {
      const txId = restorationCreditTxIds[i];
      if (txId && restorations[i].status === "FAILED") {
        await refundRestorationCharge({
          academyId: staff.academyId,
          jobId: job.id,
          transactionId: txId,
          reason: "Text input restoration failed",
        }).catch(() => {});
        restorationCreditTxIds[i] = null;
      }
    }

    const draftIds = passages.map(() => randomUUID());

    await prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < pageCount; i++) {
          const p = passages[i];
          const restoration = restorations[i];
          const draftId = draftIds[i];
          const changeRows: Prisma.ExtractionM1PassageDraftChangeCreateManyInput[] =
            restoration.changes.map((change) => ({
              passageDraftId: draftId,
              sentenceOrder: change.sentenceOrder ?? null,
              before: change.before,
              after: change.after,
              changeType: change.changeType ?? null,
              reason: change.reason ?? null,
              confidence: change.confidence ?? null,
              sourcePageIndex: [i],
            }));
          const sourceMatchRows = buildM1SourceMatchRows({
            passageDraftId: draftId,
            sourceMatches: restoration.sourceMatches,
          });

          await tx.extractionM1PassageDraft.create({
            data: {
              id: draftId,
              jobId: job.id,
              sourceMaterialId: null,
              passageOrder: i,
              sourcePageIndex: [i],
              title: p.title || null,
              rawText: p.text,
              restoredText: restoration.restoredText,
              teacherText: restoration.restoredText,
              restorationStatus: restoration.status,
              restorationCreditTxId: restorationCreditTxIds[i],
              reviewStatus: "DRAFT",
              confidence: restoration.confidence,
              warnings:
                restoration.warnings.length > 0
                  ? (restoration.warnings as Prisma.InputJsonValue)
                  : undefined,
              metadata: {
                sourceType: "TEXT",
                inputTitle: p.title || null,
                ...((restoration.metadata &&
                typeof restoration.metadata === "object" &&
                !Array.isArray(restoration.metadata)
                  ? restoration.metadata
                  : {}) as Record<string, unknown>),
              } as Prisma.InputJsonValue,
            },
          });
          if (changeRows.length > 0) {
            await tx.extractionM1PassageDraftChange.createMany({
              data: changeRows,
            });
          }
          if (sourceMatchRows.length > 0) {
            await tx.extractionM1PassageSourceMatch.createMany({
              data: sourceMatchRows,
            });
          }
          await tx.extractionPage.update({
            where: { idempotencyKey: `${job.id}:${i}` },
            data: {
              status: "SUCCESS",
              completedAt: new Date(),
              modelUsed:
                restoration.metadata &&
                typeof restoration.metadata === "object" &&
                !Array.isArray(restoration.metadata)
                  ? ((
                      restoration.metadata as {
                        restoration?: { model?: string | null };
                      }
                    ).restoration?.model ?? null)
                  : null,
            },
          });
        }
        await tx.extractionJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            successPages: pageCount,
            pendingPages: 0,
            completedAt: new Date(),
          },
        });
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    return NextResponse.json({
      jobId: job.id,
      draftIds,
      status: "COMPLETED" as const,
      draftCount: pageCount,
    });
  } catch (err) {
    for (const txId of restorationCreditTxIds.filter((id): id is string => Boolean(id))) {
      try {
        await refundRestorationCharge({
          academyId: staff.academyId,
          jobId: jobId ?? undefined,
          transactionId: txId,
          reason: "Text input restoration failed",
        });
      } catch {
        // best-effort refund
      }
    }

    if (jobId) {
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedPages: pageCount,
          pendingPages: 0,
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
      toClientErrorMessage(err, "텍스트 추출에 실패했습니다."),
      500,
    );
  }
}
