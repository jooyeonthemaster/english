import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  academyConcurrencyKey,
  TUTOR_PROGRAM_GENERATION_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import {
  TUTOR_PROGRAM_GENERATION_DOMAIN,
  type TutorProgramPublishTargetType,
} from "@/lib/tutor/program-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  templateKey: z.string().default("basic_interpret"),
  passageIds: z.array(z.string().min(1)).min(1).max(12),
  publishTargetType: z.enum(["NONE", "ALL_ACTIVE", "CLASS", "STUDENT", "SCHOOL_GRADE", "SCHOOL"]).default("NONE"),
  publishTargetId: z.string().optional(),
  dueAt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const passageIds = Array.from(new Set(parsed.data.passageIds.map((id) => id.trim()).filter(Boolean)));
  if (passageIds.length === 0) {
    return NextResponse.json({ error: "No passages selected" }, { status: 400 });
  }
  if (parsed.data.publishTargetType !== "NONE" && !parsed.data.publishTargetId) {
    return NextResponse.json({ error: "Distribution target is required" }, { status: 400 });
  }

  const passages = await prisma.passage.findMany({
    where: { id: { in: passageIds }, academyId: staff.academyId },
    select: { id: true, title: true, analysis: { select: { id: true } } },
  });
  if (passages.length !== passageIds.length) {
    return NextResponse.json({ error: "Some selected passages were not found" }, { status: 404 });
  }
  if (passages.some((passage) => !passage.analysis)) {
    return NextResponse.json(
      { error: "Only analyzed passages can be used for tutor program generation" },
      { status: 400 },
    );
  }

  const config = {
    title: parsed.data.title.trim(),
    description: parsed.data.description.trim(),
    templateKey: parsed.data.templateKey,
    passageIds,
    publishTargetType: parsed.data.publishTargetType as TutorProgramPublishTargetType,
    publishTargetId: parsed.data.publishTargetId || undefined,
    dueAt: parsed.data.dueAt || undefined,
  };

  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: TUTOR_PROGRAM_GENERATION_DOMAIN,
      status: "PENDING",
      title: config.title,
      mode: "AUTO",
      generationPlan: "STANDARD",
      difficulty: "INTERMEDIATE",
      requestedCount: passageIds.length,
      config: JSON.parse(JSON.stringify(config)),
      result: JSON.parse(JSON.stringify({
        title: config.title,
        status: "PROCESSING",
        totalPassages: passageIds.length,
        completedPassages: 0,
        activityCount: 0,
        estimatedMin: 0,
        currentPassageTitle: passages[0]?.title,
        lessons: passageIds.map((passageId) => {
          const passage = passages.find((item) => item.id === passageId);
          return {
            passageId,
            title: passage?.title ?? "선택 지문",
            contentPreview: "",
            activityCount: 0,
            ruleBasedCount: 0,
            examAlignedCount: 0,
            activities: [],
            warnings: [],
          };
        }),
        warnings: [],
      })),
    },
  });

  try {
    const handle = await tasks.trigger(
      "tutor-program-generation",
      { jobId: job.id },
      {
        idempotencyKey: `tutor-program-generation:${job.id}`,
        queue: TUTOR_PROGRAM_GENERATION_QUEUE_NAME,
        concurrencyKey: academyConcurrencyKey(staff.academyId),
      },
    );

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: { triggerRunId: handle.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enqueue Trigger.dev task.";
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
      { error: "Failed to enqueue tutor program generation job", details: message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    jobId: job.id,
    status: "PENDING",
    createdAt: job.createdAt.toISOString(),
  });
}
