import { logger, task } from "@trigger.dev/sdk/v3";

import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import {
  WORKBENCH_QUESTION_GENERATION_QUEUE_CONCURRENCY,
  WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
  WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS,
  GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,
} from "@/lib/concurrency-config";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import {
  getQuestionGenerationCreditCost,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { saveGeneratedQuestionsForJob } from "@/lib/question-generation-persistence";
import { prisma } from "@/lib/prisma";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { buildPlanningPrompt } from "@/app/api/ai/generate-questions-auto/_lib/prompts";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { planSchema, type PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";

type Input = { jobId: string };

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

interface QuestionJobConfig {
  mode: "AUTO" | "MANUAL";
  count: number;
  questionType?: string;
  questionTypeSettings?: unknown;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
}

function parseConfig(value: unknown, fallbackPlan: unknown): QuestionJobConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const mode = raw.mode === "MANUAL" ? "MANUAL" : "AUTO";
  return {
    mode,
    count:
      typeof raw.count === "number" && Number.isFinite(raw.count)
        ? Math.max(1, Math.floor(raw.count))
        : 1,
    questionType:
      typeof raw.questionType === "string" ? raw.questionType : undefined,
    questionTypeSettings: raw.questionTypeSettings,
    difficulty:
      typeof raw.difficulty === "string" ? raw.difficulty : "INTERMEDIATE",
    customPrompt:
      typeof raw.customPrompt === "string" ? raw.customPrompt : undefined,
    generationPlan: normalizeQuestionGenerationPlan(
      raw.generationPlan ?? fallbackPlan,
    ),
  };
}

function getOperationType(config: QuestionJobConfig): OperationType {
  if (config.mode === "AUTO") return "AUTO_GEN_BATCH";
  return config.questionType && VOCAB_TYPES.has(config.questionType)
    ? "QUESTION_GEN_VOCAB"
    : "QUESTION_GEN_SINGLE";
}

function buildManualPlan(config: QuestionJobConfig): PlanResult["plan"] {
  if (!config.questionType) {
    throw new Error("Manual question generation requires questionType.");
  }
  return [
    {
      subType: config.questionType,
      count: config.count,
      reason: "Manual teacher-selected question type.",
      targetPoints: [],
    },
  ];
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

export const workbenchQuestionGenerationTask = task({
  id: "workbench-question-generation",
  queue: {
    name: WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
    concurrencyLimit: WORKBENCH_QUESTION_GENERATION_QUEUE_CONCURRENCY,
  },
  retry: {
    maxAttempts: WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  maxDuration: 600,
  async run(payload: Input, { ctx }) {
    const { jobId } = payload;
    const now = new Date();
    const taskStartedAt = Date.now();
    let creditMs = 0;
    let planningMs = 0;
    let generationMs = 0;
    let persistenceMs = 0;
    let generationAttempts = 0;

    const job = await prisma.workbenchAiJob.findUnique({
      where: { id: jobId },
      include: {
        passage: {
          include: {
            school: { select: { type: true, name: true } },
            analysis: { select: { analysisData: true } },
            notes: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!job || job.domain !== "QUESTION_GENERATION") {
      return { skipped: true as const, reason: "JOB_NOT_FOUND" };
    }
    if (["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(job.status)) {
      return { skipped: true as const, status: job.status };
    }
    if (!job.passage) {
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: "Passage not found.",
          completedAt: now,
        },
      });
      return { error: "PASSAGE_NOT_FOUND" as const };
    }
    const config = parseConfig(job.config, job.generationPlan);
    const operationType = getOperationType(config);
    const baseCost = CREDIT_COSTS[operationType];
    const creditCost = getQuestionGenerationCreditCost(
      baseCost,
      config.generationPlan,
    );

    await prisma.workbenchAiJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        startedAt: job.startedAt ?? now,
        triggerRunId: ctx.run.id,
      },
    });

    let creditTxId: string | null = null;
    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType,
        metadata: {
          passageId: job.passage.id,
          mode: config.mode,
          questionType: config.questionType,
          count: config.count,
          generationPlan: config.generationPlan,
          creditCost,
        },
        creditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      creditTxId = credit.transactionId;

      const schoolType =
        job.passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
      const gradeInfo = job.passage.grade ? `${job.passage.grade}학년` : "";
      const teacherAnnotations = extractTeacherAnnotations(job.passage);
      const teacherIntentBlock = buildQuestionAnnotationBlock(teacherAnnotations);
      const analysisContext = buildAnalysisContext(job.passage);
      const diffLabel = config.difficulty || "INTERMEDIATE";
      const diffInstruction =
        DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE;

      let plan: PlanResult["plan"];
      let rationale = "";
      if (config.mode === "AUTO") {
        const planningStartedAt = Date.now();
        const { object: planResult } = await generateQuestionObject({
          schema: planSchema,
          prompt: buildPlanningPrompt({
            schoolType,
            gradeInfo,
            count: config.count,
            passageContent: job.passage.content,
            teacherIntentBlock,
            analysisContext,
            customPrompt: config.customPrompt,
            diffLabel,
            generationPlan: config.generationPlan,
          }),
          generationPlan: config.generationPlan,
          logPrefix: "WORKBENCH-AUTO-GEN-PLAN",
          maxTokens: 4_096,
        });
        planningMs = Date.now() - planningStartedAt;
        plan = planResult.plan;
        rationale = planResult.rationale;
      } else {
        plan = buildManualPlan(config);
      }

      const generationStartedAt = Date.now();
      const generationResult = await runQuestionGenerationWithEmptyRetry(
        {
          plan,
          schoolType,
          gradeInfo,
          passageContent: job.passage.content,
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
        {
          logPrefix: "WORKBENCH-Q-GEN",
          maxAttempts: GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,
        },
      );
      const questions = generationResult.questions;
      generationAttempts = generationResult.attempts;
      generationMs = Date.now() - generationStartedAt;

      if (questions.length === 0) {
        throw new Error("No questions generated.");
      }

      const questionsForDisplay = questions.map((question) => {
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

      const persistenceStartedAt = Date.now();
      const createdQuestionIds = await saveGeneratedQuestionsForJob({
        academyId: job.academyId,
        passageId: job.passage.id,
        questions: questionsForDisplay,
        generationPlan: config.generationPlan,
        skipPassageEligibilityCheck: true,
      });
      persistenceMs = Date.now() - persistenceStartedAt;
      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: now.getTime() - job.createdAt.getTime(),
        creditMs,
        planningMs,
        generationAttempts,
        generationMs,
        persistenceMs,
        totalRunMs: Date.now() - taskStartedAt,
      };

      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          successCount: questions.length,
          failedCount: 0,
          resultCount: questions.length,
          result: JSON.parse(JSON.stringify({
            passageId: job.passage.id,
            questions: questionsForDisplay,
            questionIds: createdQuestionIds,
            rationale,
            generationPlan: config.generationPlan,
            debugTiming,
          })),
          completedAt,
        },
      });

      logger.info("question generation job completed", {
        jobId,
        passageId: job.passage.id,
        count: questions.length,
        debugTiming,
      });

      return { success: true as const, count: questions.length };
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        await prisma.workbenchAiJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
            completedAt: new Date(),
          },
        });
        return { error: "INSUFFICIENT_CREDITS" as const };
      }

      if (creditTxId) {
        await refundCredits(
          job.academyId,
          operationType,
          creditTxId,
          "Workbench question generation failed",
          creditCost,
        ).catch((refundErr) => {
          logger.error("question generation refund failed", {
            jobId,
            error: String(refundErr),
          });
        });
      }

      const message =
        err instanceof Error ? err.message : "Question generation failed.";
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: message,
          completedAt: new Date(),
        },
      });

      logger.error("question generation job failed", { jobId, error: message });
      throw err;
    }
  },
});
