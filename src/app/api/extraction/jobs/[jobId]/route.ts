// ============================================================================
// GET    /api/extraction/jobs/:jobId  —  full snapshot + pages + results
// DELETE /api/extraction/jobs/:jobId  —  hard delete (row + storage)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";
import {
  createSignedDownloadUrl,
  pageImageKey,
  removeJobAssets,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  const [pages, results, items, sourceMaterial] = await Promise.all([
    prisma.extractionPage.findMany({
      where: { jobId },
      orderBy: { pageIndex: "asc" },
      select: {
        pageIndex: true,
        status: true,
        attemptCount: true,
        extractedText: true,
        confidence: true,
        errorCode: true,
        errorMessage: true,
        latencyMs: true,
        imageUrl: true,
      },
    }),
    prisma.extractionResult.findMany({
      where: { jobId },
      orderBy: { passageOrder: "asc" },
    }),
    prisma.extractionItem.findMany({
      where: { jobId },
      orderBy: { order: "asc" },
    }),
    auth.job.sourceMaterialId
      ? prisma.sourceMaterial.findFirst({
          where: {
            id: auth.job.sourceMaterialId,
            academyId: staff.academyId,
          },
        })
      : Promise.resolve(null),
  ]);

  // Sign each imageUrl so the review UI can display the original page.
  const signed = await Promise.all(
    pages.map(async (p) => {
      let signedUrl: string | null = null;
      if (p.imageUrl) {
        try {
          signedUrl = await createSignedDownloadUrl(p.imageUrl, 60 * 30);
        } catch {
          signedUrl = null;
        }
      }
      return {
        pageIndex: p.pageIndex,
        status: p.status,
        attemptCount: p.attemptCount,
        extractedText: p.extractedText,
        confidence: p.confidence,
        errorCode: p.errorCode,
        errorMessage: p.errorMessage,
        latencyMs: p.latencyMs,
        imageUrl: signedUrl,
      };
    }),
  );

  return NextResponse.json({
    job: {
      id: auth.job.id,
      academyId: auth.job.academyId,
      createdById: auth.job.createdById,
      sourceType: auth.job.sourceType,
      mode: auth.job.mode,
      sourceMaterialId: auth.job.sourceMaterialId,
      originalFileName: auth.job.originalFileName,
      status: auth.job.status,
      totalPages: auth.job.totalPages,
      successPages: auth.job.successPages,
      failedPages: auth.job.failedPages,
      pendingPages: auth.job.pendingPages,
      creditsConsumed: auth.job.creditsConsumed,
      creditsRefunded: auth.job.creditsRefunded,
      createdAt: auth.job.createdAt.toISOString(),
      startedAt: auth.job.startedAt?.toISOString() ?? null,
      completedAt: auth.job.completedAt?.toISOString() ?? null,
    },
    pages: signed,
    results,
    items,
    sourceMaterial,
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  // Hard guard: an in-flight PROCESSING job still has active workers writing
  // to its ExtractionPage / ExtractionItem rows. Deleting the parent mid-
  // stream would cascade to missing FK parents for those writes and leave
  // the worker emitting confusing 2001 (record not found) errors. Force the
  // caller to cancel first.
  if (auth.job.status === "PROCESSING") {
    return errorResponse(
      "JOB_IN_PROGRESS",
      "진행 중인 작업은 먼저 취소해야 삭제할 수 있습니다.",
      409,
      { currentStatus: auth.job.status },
    );
  }

  // Storage first (best-effort — DB is source of truth).
  try {
    await removeJobAssets(auth.job.academyId, auth.job.id);
  } catch (e) {
    // non-fatal
    void e;
  }

  await prisma.extractionJob.delete({ where: { id: jobId } });

  // Silence unused-import lint
  void pageImageKey;

  return NextResponse.json({ jobId, deleted: true });
}
