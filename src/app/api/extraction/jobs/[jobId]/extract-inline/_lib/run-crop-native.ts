// ============================================================================
// runCropNativeRestore — 이미지 크롭 + restored 전용 극속 경로.
//
// "사진 1장(=1 크롭=1 지문) → Gemini 1콜 → 지문 OCR + 원문 복원 + 변경점"을 페이지별로
// 처리하고, 그 결과로 ExtractionM1PassageDraft를 1슬롯=1지문으로 직접 생성한다.
//
// 기존 다단계(DocAI OCR → Gemini 블록분류 → finalize 클러스터/STEM 그룹핑 → DB 조회 →
// Gemini 복원 배치)를 통째로 우회한다. 크레딧/리스/페이지상태/SourceMaterial은 검증된
// 공용 헬퍼(claimPageLease/persistPageSuccess/ensureSourceMaterial)를
// 그대로 재사용해 회귀 위험을 격리한다. 킬스위치: EXTRACTION_CROP_NATIVE_RESTORE=false.
// ============================================================================

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { errorResponse } from "@/lib/extraction/api-utils";
import { classifyGeminiError } from "@/lib/extraction/error-classifier";
import {
  findOrCreateRestorationCharge,
  recordJobRestorationCharge,
  refundRestorationCharge,
  InsufficientCreditsError,
} from "@/lib/extraction/restoration-credits";
import type { StructuredOcrResponse } from "@/lib/extraction/ocr";
import type { ExtractionMode, M1RestorationStatus } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import { downloadAsBuffer } from "@/lib/supabase-storage";
import { ensureSourceMaterial } from "@/trigger/_lib/extraction-finalize/source-material";
import {
  claimPageLease,
  type ClaimedPageRow,
} from "@/trigger/_lib/extraction-page/claim-lease";
import { persistPageSuccess } from "@/trigger/_lib/extraction-page/persist-success";
import {
  restoreCropImage,
  type CropRestoreResult,
} from "@/trigger/_lib/m1-passage-restoration/crop-native";
import { autoPromoteJobDrafts } from "@/lib/extraction/promote-m1-drafts";

const INLINE_CROP_CONCURRENCY = 20;

// 리뷰 "복원 근거" 패널이 카드로 렌더하는 변경 유형(restoration-changes.ts와 동일).
// 모델이 준 type이 이 목록에 없으면 OTHER로 매핑해야 패널에서 필터링되지 않는다.
const INLINE_EVIDENCE_TYPES = new Set([
  "VOCAB",
  "GRAMMAR",
  "BLANK",
  "WORD_ORDER",
  "INSERTION",
  "ORDERING",
  "SUMMARY",
  "OTHER",
]);

/** 킬스위치 — 환경변수로 끄면 기존 다단계 경로로 폴백. 기본 ON. */
export function isCropNativeRestoreEnabled(): boolean {
  return process.env.EXTRACTION_CROP_NATIVE_RESTORE !== "false";
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

/** 상태 가드 DEAD 전이(정확히 1회만 카운터/환불). 인라인 route의 동명 헬퍼와 동일 로직. */
async function markPageDead(
  idempotencyKey: string,
  jobId: string,
  errorCode: string,
  errorMessage: string,
): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      const flipped = await tx.extractionPage.updateMany({
        where: { idempotencyKey, status: { notIn: ["SUCCESS", "DEAD"] } },
        data: {
          status: "DEAD",
          errorCode,
          errorMessage,
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (flipped.count === 0) return false;
      await tx.extractionJob.update({
        where: { id: jobId },
        data: { failedPages: { increment: 1 }, pendingPages: { decrement: 1 } },
      });
      return true;
    });
  } catch {
    return false;
  }
}

