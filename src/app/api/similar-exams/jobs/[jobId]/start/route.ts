import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import {
  academyConcurrencyKey,
  SIMILAR_EXAM_GENERATION_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import { processSimilarExamGenerationJob } from "@/lib/similar-exam-generation/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

function shouldUseLocalRunner() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.TRIGGER_SECRET_KEY?.startsWith("tr_prod") === true
  );
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const job = await prisma.similarExamGenerationJob.findFirst({
    where: {
      id: jobId,
      academyId: staff.academyId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      pageImageUrls: true,
      totalPages: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "PENDING") {
    return NextResponse.json(
      { error: "Job already started", currentStatus: job.status },
      { status: 409 },
    );
  }
  if (!Array.isArray(job.pageImageUrls) || job.pageImageUrls.length !== job.totalPages) {
    return NextResponse.json(
      { error: "Page upload metadata is incomplete." },
      { status: 409 },
    );
  }

  if (shouldUseLocalRunner()) {
    const runId = `local_similar_exam_${jobId}_${Date.now()}`;
    await prisma.similarExamGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        stage: "OCR",
        startedAt: new Date(),
        triggerRunId: runId,
      },
    });

    void processSimilarExamGenerationJob(jobId, {
      runId,
      logger: {
        info: (message, data) => console.info(message, data),
        error: (message, data) => console.error(message, data),
      },
    }).catch((error) => {
      console.error("[similar-exam-generation] local runner failed", error);
    });

    return NextResponse.json({
      jobId,
      status: "PROCESSING" as const,
      triggerRunId: runId,
      runner: "local" as const,
    });
  }

  const handle = await tasks.trigger(
    "similar-exam-generation",
    { jobId },
    {
      idempotencyKey: `similar-exam-generation:${jobId}`,
      queue: SIMILAR_EXAM_GENERATION_QUEUE_NAME,
      concurrencyKey: academyConcurrencyKey(staff.academyId),
    },
  );

  await prisma.similarExamGenerationJob.update({
    where: { id: jobId },
    data: {
      status: "PROCESSING",
      stage: "OCR",
      startedAt: new Date(),
      triggerRunId: handle.id,
    },
  });

  return NextResponse.json({
    jobId,
    status: "PROCESSING" as const,
    triggerRunId: handle.id,
  });
}
