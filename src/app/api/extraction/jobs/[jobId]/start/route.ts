// ============================================================================
// POST /api/extraction/jobs/:jobId/start
// Called after the client has uploaded all page images to the signed URLs
// issued by POST /jobs. Triggers the orchestrator task.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { DIRECT_PASSAGE_MAX_PAGES } from "@/lib/extraction/constants";
import { processPassageOnlyJobDirect } from "@/lib/extraction/direct-passage-processor";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";
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

  if (
    parsed.data.engine === "direct" &&
    auth.job.mode === "PASSAGE_ONLY" &&
    auth.job.totalPages <= DIRECT_PASSAGE_MAX_PAGES
  ) {
    const result = await processPassageOnlyJobDirect(jobId);
    return NextResponse.json({
      jobId,
      status: result.status,
      direct: true as const,
      draftCount: result.draftCount,
    });
  }

  if (
    parsed.data.engine === "direct" &&
    auth.job.mode === "PASSAGE_ONLY" &&
    auth.job.totalPages > DIRECT_PASSAGE_MAX_PAGES
  ) {
    return errorResponse(
      "DIRECT_PAGE_LIMIT_EXCEEDED",
      `빠른 추출은 최대 ${DIRECT_PASSAGE_MAX_PAGES}페이지까지 가능합니다. 백그라운드 추출을 선택해 주세요.`,
      400,
      { maxPages: DIRECT_PASSAGE_MAX_PAGES, actual: auth.job.totalPages },
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
