import { logger, task } from "@trigger.dev/sdk/v3";

import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import {
  WORKBENCH_PASSAGE_ANALYSIS_QUEUE_CONCURRENCY,
  WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
  WORKBENCH_PASSAGE_ANALYSIS_TRIGGER_MAX_ATTEMPTS,
} from "@/lib/concurrency-config";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import { hashContent } from "@/lib/passage-utils";
import {
  providerFromModel,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  DEFAULT_ANALYSIS_TONE,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import { prisma } from "@/lib/prisma";
import {
  getQuestionGenerationCreditCost,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { loadPersistedAnnotations } from "@/app/api/ai/passage-analysis/[passageId]/_lib/annotations";
import { classifyAnalysisError } from "@/app/api/ai/passage-analysis/[passageId]/_lib/error-classification";
import { generateAnalysisReport } from "@/lib/passage-report/analysis-report/generate";
import { derivePassageAnalysisFromReport } from "@/lib/passage-report/analysis-report/derive-legacy";

type Input = { jobId: string };

interface AnalysisJobConfig {
  customPrompt?: string;
  focusAreas?: string[];
  targetLevel?: string;
  generationPlan?: QuestionGenerationPlan;
  analysisTone?: AnalysisTone;
  forcePrimeReport?: boolean;
}

function getAnalysisGenerationPlan(value: unknown): QuestionGenerationPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._generationPlan;
  return raw === "PREMIUM" || raw === "STANDARD" ? raw : null;
}

function getAnalysisTone(value: unknown): AnalysisTone | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._analysisTone;
  return typeof raw === "string" ? normalizeAnalysisTone(raw) : null;
}

function shouldUseCachedAnalysis(
  cached: unknown,
  requestedPlan: QuestionGenerationPlan,
  requestedTone: AnalysisTone,
): boolean {
  const cachedPlan = getAnalysisGenerationPlan(cached);
  const cachedTone = getAnalysisTone(cached);
  if (cachedTone && cachedTone !== requestedTone) return false;
  if (!cachedTone && requestedTone !== DEFAULT_ANALYSIS_TONE) return false;
  if (requestedPlan === "PREMIUM") return cachedPlan === "PREMIUM";
  return true;
}

function parseConfig(value: unknown): AnalysisJobConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    customPrompt:
      typeof raw.customPrompt === "string" ? raw.customPrompt : undefined,
    focusAreas: Array.isArray(raw.focusAreas)
      ? raw.focusAreas.filter((v): v is string => typeof v === "string")
      : [],
    targetLevel:
      typeof raw.targetLevel === "string" ? raw.targetLevel : undefined,
    generationPlan: normalizeQuestionGenerationPlan(raw.generationPlan),
    analysisTone: normalizeAnalysisTone(raw.analysisTone),
    forcePrimeReport: raw.forcePrimeReport === true,
  };
}

