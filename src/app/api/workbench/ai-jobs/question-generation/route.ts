import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  academyConcurrencyKey,
  WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionGenerationPlan } from "@/lib/question-generation-plans";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import {
  readQuestionTypeDifficultySetting,
  readQuestionTypeGenerationPlanSetting,
  readIrrelevantSlotCountSetting,
  validateIrrelevantAgainstPassage,
} from "@/lib/question-type-generation-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  passageId: z.string().min(1),
  mode: z.literal("MANUAL").default("MANUAL"),
  count: z.number().int().min(1).max(50).default(1),
  questionType: z.string().optional(),
  questionTypeSettings: z.unknown().optional(),
  difficulty: z.string().default("INTERMEDIATE"),
  customPrompt: z.string().optional(),
  generationPlan: z.unknown().optional(),
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

  if (parsed.data.mode === "MANUAL" && !parsed.data.questionType) {
    return NextResponse.json(
      { error: "questionType is required for manual generation" },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: parsed.data.passageId, academyId: staff.academyId },
    select: {
      id: true,
      title: true,
      content: true,
    },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "QUESTION_GENERATION",
    passageId: passage.id,
  });

  // ── IRRELEVANT slot count guardrail (MANUAL mode only — AUTO planner picks its own count) ──
  if (parsed.data.mode === "MANUAL" && parsed.data.questionType === "IRRELEVANT") {
    const requestedSlotCount = readIrrelevantSlotCountSetting(parsed.data.questionTypeSettings);
    const passageSentenceCount = countPassageSentences(passage.content);
    const v = validateIrrelevantAgainstPassage(requestedSlotCount, passageSentenceCount);
    if (!v.ok) {
      return NextResponse.json(
        {
          error: v.error,
          code: "IRRELEVANT_SLOT_COUNT_TOO_HIGH",
          passageSentenceCount,
          requestedSlotCount,
          maxSlotCount: v.effective,
        },
        { status: 400 },
      );
    }
  }

  const generationPlan = normalizeQuestionGenerationPlan(
    parsed.data.generationPlan,
  );
  const effectiveGenerationPlan =
    parsed.data.mode === "MANUAL" && parsed.data.questionType
      ? readQuestionTypeGenerationPlanSetting(
          parsed.data.questionTypeSettings,
          generationPlan,
        )
      : generationPlan;
  const effectiveDifficulty =
    parsed.data.mode === "MANUAL" && parsed.data.questionType
      ? readQuestionTypeDifficultySetting(
          parsed.data.questionTypeSettings,
          parsed.data.difficulty,
        )
      : readQuestionTypeDifficultySetting(undefined, parsed.data.difficulty);
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "QUESTION_GENERATION",
      status: "PENDING",
      title: passage.title,
      passageId: passage.id,
      mode: parsed.data.mode,
      questionType: parsed.data.questionType ?? null,
      generationPlan: effectiveGenerationPlan,
      difficulty: effectiveDifficulty,
      requestedCount: parsed.data.count,
      config: {
        mode: parsed.data.mode,
        count: parsed.data.count,
        questionType: parsed.data.questionType ?? null,
        questionTypeSettings: parsed.data.questionTypeSettings ?? null,
        difficulty: effectiveDifficulty,
        customPrompt: parsed.data.customPrompt ?? "",
        generationPlan: effectiveGenerationPlan,
      },
    },
  });

  try {
    const handle = await tasks.trigger(
      "workbench-question-generation",
      { jobId: job.id },
      {
        idempotencyKey: `workbench-question-generation:${job.id}`,
        queue: WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
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
      { error: "Failed to enqueue question generation job", details: message },
      { status: 502 },
    );
  }

  return NextResponse.json({ jobId: job.id, status: "PENDING" });
}
