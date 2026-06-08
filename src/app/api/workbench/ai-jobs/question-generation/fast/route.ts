import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import {
  providerFromModel,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import {
  getQuestionGenerationCreditCost,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { saveGeneratedQuestionsForJob } from "@/lib/question-generation-persistence";
import { prisma } from "@/lib/prisma";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { buildPlanningPrompt } from "@/app/api/ai/generate-questions-auto/_lib/prompts";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import {
  planSchema,
  type PlanResult,
} from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import {
  readIrrelevantSlotCountSetting,
  validateIrrelevantAgainstPassage,
} from "@/lib/question-type-generation-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

const requestSchema = z.object({
  passageId: z.string().min(1),
  mode: z.enum(["AUTO", "MANUAL"]).default("MANUAL"),
  count: z.number().int().min(1).max(1).default(1),
  questionType: z.string().optional(),
  questionTypeSettings: z.unknown().optional(),
  difficulty: z.string().default("INTERMEDIATE"),
  customPrompt: z.string().optional(),
  generationPlan: z.unknown().optional(),
});

function getOperationType({
  mode,
  questionType,
}: {
  mode: "AUTO" | "MANUAL";
  questionType?: string;
}): OperationType {
  if (mode === "AUTO") return "AUTO_GEN_BATCH";
  return questionType && VOCAB_TYPES.has(questionType)
    ? "QUESTION_GEN_VOCAB"
    : "QUESTION_GEN_SINGLE";
}

function buildManualPlan({
  questionType,
  count,
}: {
  questionType?: string;
  count: number;
}): PlanResult["plan"] {
  if (!questionType) {
    throw new Error("Manual question generation requires questionType.");
  }
  return [
    {
      subType: questionType,
      count,
      reason: "Manual teacher-selected question type.",
      targetPoints: [],
    },
  ];
}

function capPlanToCount(
  plan: PlanResult["plan"],
  requestedCount: number,
): PlanResult["plan"] {
  let remaining = Math.max(1, Math.floor(requestedCount));
  const capped: PlanResult["plan"] = [];

  for (const item of plan) {
    if (remaining <= 0) break;
    const itemCount = Math.max(0, Math.floor(Number(item.count) || 0));
    const nextCount = Math.min(itemCount, remaining);
    if (nextCount <= 0) continue;
    capped.push({ ...item, count: nextCount });
    remaining -= nextCount;
  }

  return capped;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  provider: ReturnType<typeof providerFromModel>;
  model: string;
  operationType: OperationType;
  inputTokens: number;
  outputTokens: number;
  usageAt: Date;
  metadata: Record<string, unknown>;
}) {
  try {
    await recordPlatformApiUsageCost({
      sourceKey: input.sourceKey,
      sourceType: "WORKBENCH_AI_JOB",
      sourceId: input.sourceId,
      sourceDetail: input.sourceDetail,
      academyId: input.academyId,
      provider: input.provider,
      model: input.model,
      operationType: input.operationType,
      unitType: "TOKENS",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      usageAt: input.usageAt,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("[workbench-fast-question] Failed to record API cost", error);
  }
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
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

  const config = {
    ...parsed.data,
    generationPlan: normalizeQuestionGenerationPlan(parsed.data.generationPlan),
  };

  if (config.mode === "MANUAL" && !config.questionType) {
    return NextResponse.json(
      { error: "questionType is required for manual generation" },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: config.passageId, academyId: staff.academyId },
    include: {
      school: { select: { type: true, name: true } },
      analysis: { select: { analysisData: true } },
      notes: { orderBy: { order: "asc" } },
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

  // ── IRRELEVANT slot count guardrail (MANUAL mode only) ────────────────
  if (config.mode === "MANUAL" && config.questionType === "IRRELEVANT") {
    const requestedSlotCount = readIrrelevantSlotCountSetting(config.questionTypeSettings);
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

  const now = new Date();
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "QUESTION_GENERATION",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: config.mode,
      questionType: config.questionType ?? null,
      generationPlan: config.generationPlan,
      difficulty: config.difficulty,
      requestedCount: config.count,
      startedAt: now,
      config: {
        mode: config.mode,
        count: config.count,
        questionType: config.questionType ?? null,
        questionTypeSettings: config.questionTypeSettings ?? null,
        difficulty: config.difficulty,
        customPrompt: config.customPrompt ?? "",
        generationPlan: config.generationPlan,
        fastPath: true,
      },
    },
  });

  const operationType = getOperationType(config);
  const creditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS[operationType],
    config.generationPlan,
  );
  let creditTxId: string | null = null;
  let creditMs = 0;
  let planningMs = 0;
  let generationMs = 0;
  let generationAttempts = 0;
  let persistenceMs = 0;
  let generationRejectionSummary: unknown = null;

  try {
    const creditStartedAt = Date.now();
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: job.academyId,
      staffId: job.createdById,
      operationType,
      metadata: {
        passageId: passage.id,
        mode: config.mode,
        questionType: config.questionType,
        count: config.count,
        generationPlan: config.generationPlan,
        creditCost,
        fastPath: true,
      },
      creditCost,
    });
    creditMs = Date.now() - creditStartedAt;
    creditTxId = credit.transactionId;

    const schoolType =
      passage.school?.type === "MIDDLE"
        ? "\uc911\ud559\uad50"
        : "\uace0\ub4f1\ud559\uad50";
    const gradeInfo = passage.grade ? `${passage.grade}\ud559\ub144` : "";
    const teacherAnnotations = extractTeacherAnnotations(passage);
    const teacherIntentBlock = buildQuestionAnnotationBlock(teacherAnnotations);
    const analysisContext = buildAnalysisContext(passage);
    const diffLabel = config.difficulty || "INTERMEDIATE";
    const diffInstruction =
      DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE;

    let plan: PlanResult["plan"];
    let rationale = "";
    if (config.mode === "AUTO") {
      const planningStartedAt = Date.now();
      const planningResult = await generateQuestionObject({
        schema: planSchema,
        prompt: buildPlanningPrompt({
          schoolType,
          gradeInfo,
          count: config.count,
          passageContent: passage.content,
          teacherIntentBlock,
          analysisContext,
          customPrompt: config.customPrompt,
          diffLabel,
          generationPlan: config.generationPlan,
        }),
        generationPlan: config.generationPlan,
        logPrefix: "WORKBENCH-FAST-AUTO-GEN-PLAN",
        maxTokens: 4_096,
      });
      const planResult = planningResult.object;
      const planUsage = readAiUsageTokens(planningResult.usage);
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:planning`,
        sourceId: job.id,
        sourceDetail: "QUESTION_PLANNING",
        academyId: job.academyId,
        provider: providerFromModel(planningResult.modelId),
        model: planningResult.modelId,
        operationType,
        inputTokens: planUsage.inputTokens,
        outputTokens: planUsage.outputTokens,
        usageAt: new Date(),
        metadata: {
          passageId: passage.id,
          generationPlan: config.generationPlan,
          fastPath: true,
          attempts: planningResult.attempts,
          durationMs: planningResult.durationMs,
        },
      });
      planningMs = Date.now() - planningStartedAt;
      plan = capPlanToCount(planResult.plan, config.count);
      rationale = planResult.rationale;
    } else {
      plan = buildManualPlan({
        questionType: config.questionType,
        count: config.count,
      });
    }

    if (plan.length === 0) {
      throw new Error("No question generation plan was produced.");
    }

    const generationStartedAt = Date.now();
    const generationResult = await runQuestionGenerationWithEmptyRetry(
      {
        plan,
        schoolType,
        gradeInfo,
        passageContent: passage.content,
        teacherIntentBlock,
        analysisContext,
        diffLabel,
        diffInstruction,
        generationPlan: config.generationPlan,
        customPrompt: config.customPrompt,
        typeSettings:
          config.mode === "MANUAL" && config.questionType
            ? { [config.questionType]: config.questionTypeSettings }
            : undefined,
      },
      { logPrefix: "WORKBENCH-FAST-Q-GEN" },
    );
    const questions = generationResult.questions;
    for (const [idx, event] of generationResult.usageEvents.entries()) {
      const usage = readAiUsageTokens(event.usage);
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:generation:${idx}`,
        sourceId: job.id,
        sourceDetail: `QUESTION_GENERATION:${event.subType}`,
        academyId: job.academyId,
        provider: providerFromModel(event.modelId),
        model: event.modelId,
        operationType,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        usageAt: new Date(),
        metadata: {
          passageId: passage.id,
          generationPlan: config.generationPlan,
          fastPath: true,
          qualityMode: event.qualityMode,
          attempts: event.attempts,
          durationMs: event.durationMs,
        },
      });
    }
    generationAttempts = generationResult.attempts;
    generationMs = Date.now() - generationStartedAt;
    const relaxedFallback = generationResult.relaxedFallback;
    generationRejectionSummary = generationResult.rejectionSummary;

    const questionsForDisplay = questions.slice(0, config.count).map((question) => {
      const tags = mergeQuestionGenerationPlanTag(
        readQuestionTags(question.tags),
        config.generationPlan,
      );
      return {
        ...question,
        _generationPlan: config.generationPlan,
        tags,
      };
    });

    if (questionsForDisplay.length === 0) {
      throw new Error(
        `No questions generated after ${generationAttempts} generation attempt${
          generationAttempts === 1 ? "" : "s"
        }. ${generationResult.rejectionSummary.message}`,
      );
    }

    const persistenceStartedAt = Date.now();
    const createdQuestionIds = await saveGeneratedQuestionsForJob({
      academyId: job.academyId,
      passageId: passage.id,
      questions: questionsForDisplay,
      generationPlan: config.generationPlan,
      skipPassageEligibilityCheck: true,
    });
    persistenceMs = Date.now() - persistenceStartedAt;

    const completedAt = new Date();
    const debugTiming = {
      queueWaitMs: 0,
      creditMs,
      planningMs,
      generationAttempts,
      relaxedFallback: relaxedFallback ? 1 : 0,
      generationMs,
      persistenceMs,
      totalRunMs: Date.now() - requestStartedAt,
    };

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successCount: questionsForDisplay.length,
        failedCount: 0,
        resultCount: questionsForDisplay.length,
        result: JSON.parse(JSON.stringify({
          passageId: passage.id,
          questions: questionsForDisplay,
          questionIds: createdQuestionIds,
          rationale,
          generationPlan: config.generationPlan,
          debugTiming,
          fastPath: true,
        })),
        completedAt,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      status: "COMPLETED",
      questions: questionsForDisplay,
      questionIds: createdQuestionIds,
      generationPlan: config.generationPlan,
      creditsRemaining: credit.balanceAfter,
      createdAt: job.createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
      debugTiming,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }

    if (creditTxId) {
      await refundCredits(
        job.academyId,
        operationType,
        creditTxId,
        "Fast workbench question generation failed",
        creditCost,
      ).catch((refundErr) => {
        console.error("Fast question generation refund failed", refundErr);
      });
    }

    const message =
      err instanceof Error ? err.message : "Question generation failed.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: message,
        result: JSON.parse(JSON.stringify({
          passageId: passage.id,
          generationPlan: config.generationPlan,
          debugTiming: {
            queueWaitMs: 0,
            creditMs,
            planningMs,
            generationAttempts,
            generationMs,
            persistenceMs,
            totalRunMs: Date.now() - requestStartedAt,
          },
          rejectionSummary: generationRejectionSummary,
          fastPath: true,
        })),
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Question generation failed", details: message },
      { status: 500 },
    );
  }
}
