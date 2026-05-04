// ============================================================================
// POST /api/extraction/jobs/:jobId/pages/:pageIndex/retry
// Manual retry of a failed page. Resets the page to PENDING (keeping its
// creditTxId so no double-charge) and re-triggers extraction-page.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";
import { MAX_PAGE_ATTEMPTS } from "@/lib/extraction/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string; pageIndex: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { jobId, pageIndex: pageIndexStr } = await ctx.params;
  const pageIndex = Number(pageIndexStr);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    return errorResponse("INVALID_PAYLOAD", "잘못된 pageIndex입니다.", 400);
  }

  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  const idempotencyKey = `${jobId}:${pageIndex}`;
  const page = await prisma.extractionPage.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      status: true,
      attemptCount: true,
    },
  });
  if (!page) return errorResponse("PAGE_NOT_FOUND", "페이지를 찾을 수 없습니다.", 404);

  if (page.status === "SUCCESS") {
    return errorResponse(
      "PAGE_ALREADY_SUCCEEDED",
      "이미 성공한 페이지입니다.",
      409,
    );
  }

  // Reset the page to PENDING, preserving creditTxId and extractedText.
  // Also decrement failedPages and increment pendingPages so job counters
  // stay consistent.
  const counterAdjusted = page.status === "DEAD" || page.status === "FAILED";
  await prisma.$transaction(async (tx) => {
    // Wipe any previously-emitted ExtractionItems for this page so the retry
    // does not leave duplicated blocks behind. Items that span multiple pages
    // (pageId = null) are left untouched — the segmenter will reconcile them
    // on the next run.
    await tx.extractionItem.deleteMany({
      where: { pageId: page.id },
    });

    await tx.extractionPage.update({
      where: { idempotencyKey },
      data: {
        status: "PENDING",
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        // Reset attemptCount so the retry gets the full budget again. This
        // is a user-initiated retry, distinct from automatic retries.
        attemptCount: 0,
        // Raise maxAttempts a little so that if the user retries, we don't
        // die on attempt 1 due to previous counts.
        maxAttempts: MAX_PAGE_ATTEMPTS,
      },
    });
    if (counterAdjusted) {
      await tx.extractionJob.update({
        where: { id: jobId },
        data: {
          failedPages: { decrement: 1 },
          pendingPages: { increment: 1 },
          // Whether the job was previously terminal (PARTIAL/FAILED) or
          // still live (PROCESSING), pulling a page back into the queue
          // always puts the job into PROCESSING so finalize re-runs.
          status: "PROCESSING",
          completedAt: null,
        },
      });
    }
  });

  // Re-trigger with a fresh idempotency key so Trigger.dev accepts it as a
  // new dispatch (we're deliberately starting a new attempt series).
  //
  // ORDER OF OPERATIONS — critical for orphan prevention:
  //   We already flipped the page to PENDING above. If tasks.trigger() now
  //   throws (network hiccup, quota, Trigger.dev down) the row would be
  //   stuck in PENDING with no worker attached — an orphan — and the next
  //   auto-retry would never pick it up because the reaper only salvages
  //   rows with an expired lease, not blank-ownership PENDING rows.
  //
  // Defense: on trigger failure, roll the row back to FAILED with a clear
  // errorCode so the UI shows "try again" and the reaper ignores it until
  // a human retries.
  const retryKey = `${idempotencyKey}:retry:${Date.now()}`;
  let handle: Awaited<ReturnType<typeof tasks.trigger>>;
  try {
    handle = await tasks.trigger(
      "extraction-page",
      { jobId, pageIndex },
      { idempotencyKey: retryKey },
    );
  } catch (err) {
    // Rollback: restore the page to a terminal-ish state so counters stay
    // consistent and the UI reflects the dispatch failure. We only reverse
    // the counter shift (failed→pending) if we actually performed it above;
    // otherwise we'd decrement pendingPages below zero.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.extractionPage.update({
          where: { idempotencyKey },
          data: {
            status: "FAILED",
            errorCode: "TRIGGER_DISPATCH_FAILED",
            errorMessage:
              err instanceof Error
                ? err.message.slice(0, 500)
                : "trigger dispatch failed",
          },
        });
        if (counterAdjusted) {
          await tx.extractionJob.update({
            where: { id: jobId },
            data: {
              failedPages: { increment: 1 },
              pendingPages: { decrement: 1 },
            },
          });
        }
      });
    } catch {
      // Best-effort: if rollback itself fails, the reaper will eventually
      // reconcile — but we still surface the dispatch error to the caller.
    }
    return errorResponse(
      "TRIGGER_DISPATCH_FAILED",
      "워커 디스패치에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  return NextResponse.json({
    pageIndex,
    status: "PENDING" as const,
    triggered: true as const,
    triggerRunId: handle.id,
  });
}
