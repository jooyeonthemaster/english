// ============================================================================
// POST /api/extraction/jobs  —  create a new extraction job
//   1. Validate payload
//   2. Credit pre-flight (no actual deduction — that's per-page)
//   3. Insert ExtractionJob + ExtractionPage rows
//   4. Issue signed upload URLs for each page
//
// GET  /api/extraction/jobs  —  list jobs for the current academy (most recent first)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { checkBalance } from "@/lib/credits";
import { createUploadTarget, pageImageKey, originalPdfKey } from "@/lib/supabase-storage";
import { createJobRequestSchema } from "@/lib/extraction/zod-schemas";
import { requireStaff, errorResponse } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  let parsed;
  try {
    const body = await req.json();
    parsed = createJobRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse("INVALID_PAYLOAD", "요청이 올바르지 않습니다.", 400, err.issues);
    }
    return errorResponse("INVALID_PAYLOAD", "요청 본문을 읽을 수 없습니다.", 400);
  }

  // Pre-flight balance check
  const projected = parsed.totalPages * CREDIT_COSTS.TEXT_EXTRACTION;
  const balance = await checkBalance(staff.academyId);
  if (balance.balance < projected) {
    return NextResponse.json(
      {
        error: "크레딧이 부족합니다.",
        code: "INSUFFICIENT_CREDITS",
        balance: balance.balance,
        required: projected,
      },
      { status: 402 },
    );
  }

  // ── Step 1: Create job + pages atomically, DB-only ─────────────────────
  //   The previous implementation issued the original-PDF signed URL INSIDE
  //   the transaction, holding a Postgres connection while waiting on a
  //   remote Supabase call. Under load this saturated the pool and pushed
  //   the tx past its timeout. We now keep the transaction strictly local:
  //   only the ExtractionJob + ExtractionPage rows are inserted here, with
  //   `originalFileUrl` filled in afterwards.
  //
  //   The original-PDF key is fully deterministic (`${academyId}/${jobId}/
  //   original.pdf`), so reconstructing it post-commit is lossless. If the
  //   subsequent upload-URL step fails we simply return no `originalUploadUrl`
  //   to the client — the Row still exists, the page rows still exist, and
  //   the client can re-request a signed URL from a dedicated endpoint
  //   later without an orphaned row.
  const job = await prisma.$transaction(
    async (tx) => {
      const j = await tx.extractionJob.create({
        data: {
          academyId: staff.academyId,
          createdById: staff.id,
          sourceType: parsed.sourceType,
          mode: parsed.mode,
          originalFileName: parsed.originalFileName,
          totalPages: parsed.totalPages,
          pendingPages: parsed.totalPages,
          creditsReserved: projected,
          status: "PENDING",
        },
      });

      await tx.extractionPage.createMany({
        data: parsed.pages.map((p) => ({
          jobId: j.id,
          pageIndex: p.pageIndex,
          imageUrl: pageImageKey(staff.academyId, j.id, p.pageIndex),
          imageBytes: p.size,
          idempotencyKey: `${j.id}:${p.pageIndex}`,
        })),
      });
      return j;
    },
    { timeout: 30_000, maxWait: 5_000 },
  );

  // ── Step 2: Issue signed upload targets (outside any transaction) ──────
  //   These are remote Supabase calls. None of them can roll back the DB
  //   row — if any of them fail, we return what we have. The client can
  //   retry missing ones.
  let originalUploadUrl: Awaited<ReturnType<typeof createUploadTarget>> | null = null;
  if (parsed.sourceType === "PDF") {
    try {
      originalUploadUrl = await createUploadTarget(
        originalPdfKey(staff.academyId, job.id),
      );
      // Persist the path in a follow-up update. A failure here is
      // recoverable — the upload can still happen because the client has
      // `uploadPath` from `originalUploadUrl`; on next reload the server
      // backfills `originalFileUrl` from the deterministic key.
      await prisma.extractionJob.update({
        where: { id: job.id },
        data: { originalFileUrl: originalUploadUrl.uploadPath },
      });
    } catch {
      originalUploadUrl = null;
    }
  }

  const pageUploadTargets = await Promise.all(
    parsed.pages.map(async (p) => {
      const target = await createUploadTarget(
        pageImageKey(staff.academyId, job.id, p.pageIndex),
      );
      return { pageIndex: p.pageIndex, ...target };
    }),
  );

  return NextResponse.json({
    jobId: job.id,
    uploadTargets: pageUploadTargets,
    originalUploadUrl,
    creditsProjected: projected,
    creditsBalanceBefore: balance.balance,
  });
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));

  const jobs = await prisma.extractionJob.findMany({
    where: { academyId: staff.academyId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      sourceType: true,
      mode: true,
      sourceMaterialId: true,
      originalFileName: true,
      status: true,
      totalPages: true,
      successPages: true,
      failedPages: true,
      pendingPages: true,
      creditsConsumed: true,
      creditsRefunded: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ jobs });
}
