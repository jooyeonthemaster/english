// ============================================================================
// POST /api/extraction/jobs/:jobId/cancel
// Mark the job + all non-terminal pages as CANCELLED / SKIPPED.
// In-flight Gemini calls on the worker cannot be preempted; they will finish
// and then see the CANCELLED status and become no-ops per the reaper.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  if (["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(auth.job.status)) {
    return errorResponse(
      "JOB_ALREADY_TERMINAL",
      "이미 종료된 작업입니다.",
      409,
      { currentStatus: auth.job.status },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.extractionPage.updateMany({
      where: {
        jobId,
        status: { in: ["PENDING", "FAILED"] },
      },
      data: { status: "SKIPPED" },
    });
    await tx.extractionJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });
  });

  return NextResponse.json({ jobId, status: "CANCELLED" as const });
}
