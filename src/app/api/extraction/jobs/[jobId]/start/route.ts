// ============================================================================
// POST /api/extraction/jobs/:jobId/start
// Called after the client has uploaded all page images to the signed URLs
// issued by POST /jobs. Triggers the orchestrator task.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

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

  // Trigger the orchestrator. Using idempotencyKey so replays are safe.
  const handle = await tasks.trigger("extraction-orchestrator", { jobId }, {
    idempotencyKey: `orchestrator:${jobId}`,
  });

  return NextResponse.json({
    jobId,
    status: "PROCESSING" as const,
    triggerRunId: handle.id,
  });
}
