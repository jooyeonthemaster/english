// ============================================================================
// POST /api/extraction/jobs/:jobId/extract-inline
//
// SYNCHRONOUS extraction — runs the whole pipeline (per-page OCR + finalize)
// INSIDE this request, with NO trigger.dev. Returns when drafts are committed.
//
// Why this exists (perf): the trigger.dev path spawns one cold pod per page +
// a finalize pod. Each cold pod pays ~5s boot + ~5-9s cold DB-connection setup,
// so a 2-page job spends ~40s on cold-start overhead for ~13s of real work.
// Question generation is fast precisely because it runs inline on the warm
// Next.js server (DB ~28ms, no boot) — this route does the same for extraction.
//
// Reuses the exact same building blocks as the trigger pipeline
// (ensurePageCharged / runOcrForPage / persistPageSuccess / finalizeStructured)
// so behaviour (credits, idempotency, segmentation, drafts) is identical — only
// the execution context changes (warm request vs cold pod).
//
// Trade-offs vs trigger: the HTTP request stays open for the whole run (fine for
// image jobs of a handful of pages), and there is no automatic retry/durability
// (a failed request can simply be re-run; `ensurePageCharged` stays idempotent
// so re-runs don't double-charge). Large PDF jobs should keep the trigger path.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { refundCredits } from "@/lib/credits";
import { classifyGeminiError } from "@/lib/extraction/error-classifier";
import { usesStructuredExtraction } from "@/lib/extraction/modes";
import type { ExtractionMode } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";
import { startJobRequestSchema } from "@/lib/extraction/zod-schemas";
import {
  ensurePageCharged,
  PageOutOfCreditsError,
} from "@/trigger/_lib/extraction-page/charge-credits";
import { claimPageLease } from "@/trigger/_lib/extraction-page/claim-lease";
import { runOcrForPage } from "@/trigger/_lib/extraction-page/ocr-dispatch";
import { persistPageSuccess } from "@/trigger/_lib/extraction-page/persist-success";
import { finalizeStructured } from "@/trigger/_lib/extraction-finalize/structured/orchestrator";
import { finalizePlainText } from "@/trigger/_lib/extraction-finalize/plain-text";
import {
  isCropNativeRestoreEnabled,
  runCropNativeRestore,
} from "./_lib/run-crop-native";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

// In-process concurrency cap for per-page OCR. On the warm server one process
// runs all pages; this bounds simultaneous DocAI/Gemini calls + DB writes so a
// large job doesn't open dozens of parallel HTTP/DB at once.
const INLINE_PAGE_CONCURRENCY = 6;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

