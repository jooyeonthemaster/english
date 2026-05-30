import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  academyConcurrencyKey,
  WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import { normalizeAnalysisTone } from "@/lib/passage-analysis-options";
import { normalizeQuestionGenerationPlan } from "@/lib/question-generation-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  passageId: z.string().min(1),
  customPrompt: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  targetLevel: z.string().optional(),
  generationPlan: z.unknown().optional(),
  analysisTone: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: parsed.data.passageId, academyId: staff.academyId },
    select: { id: true, title: true },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  const active = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: staff.academyId,
      domain: "PASSAGE_ANALYSIS",
      passageId: passage.id,
      status: { in: ["PENDING", "PROCESSING"] },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    return NextResponse.json({ jobId: active.id, status: active.status });
  }

  const generationPlan = normalizeQuestionGenerationPlan(
    parsed.data.generationPlan,
  );
  const analysisTone = normalizeAnalysisTone(parsed.data.analysisTone);
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "PASSAGE_ANALYSIS",
      status: "PENDING",
      title: passage.title,
      passageId: passage.id,
      mode: "FULL",
      generationPlan,
      requestedCount: 1,
      config: {
        customPrompt: parsed.data.customPrompt ?? "",
        focusAreas: parsed.data.focusAreas ?? [],
        targetLevel: parsed.data.targetLevel ?? "",
        generationPlan,
        analysisTone,
      },
    },
  });

  try {
    const handle = await tasks.trigger(
      "workbench-passage-analysis",
      { jobId: job.id },
      {
        idempotencyKey: `workbench-passage-analysis:${job.id}`,
        queue: WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
        concurrencyKey: academyConcurrencyKey(staff.academyId),
      },
    );

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: { triggerRunId: handle.id },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to enqueue Trigger.dev task.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "Failed to enqueue passage analysis job", details: message },
      { status: 502 },
    );
  }

  return NextResponse.json({ jobId: job.id, status: "PENDING" });
}
