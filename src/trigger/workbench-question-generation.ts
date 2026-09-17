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
  isKoreanSubject,
  readKoKindFromTags,
} from "@/lib/korean/core/passage-meta";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import {
  providerFromModel,
  readAiUsageCost,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import { toUserFacingQuestionGenerationError } from "@/lib/question-generation-llm";
import { preflightQuestionFeasibility } from "@/lib/question-quality";
import {
  getQuestionGenerationCreditCost,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  resolveEffectiveGenerationPlan,
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
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import {
  closeQuestionGenerationAssignmentBudget,
  runWithQuestionGenerationAssignmentBudget,
} from "@/lib/question-generation-assignment-budget";
import { isQuestionGenerationAssignmentBudgetError } from "@/lib/atlas-production-assignment-fetch-boundary";
import { type PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import {
  readQuestionTypeDifficultySetting,
} from "@/lib/question-type-generation-settings";

type Input = { jobId: string };

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

interface QuestionJobConfig {
  mode: "MANUAL";
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
  return {
    mode: "MANUAL" as const,
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
    const planningMs = 0;
    let generationMs = 0;
    let persistenceMs = 0;
    let generationAttempts = 0;
    let generationRejectionSummary: unknown = null;

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
    const passage = job.passage;
    const config = parseConfig(job.config, job.generationPlan);
    const effectiveDifficulty =
      config.mode === "MANUAL" && config.questionType
        ? readQuestionTypeDifficultySetting(
            config.questionTypeSettings,
            config.difficulty,
          )
        : readQuestionTypeDifficultySetting(undefined, config.difficulty);
    // 26-08-18 난이도 기반 티어(결정 함수 단일 소스 — fast/async/단건 진입점과
    // 동일 규칙, 구버전 잡 재실행도 안전): KILLER → PREMIUM 2배.
    const effectiveGenerationPlan = resolveEffectiveGenerationPlan(
      config.generationPlan,
      effectiveDifficulty,
    );

    // ── SHIP-FIRST 사전 적합성 백스톱: 기계적 불가만 차감 전에 거른다(재시도 0).
    // sync/async 라우트가 이미 거르지만 직접 트리거·구버전 잡 방어용. 차감 전이라 환불 불필요. ──
    const feasibility = preflightQuestionFeasibility(
      config.questionType,
      effectiveDifficulty,
      job.passage.content,
    );
    if (!feasibility.ok) {
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: feasibility.error,
          completedAt: new Date(),
        },
      });
      return { error: "PREFLIGHT_INFEASIBLE" as const, code: feasibility.code };
    }

    const operationType = getOperationType(config);
    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS[operationType],
      effectiveGenerationPlan,
    );

    // Claim with a compare-and-set fence. A stale worker must never resurrect a
    // job that cleanup/cancellation/completion moved to a terminal state after
    // the snapshot above was read. The run id also excludes duplicate workers.
    const claimed = await prisma.workbenchAiJob.updateMany({
      where: {
        id: jobId,
        domain: "QUESTION_GENERATION",
        deletedAt: null,
        OR: [
          { status: "PENDING", triggerRunId: null },
          { status: "PENDING", triggerRunId: ctx.run.id },
          { status: "PROCESSING", triggerRunId: ctx.run.id },
        ],
      },
      data: {
        status: "PROCESSING",
        startedAt: job.startedAt ?? now,
        triggerRunId: ctx.run.id,
      },
    });
    if (claimed.count !== 1) {
      const current = await prisma.workbenchAiJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      return {
        skipped: true as const,
        reason: "JOB_NOT_CLAIMABLE",
        status: current?.status ?? "MISSING",
      };
    }

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
          generationPlan: effectiveGenerationPlan,
          difficulty: effectiveDifficulty,
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
      const diffLabel = effectiveDifficulty;
      const diffInstruction =
        DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE;

      // AUTO(플래너) 모드는 제거됨 — 항상 교사가 지정한 단일 유형으로 생성.
      const plan: PlanResult["plan"] = buildManualPlan(config);
      const rationale = "";

      const generationStartedAt = Date.now();
      const generationResult = await runWithQuestionGenerationAssignmentBudget(
        {
          jobId,
          route: "TRIGGER",
          generationPlan: effectiveGenerationPlan,
          questionType: config.questionType ?? "UNSPECIFIED",
          difficulty: effectiveDifficulty,
        },
        () => runQuestionGenerationWithEmptyRetry({
          plan,
          schoolType,
          gradeInfo,
          passageContent: passage.content,
          teacherIntentBlock,
          analysisContext,
          diffLabel,
          diffInstruction,
          generationPlan: effectiveGenerationPlan,
          customPrompt: config.customPrompt,
          typeSettings:
            config.mode === "MANUAL" && config.questionType
              ? { [config.questionType]: config.questionTypeSettings }
              : undefined,
          // KO(국어) 지문이면 갈래 태그를 전달 — KO_ 유형 생성 프롬프트·koContext
          // 에서만 소비되고, 영어 지문(null/ENGLISH)은 undefined 로 기존과 동일.
          koPassageKind: isKoreanSubject(passage.subject)
            ? (readKoKindFromTags(passage.tags) ?? undefined)
            : undefined,
        }, {
          logPrefix: "WORKBENCH-Q-GEN",
          maxAttempts: GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,
          // trigger maxDuration 600s. 540s 후엔 새 시도를 멈춰 강제종료(잡 고아
          // → 환불 누락)를 막고 catch 에서 정상 실패+환불로 흐르게 한다.
          deadlineAt: generationStartedAt + 540_000,
        }),
      );
      const questions = generationResult.questions;
      for (const [idx, event] of generationResult.usageEvents.entries()) {
        const usage = readAiUsageTokens(event.usage);
        const actualCost = readAiUsageCost(event.usage);
        await recordPlatformApiUsageCost({
          sourceKey: `workbench_ai_job:${jobId}:generation:${idx}`,
          sourceType: "WORKBENCH_AI_JOB",
          sourceId: jobId,
          sourceDetail: `QUESTION_GENERATION:${event.subType}`,
          academyId: job.academyId,
          provider: providerFromModel(event.modelId),
          model: event.modelId,
          operationType,
          unitType: "TOKENS",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          recordedCostUsd: actualCost.costUsd,
          usageAt: new Date(),
          metadata: {
            passageId: job.passage.id,
            generationPlan: event.generationPlan ?? effectiveGenerationPlan,
            difficulty: event.difficulty ?? diffLabel,
            qualityMode: event.qualityMode,
            attempts: event.attempts,
            durationMs: event.durationMs,
            ...(actualCost.generationId
              ? { generationId: actualCost.generationId }
              : {}),
          },
        });
      }
      generationAttempts = generationResult.attempts;
      generationMs = Date.now() - generationStartedAt;
      const relaxedFallback = generationResult.relaxedFallback;
      generationRejectionSummary = generationResult.rejectionSummary;

      if (questions.length === 0) {
        throw new Error(
          `No questions generated after ${generationAttempts} generation attempt${
            generationAttempts === 1 ? "" : "s"
          }. ${generationResult.rejectionSummary.message}`,
        );
      }

      const questionsForDisplay = questions.map((question) => {
        const questionPlan = normalizeQuestionGenerationPlan(
          question._generationPlan ?? effectiveGenerationPlan,
        );
        const tags = mergeQuestionGenerationPlanTag(
          readQuestionTags(question.tags),
          questionPlan,
        );
        return {
          ...question,
          _generationPlan: questionPlan,
          tags,
        };
      });

      const persistenceStartedAt = Date.now();
      const createdQuestionIds = await saveGeneratedQuestionsForJob({
        academyId: job.academyId,
        passageId: job.passage.id,
        questions: questionsForDisplay,
        generationPlan: effectiveGenerationPlan,
        skipPassageEligibilityCheck: true,
      });
      persistenceMs = Date.now() - persistenceStartedAt;
      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: now.getTime() - job.createdAt.getTime(),
        creditMs,
        planningMs,
        generationAttempts,
        relaxedFallback: relaxedFallback ? 1 : 0,
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
            generationPlan: effectiveGenerationPlan,
            debugTiming,
          })),
          completedAt,
        },
      });
      await closeQuestionGenerationAssignmentBudget(jobId).catch(() => undefined);

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
          errorMessage: toUserFacingQuestionGenerationError(message),
          result: JSON.parse(JSON.stringify({
            passageId: job.passage?.id,
            generationPlan: effectiveGenerationPlan,
            difficulty: effectiveDifficulty,
            rawError: message,
            debugTiming: {
              queueWaitMs: now.getTime() - job.createdAt.getTime(),
              creditMs,
              planningMs,
              generationAttempts,
              generationMs,
              persistenceMs,
              totalRunMs: Date.now() - taskStartedAt,
            },
            rejectionSummary: generationRejectionSummary,
          })),
          completedAt: new Date(),
        },
      });
      await closeQuestionGenerationAssignmentBudget(jobId).catch(() => undefined);

      logger.error("question generation job failed", { jobId, error: message });
      if (isQuestionGenerationAssignmentBudgetError(err)) {
        // The Workbench job is already terminal and refunded. Reporting a
        // handled task result avoids a pointless Trigger retry whose next
        // attempt would only observe FAILED and skip.
        return { error: "ASSIGNMENT_BUDGET_REJECTED" as const };
      }
      throw err;
    }
  },
});