export const workbenchPassageAnalysisTask = task({
  id: "workbench-passage-analysis",
  queue: {
    name: WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
    concurrencyLimit: WORKBENCH_PASSAGE_ANALYSIS_QUEUE_CONCURRENCY,
  },
  retry: {
    maxAttempts: WORKBENCH_PASSAGE_ANALYSIS_TRIGGER_MAX_ATTEMPTS,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  maxDuration: 300,
  async run(payload: Input, { ctx }) {
    const { jobId } = payload;
    const now = new Date();
    const taskStartedAt = Date.now();
    let creditMs = 0;
    let generationMs = 0;
    let generationStartedAt: number | null = null;
    let persistenceMs = 0;

    const job = await prisma.workbenchAiJob.findUnique({
      where: { id: jobId },
      include: {
        passage: {
          include: {
            analysis: true,
            school: { select: { type: true } },
          },
        },
      },
    });

    if (!job || job.domain !== "PASSAGE_ANALYSIS") {
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

    const config = parseConfig(job.config);
    const generationPlan = normalizeQuestionGenerationPlan(
      config.generationPlan ?? job.generationPlan,
    );
    const analysisTone = normalizeAnalysisTone(config.analysisTone);
    const currentHash = hashContent(job.passage.content);

    await prisma.workbenchAiJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        startedAt: job.startedAt ?? now,
        triggerRunId: ctx.run.id,
      },
    });

    if (!config.forcePrimeReport && job.passage.analysis && job.passage.analysis.contentHash === currentHash) {
      const cachedAnalysis = JSON.parse(job.passage.analysis.analysisData);
      if (shouldUseCachedAnalysis(cachedAnalysis, generationPlan, analysisTone)) {
        const debugTiming = {
          queueWaitMs: now.getTime() - job.createdAt.getTime(),
          creditMs: 0,
          generationMs: 0,
          persistenceMs: 0,
          totalRunMs: Date.now() - taskStartedAt,
          cached: true,
          fastPath: false,
        };
        await prisma.workbenchAiJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            successCount: 1,
            failedCount: 0,
            resultCount: 1,
            result: {
              cached: true,
              passageId: job.passage.id,
              generationPlan,
              analysisTone,
              debugTiming,
              fastPath: false,
            },
            completedAt: new Date(),
          },
        });
        return { cached: true as const, passageId: job.passage.id };
      }
    }

    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS.PASSAGE_ANALYSIS,
      generationPlan,
    );
    let creditTxId: string | null = null;

    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType: "PASSAGE_ANALYSIS",
        metadata: {
          passageId: job.passage.id,
          generationPlan,
          analysisTone,
          creditCost,
        },
        creditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      creditTxId = credit.transactionId;

      const persistedAnns = await loadPersistedAnnotations(job.passage.id);
      const annotationPrompt =
        persistedAnns.length > 0 ? buildAnalysisPrompt("", persistedAnns) : "";
      const mergedPrompt = [annotationPrompt, config.customPrompt]
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .join("\n\n");

      generationStartedAt = Date.now();
      // PRIME A4 보고서를 단일 소스로 생성 (옛 5-layer 대체)
      const primeResult = await generateAnalysisReport({
        passageContent: job.passage.content,
        schoolType: (job.passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        grade: job.passage.grade,
        customPrompt: mergedPrompt || undefined,
      });
      generationMs = Date.now() - generationStartedAt;
      if (!primeResult.ok) {
        throw new Error(`PRIME 생성 실패: ${primeResult.error}`);
      }
      const usageEvent = primeResult.usage;
      if (usageEvent) {
        const usage = readAiUsageTokens(usageEvent.usage);
        await recordPlatformApiUsageCost({
          sourceKey: `workbench_ai_job:${jobId}:analysis`,
          sourceType: "WORKBENCH_AI_JOB",
          sourceId: jobId,
          sourceDetail: "PASSAGE_ANALYSIS",
          academyId: job.academyId,
          provider: providerFromModel(usageEvent.modelId),
          model: usageEvent.modelId,
          operationType: "PASSAGE_ANALYSIS",
          unitType: "TOKENS",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          usageAt: new Date(),
          metadata: {
            passageId: job.passage.id,
            generationPlan,
            durationMs: usageEvent.durationMs,
          },
        });
      }
      const primeReport = primeResult.report;
      const analysisData = derivePassageAnalysisFromReport(primeReport);

      const persistenceStartedAt = Date.now();
      await prisma.$transaction(async (tx) => {
        // 1) PRIME 보고서 저장/갱신 (모달 A4)
        const existingPrime = await tx.passageReport.findFirst({
          where: { passageId: job.passage!.id, academyId: job.academyId, generationPlan: "PRIME", deletedAt: null },
          select: { id: true },
        });
        const primeData = {
          title: primeReport.meta.titleKo,
          status: "PUBLISHED",
          pages: primeReport as never,
          theme: { themeId: primeReport.themeId } as never,
          templateId: "prime",
          generationPlan: "PRIME",
          lastEditedById: job.createdById,
          lastEditedAt: new Date(),
        };
        if (existingPrime) {
          await tx.passageReport.update({ where: { id: existingPrime.id }, data: { ...primeData, version: { increment: 1 } } });
        } else {
          await tx.passageReport.create({ data: { academyId: job.academyId, passageId: job.passage!.id, createdById: job.createdById, ...primeData } });
        }
        // 2) 파생 PassageAnalysis (카드/문제생성 호환)
        await tx.passageAnalysis.upsert({
          where: { passageId: job.passage!.id },
          update: {
            analysisData: JSON.stringify(analysisData),
            contentHash: currentHash,
            version: 1,
          },
          create: {
            passageId: job.passage!.id,
            analysisData: JSON.stringify(analysisData),
            contentHash: currentHash,
            version: 1,
          },
        });
        await tx.workbenchAiJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            successCount: 1,
            failedCount: 0,
            resultCount: 1,
            result: {
              cached: false,
              passageId: job.passage!.id,
              generationPlan,
              analysisTone,
            },
            completedAt: new Date(),
          },
        });
      });
      persistenceMs = Date.now() - persistenceStartedAt;

      const debugTiming = {
        queueWaitMs: now.getTime() - job.createdAt.getTime(),
        creditMs,
        generationMs,
        persistenceMs,
        totalRunMs: Date.now() - taskStartedAt,
        cached: false,
        fastPath: false,
      };

      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          result: {
            cached: false,
            passageId: job.passage!.id,
            generationPlan,
            analysisTone,
            debugTiming,
            fastPath: false,
          },
        },
      });

      logger.info("passage analysis job completed", {
        jobId,
        passageId: job.passage.id,
        generationPlan,
        analysisTone,
        debugTiming,
      });
      return { success: true as const, passageId: job.passage.id };
    } catch (err) {
      if (generationStartedAt !== null && generationMs === 0) {
        generationMs = Date.now() - generationStartedAt;
      }

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
          "PASSAGE_ANALYSIS",
          creditTxId,
          "Workbench passage analysis failed",
          creditCost,
        ).catch((refundErr) => {
          logger.error("passage analysis refund failed", {
            jobId,
            error: String(refundErr),
          });
        });
      }

      const classified = classifyAnalysisError(err);
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: classified.message,
          result: {
            debugTiming: {
              queueWaitMs: now.getTime() - job.createdAt.getTime(),
              creditMs,
              generationMs,
              persistenceMs,
              totalRunMs: Date.now() - taskStartedAt,
              fastPath: false,
            },
          },
          completedAt: new Date(),
        },
      });

      logger.error("passage analysis job failed", {
        jobId,
        error: classified.log,
      });
      throw err;
    }
  },
});