type PageOutcome = { ok: true } | { ok: false; code: string };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const parsed = startJobRequestSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return errorResponse("INVALID_PAYLOAD", "요청이 올바르지 않습니다.", 400);
  }

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  if (auth.job.status !== "PENDING") {
    return errorResponse("JOB_ALREADY_STARTED", "이미 시작된 작업입니다.", 409, {
      currentStatus: auth.job.status,
    });
  }

  const pageCount = await prisma.extractionPage.count({ where: { jobId } });
  if (pageCount !== auth.job.totalPages) {
    return errorResponse(
      "UPLOAD_INCOMPLETE",
      "페이지 업로드가 완료되지 않았습니다.",
      409,
      { expected: auth.job.totalPages, actual: pageCount },
    );
  }

  // PENDING→PROCESSING atomic flip. Guard makes double-submits idempotent: only
  // the first request proceeds; a racing second sees count===0 and bails.
  const flip = await prisma.extractionJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "PROCESSING", startedAt: new Date() },
  });
  if (flip.count === 0) {
    return errorResponse("JOB_ALREADY_STARTED", "이미 시작된 작업입니다.", 409);
  }

  const mode = (auth.job.mode as ExtractionMode) ?? "PASSAGE_ONLY";

  const pageRows = await prisma.extractionPage.findMany({
    where: { jobId },
    orderBy: { pageIndex: "asc" },
    select: { pageIndex: true },
  });

  const totalPages = auth.job.totalPages;
  const academyId = auth.job.academyId;

  // ── 크롭-네이티브 극속 경로 ────────────────────────────────────────────────
  // 이미지 크롭(=1슬롯=1지문) + AI 원문 복원이면, "사진 1장 → Gemini 1콜 → 지문 OCR +
  // 원문 복원 + 변경점"으로 직접 처리한다. 기존 다단계(DocAI OCR → 블록분류 → finalize
  // 클러스터/STEM 그룹핑 → DB 조회 → 복원 배치)를 통째로 우회 → 크롭당 Gemini 2콜→1콜,
  // DB 왕복 0. verbatim/PDF/QUESTION_SET은 아래 기존 경로 유지. 킬스위치로 폴백 가능.
  if (
    isCropNativeRestoreEnabled() &&
    auth.job.sourceType === "IMAGES" &&
    mode === "PASSAGE_ONLY" &&
    auth.job.outputMode === "restored"
  ) {
    return runCropNativeRestore({ jobId, mode, totalPages, pageRows });
  }
  // Stable lease owner for this inline run so claimed pages are "owned" and the
  // reaper / trigger workers won't re-dispatch them mid-flight.
  const leaseOwner = `inline:${jobId}`;

  // ── Per-page OCR (concurrency-capped, all in this one warm process) ────────
  await mapLimit(
    pageRows,
    INLINE_PAGE_CONCURRENCY,
    async (pageRow): Promise<PageOutcome> => {
      const pageIndex = pageRow.pageIndex;
      const idempotencyKey = `${jobId}:${pageIndex}`;

      // Claim the lease (flips page → PROCESSING). Mirrors the trigger worker so
      // the reaper's PENDING selector + other workers' claimPageLease skip this
      // in-flight page → no concurrent reprocessing. If another path already
      // owns/finished it (rare reaper race), skip and let that path complete.
      const claim = await claimPageLease({ idempotencyKey, leaseOwner });
      if (claim.skipped) {
        return {
          ok: claim.currentStatus === "SUCCESS",
          code: claim.currentStatus ?? "SKIPPED",
        };
      }
      const page = claim.page;

      // Credits (idempotent — safe on re-run).
      let creditTxId: string;
      try {
        creditTxId = await ensurePageCharged({
          page,
          idempotencyKey,
          jobId,
          pageIndex,
          mode,
        });
      } catch (err) {
        if (err instanceof PageOutOfCreditsError) {
          await markPageDead(
            idempotencyKey,
            jobId,
            "INSUFFICIENT_CREDITS",
            err.message,
          );
          return { ok: false, code: "INSUFFICIENT_CREDITS" };
        }
        throw err;
      }

      // OCR + persist, with one inline retry + REAL backoff for transients.
      // (Inside a trigger task, retry.fetch backs off via wait.until; outside a
      // task that throws, so we do our own sleep-backoff here and let the loop
      // re-attempt.)
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const startTs = Date.now();
        try {
          const ocr = await runOcrForPage({
            idempotencyKey,
            imageUrl: page.imageUrl,
            mode,
            outputMode: page.job.outputMode,
            pageIndex,
            totalPages,
          });
          await persistPageSuccess({
            idempotencyKey,
            jobId,
            pageId: page.id,
            pageIndex,
            extractedText: ocr.extractedText,
            inputTokens: ocr.inputTokens,
            outputTokens: ocr.outputTokens,
            latencyMs: Date.now() - startTs,
            structured: ocr.structured ?? undefined,
          });
          return { ok: true };
        } catch (err) {
          lastErr = err;
          const classified = classifyGeminiError(err);
          if (!classified.retryable || attempt === 1) break;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }

      // Terminal failure → DEAD + refund. markPageDead is status-guarded and
      // returns whether it actually transitioned, so we refund AT MOST ONCE
      // (never double-refund if another path already terminalized the page).
      const classified = classifyGeminiError(lastErr);
      const flippedDead = await markPageDead(
        idempotencyKey,
        jobId,
        classified.code,
        classified.userMessage,
      );
      if (flippedDead && creditTxId) {
        await refundCredits(
          academyId,
          "TEXT_EXTRACTION",
          creditTxId,
          `Inline page ${pageIndex} failed: ${classified.code}`,
        ).catch(() => {});
        await prisma.extractionJob
          .update({
            where: { id: jobId },
            data: { creditsRefunded: { increment: CREDIT_COSTS.TEXT_EXTRACTION } },
          })
          .catch(() => {});
      }
      return { ok: false, code: classified.code };
    },
  );

  // ── Finalize (segmentation + drafts), same as the trigger finalize task ────
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: {
      pages: { orderBy: { pageIndex: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
  if (!job) {
    return errorResponse("JOB_NOT_FOUND", "작업을 찾을 수 없습니다.", 404);
  }

  let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
  if (job.successPages === totalPages) finalStatus = "COMPLETED";
  else if (job.successPages === 0) finalStatus = "FAILED";
  else finalStatus = "PARTIAL";

  let draftCount = 0;
  let sourceMaterialId: string | null = null;
  try {
    if (usesStructuredExtraction(mode)) {
      const result = await finalizeStructured({
        jobId,
        items: job.items,
        pages: job.pages,
        mode,
        outputMode: job.outputMode,
        slotAuthored: job.sourceType === "IMAGES", // 크롭-네이티브(이미지)면 1슬롯=1지문
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    } else {
      const result = await finalizePlainText({
        jobId,
        pages: job.pages,
        mode,
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    }
  } catch (err) {
    await prisma.extractionJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorSummary: JSON.stringify({
            inlineFinalize: err instanceof Error ? err.message : String(err),
          }),
        },
      })
      .catch(() => {});
    return errorResponse(
      "FINALIZE_FAILED",
      "추출 마무리 단계에서 오류가 발생했습니다.",
      500,
    );
  }

  // finalizeStructured flips COMPLETED for PASSAGE_ONLY itself; ensure terminal
  // for every mode here as a safety net (idempotent).
  await prisma.extractionJob
    .update({
      where: { id: jobId },
      data: { status: finalStatus, completedAt: new Date() },
    })
    .catch(() => {});

  return NextResponse.json({
    jobId,
    status: finalStatus,
    draftCount,
    sourceMaterialId,
    successPages: job.successPages,
    failedPages: job.failedPages,
    inline: true as const,
  });
}

// Status-guarded DEAD transition. Returns true only when THIS call actually
// flipped the page to DEAD (so the caller refunds exactly once). If the page is
// already SUCCESS/DEAD (another path won the race), returns false and touches no
// counters — preventing double failedPages++/pendingPages-- (which could drive
// pendingPages negative) and double refunds.
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
        data: {
          failedPages: { increment: 1 },
          pendingPages: { decrement: 1 },
        },
      });
      return true;
    });
  } catch {
    return false;
  }
}
