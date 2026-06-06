// ============================================================================
// POST /api/extraction/jobs/:jobId/start
// Called after the client has uploaded all page images to the signed URLs
// issued by POST /jobs.
//
// Dispatches the per-page OCR tasks DIRECTLY from this route — the former
// `extraction-orchestrator` task (a separate trigger.dev run whose only job was
// to flip status + batchTrigger pages) added a full pod cold-start (~5.5s) +
// its own DB round-trip (~3s) for zero OCR work. Doing it here (this Vercel
// function is already warm) removes that hop. Durability is preserved by
// `extraction-reaper` (5-min cron), which re-dispatches any PENDING pages of a
// PROCESSING job — so a partially-dispatched batch still gets swept up.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import {
  academyConcurrencyKey,
  EXTRACTION_PAGE_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";
import type { ExtractionMode } from "@/lib/extraction/types";
import { startJobRequestSchema } from "@/lib/extraction/zod-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

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
    return errorResponse(
      "JOB_ALREADY_STARTED",
      "이미 시작된 작업입니다.",
      409,
      { currentStatus: auth.job.status },
    );
  }

  // Sanity check: we have the expected number of page rows
  const pageCount = await prisma.extractionPage.count({ where: { jobId } });
  if (pageCount !== auth.job.totalPages) {
    return errorResponse(
      "UPLOAD_INCOMPLETE",
      "페이지 업로드가 완료되지 않았습니다.",
      409,
      { expected: auth.job.totalPages, actual: pageCount },
    );
  }

  // Load pages (with idempotencyKey, in pageIndex order) — this is what the
  // orchestrator used to do.
  const pages = await prisma.extractionPage.findMany({
    where: { jobId },
    orderBy: { pageIndex: "asc" },
    select: { pageIndex: true, idempotencyKey: true },
  });

  const mode = (auth.job.mode as ExtractionMode) ?? "PASSAGE_ONLY";

  // PENDING→PROCESSING atomic flip. The `where: { status: "PENDING" }` guard
  // makes this idempotent against concurrent /start calls and replays: only the
  // first one flips (count===1) and dispatches; a racing second sees count===0
  // and returns without double-dispatching.
  const flip = await prisma.extractionJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "PROCESSING", startedAt: new Date() },
  });
  if (flip.count === 0) {
    return NextResponse.json({ jobId, status: "PROCESSING" as const });
  }

  // Dispatch one extraction-page task per page DIRECTLY (no orchestrator hop).
  // Triggered by STRING id (not the task object) so the worker module graph is
  // not pulled into this route's bundle — same pattern the route used before.
  // `idempotencyKey` dedupes dispatch-level replays; `concurrencyKey` applies
  // the per-academy page concurrency; `mode` rides in the payload so the page
  // worker can skip a job→page join.
  const batch = await tasks.batchTrigger(
    "extraction-page",
    pages.map((p) => ({
      payload: { jobId, pageIndex: p.pageIndex, mode },
      options: {
        idempotencyKey: p.idempotencyKey,
        queue: EXTRACTION_PAGE_QUEUE_NAME,
        concurrencyKey: academyConcurrencyKey(auth.job.academyId),
      },
    })),
  );

  // Preserve a handle for traceability/cleanup. Best-effort — cancel works off
  // job.status, not this id, so a failure here is non-fatal.
  await prisma.extractionJob
    .update({ where: { id: jobId }, data: { triggerRunId: batch.batchId } })
    .catch(() => {});

  return NextResponse.json({
    jobId,
    status: "PROCESSING" as const,
    dispatched: pages.length,
    batchId: batch.batchId,
  });
}