export async function runCropNativeRestore(args: {
  jobId: string;
  mode: ExtractionMode;
  totalPages: number;
  pageRows: Array<{ pageIndex: number }>;
}): Promise<NextResponse> {
  const { jobId, mode, totalPages, pageRows } = args;

  const job0 = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: { academyId: true, createdById: true, originalFileName: true },
  });
  if (!job0) return errorResponse("JOB_NOT_FOUND", "작업을 찾을 수 없습니다.", 404);
  const { academyId, createdById, originalFileName } = job0;

  const leaseOwner = `inline-crop:${jobId}`;
  const restored = new Map<
    number,
    { result: CropRestoreResult; restorationCreditTxId: string }
  >();

  // ── Phase 1: 리스 확보 + 복원 크레딧 차감 (순차) ─────────────────────────────
  // deductCredits는 인터랙티브 트랜잭션(기본 5초 한도)이다. 이걸 여러 개 동시에 열면
  // DB 커넥션 풀이 경합해(특히 dev 콜드스타트 + 폴링) 5초를 넘겨 P2028로 죽는다.
  // 짧은 DB 작업인 복원 차감/리스는 순차로 빠르게 끝내고, 느린 Gemini 호출만 Phase 2에서
  // 병렬화한다(속도는 Gemini가 지배적이라 그대로 유지).
  const charged: Array<{
    page: ClaimedPageRow;
    pageIndex: number;
    restorationCreditTxId: string;
  }> = [];
  for (const pageRow of pageRows) {
    const pageIndex = pageRow.pageIndex;
    const idempotencyKey = `${jobId}:${pageIndex}`;
    const claim = await claimPageLease({ idempotencyKey, leaseOwner });
    if (claim.skipped) continue;
    try {
      const charge = await findOrCreateRestorationCharge({
        academyId,
        staffId: createdById,
        idempotencyKey: `restore:crop:${jobId}:${pageIndex}`,
        metadata: {
          source: "M1_CROP_NATIVE_RESTORE",
          jobId,
          pageIndex,
          mode,
        },
      });
      if (charge.created) {
        try {
          await recordJobRestorationCharge({ jobId });
        } catch (err) {
          await refundRestorationCharge({
            academyId,
            transactionId: charge.transactionId,
            reason: "Crop-native restoration charge was not recorded on job",
          }).catch(() => {});
          throw err;
        }
      }
      charged.push({
        page: claim.page,
        pageIndex,
        restorationCreditTxId: charge.transactionId,
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        await markPageDead(idempotencyKey, jobId, "INSUFFICIENT_CREDITS", err.message);
        continue;
      }
      throw err;
    }
  }

  // ── Phase 2: 크롭별 단일 Gemini 호출 (병렬, 느린 부분) ──────────────────────
  await mapLimit(
    charged,
    INLINE_CROP_CONCURRENCY,
    async ({ page, pageIndex, restorationCreditTxId }) => {
      const idempotencyKey = `${jobId}:${pageIndex}`;
      const startTs = Date.now();
      let result: CropRestoreResult | null = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const bytes = await downloadAsBuffer(page.imageUrl);
          result = await restoreCropImage({
            base64: bytes.toString("base64"),
            mimeType: "image/jpeg",
          });
          break;
        } catch (err) {
          lastErr = err;
          const classified = classifyGeminiError(err);
          if (!classified.retryable || attempt === 1) break;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }

      if (!result) {
        const classified = classifyGeminiError(lastErr);
        const flippedDead = await markPageDead(
          idempotencyKey,
          jobId,
          classified.code,
          classified.userMessage,
        );
        if (flippedDead) {
          await refundRestorationCharge({
            academyId,
            jobId,
            transactionId: restorationCreditTxId,
            reason: `Inline crop ${pageIndex} failed: ${classified.code}`,
          }).catch(() => {});
        }
        return;
      }

      // 페이지 SUCCESS + 카운터/아이템 — 기존 헬퍼 재사용(단일 PASSAGE_BODY 합성).
      const structured: StructuredOcrResponse = {
        blocks: [
          { blockType: "PASSAGE_BODY", content: result.rawText, confidence: 0.9 },
        ],
        pageMeta: {} as StructuredOcrResponse["pageMeta"],
      };
      await persistPageSuccess({
        idempotencyKey,
        jobId,
        pageId: page.id,
        pageIndex,
        extractedText: result.rawText,
        inputTokens: undefined,
        outputTokens: undefined,
        latencyMs: Date.now() - startTs,
        structured,
      });
      restored.set(pageIndex, { result, restorationCreditTxId });
    },
  );

  // ── 상태 집계 ──────────────────────────────────────────────────────────────
  const job = await prisma.extractionJob.findUnique({ where: { id: jobId } });
  if (!job) return errorResponse("JOB_NOT_FOUND", "작업을 찾을 수 없습니다.", 404);
  let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
  if (job.successPages === totalPages) finalStatus = "COMPLETED";
  else if (job.successPages === 0) finalStatus = "FAILED";
  else finalStatus = "PARTIAL";

  const ordered = [...restored.entries()].sort((a, b) => a[0] - b[0]);

  // ── SourceMaterial(검수완료 게이트) — 잡당 1행, 기존 헬퍼 재사용 ──────────────
  const allTexts = ordered.map(([, r]) => r.result.rawText).filter(Boolean);
  const sourceMaterialId =
    allTexts.length > 0
      ? await ensureSourceMaterial({
          jobId,
          academyId,
          createdById,
          mode,
          filename: originalFileName,
          page1Text: ordered[0]?.[1].result.rawText ?? "",
          allTexts,
        })
      : null;

  // ── 드래프트 직접 생성: 1슬롯=1지문 + 변경점(근거) ────────────────────────────
  if (ordered.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        await tx.extractionM1PassageDraft.deleteMany({
          where: { jobId, reviewStatus: "DRAFT" },
        });
        let order = 0;
        for (const [pageIndex, entry] of ordered) {
          const r = entry.result;
          const id = randomUUID();
          const hasChanges = r.changes.length > 0;
          const status: M1RestorationStatus = hasChanges
            ? "RESTORED"
            : "NO_RESTORATION_NEEDED";
          await tx.extractionM1PassageDraft.create({
            data: {
              id,
              jobId,
              sourceMaterialId,
              passageOrder: order,
              sourcePageIndex: [pageIndex],
              title: null,
              rawText: r.rawText,
              restoredText: r.restoredText,
              teacherText: r.restoredText,
              restorationCreditTxId: entry.restorationCreditTxId,
              restorationStatus: status,
              reviewStatus: "DRAFT",
              confidence: 0.9,
              metadata: {
                problemType: r.problemType,
                cropNative: true,
              } as Prisma.InputJsonValue,
            },
          });
          if (hasChanges) {
            await tx.extractionM1PassageDraftChange.createMany({
              data: r.changes.map((c) => ({
                passageDraftId: id,
                sentenceOrder: null,
                before: c.before,
                after: c.after,
                // 화이트리스트 유형으로 매핑 → 리뷰 "복원 근거" 패널이 카드+해설 표시.
                changeType: INLINE_EVIDENCE_TYPES.has(c.type) ? c.type : "OTHER",
                reason: c.reason,
                confidence: null,
                sourcePageIndex: [pageIndex],
              })),
            });
          }
          order += 1;
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  // autoPromote(생성 페이지 발 잡): drafts를 서버에서 곧바로 Passage로 승격.
  // 잡 status가 터미널로 플립되기 *전에* 실행해, 클라이언트 폴링이 완료를 보는
  // 시점엔 이미 savedPassageId가 박혀 있게 한다(클라이언트 승격과의 레이스 제거).
  // 승격 실패가 추출 자체를 실패시키면 안 되므로 best-effort.
  let promotedPassageIds: string[] = [];
  try {
    const promoted = await autoPromoteJobDrafts(jobId);
    promotedPassageIds = promoted.promotedPassageIds;
    if (promoted.enabled) {
      console.info("[crop-native] auto-promote done", {
        jobId,
        promoted: promoted.promotedPassageIds.length,
        skipped: promoted.skipped,
        failed: promoted.failed,
      });
    }
  } catch (err) {
    console.error("[crop-native] auto-promote failed", {
      jobId,
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      ...(sourceMaterialId ? { sourceMaterialId } : {}),
    },
  });

  return NextResponse.json({
    jobId,
    status: finalStatus,
    draftCount: ordered.length,
    sourceMaterialId,
    promotedPassageIds,
    successPages: job.successPages,
    failedPages: job.failedPages,
    inline: true as const,
    cropNative: true as const,
  });
}
